"""Azure Blob storage wrapper for doc-retrieval downloads.

When `settings.azure_blob_connection_string` is set, downloaded PDFs are
uploaded to the container named by `settings.azure_blob_container` under the
key `runs/{run_id}/{filename}`. Returns the blob URL so callers can persist
it in `DownloadedDoc.local_path` (the field name is legacy — it's now either
a local FS path OR a blob URL depending on storage config).

When the connection string is empty, `is_enabled()` returns False and the
adapter falls back to the local FS path (preserves offline dev).

Idempotent: re-uploading the same key overwrites. SAS URLs are minted on
demand by `signed_url(...)` so the frontend can fetch through the same
account without holding an admin key.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog

from config import settings


log = structlog.get_logger("doc_retrieval.azure_blob")

_client = None  # lazy BlobServiceClient


def is_enabled() -> bool:
    return bool(settings.azure_blob_connection_string)


def _get_client():
    """Build the BlobServiceClient once. Import is lazy so the module loads
    cleanly when Azure isn't configured."""
    global _client
    if _client is not None:
        return _client
    if not is_enabled():
        raise RuntimeError("Azure Blob is not configured (AZURE_BLOB_CONNECTION_STRING is empty)")
    from azure.storage.blob.aio import BlobServiceClient
    _client = BlobServiceClient.from_connection_string(settings.azure_blob_connection_string)
    return _client


async def upload_run_blob(run_id: str, filename: str, data: bytes) -> str:
    """Upload `data` to `runs/{run_id}/{filename}` in the configured container
    and return the resulting blob URL. Container is created on first use."""
    client = _get_client()
    container_name = settings.azure_blob_container
    container = client.get_container_client(container_name)
    try:
        await container.create_container()
    except Exception:
        # Container already exists — Azure raises ResourceExistsError. The
        # blob SDK doesn't expose a clean "create if not exists" call, so we
        # swallow and continue. Any real auth/network error will surface on
        # the upload itself one line below.
        pass

    blob_name = f"runs/{run_id}/{filename}"
    blob = container.get_blob_client(blob_name)
    await blob.upload_blob(data, overwrite=True)
    log.info("blob_uploaded", run_id=run_id, blob_name=blob_name, size_bytes=len(data))
    return blob.url


def signed_url(blob_url: str, ttl_seconds: int = 3600) -> str:
    """Mint a short-lived SAS URL the frontend can fetch directly. Parses
    `blob_url` for account/container/blob path and re-signs with a read SAS."""
    if not is_enabled():
        # Local FS path; caller already has a usable filesystem path.
        return blob_url

    from azure.storage.blob import BlobSasPermissions, generate_blob_sas

    # Parse the canonical "https://{account}.blob.core.windows.net/{container}/{key}"
    parts = blob_url.split("/", 4)
    if len(parts) < 5 or "blob.core.windows.net" not in parts[2]:
        # Not a recognizable Azure URL — return as-is.
        return blob_url
    account = parts[2].split(".")[0]
    container = parts[3]
    key = parts[4]

    # Extract the account key from the connection string.
    conn = settings.azure_blob_connection_string
    account_key = ""
    for piece in conn.split(";"):
        if piece.startswith("AccountKey="):
            account_key = piece.split("=", 1)[1]
            break
    if not account_key:
        return blob_url

    sas = generate_blob_sas(
        account_name=account,
        container_name=container,
        blob_name=key,
        account_key=account_key,
        permission=BlobSasPermissions(read=True),
        expiry=datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds),
    )
    return f"{blob_url}?{sas}"


async def close() -> None:
    """Close the underlying client (for clean shutdown). Safe to call when
    the client was never instantiated."""
    global _client
    if _client is not None:
        await _client.close()
        _client = None
