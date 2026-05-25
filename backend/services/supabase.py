from supabase import create_client, Client
from config import settings

# ── PostgREST 204 compatibility shim ───────────────────────────────────────────
# postgrest-py 0.17.2's .maybe_single() is written for hosted Supabase, which
# returns an APIError ("The result contains 0 rows") when no row matches. Our
# self-hosted PostgREST instead returns HTTP 204 (empty body), which the library
# mishandles — execute() returns None (or raises a confusing "Missing response
# 204" APIError) instead of a response with data=None. Every `.maybe_single()`
# call site across the codebase assumes `.data` exists, so without this they all
# raise AttributeError on a legitimate no-match. Patch the behaviour once, here,
# so a zero-row result uniformly yields a response object with data=None.
def _install_maybe_single_shim() -> None:
    from postgrest._sync.request_builder import SyncMaybeSingleRequestBuilder

    class _EmptyResponse:
        """Duck-typed stand-in for a zero-row SingleAPIResponse."""
        data = None
        count = None

    _orig_execute = SyncMaybeSingleRequestBuilder.execute

    def _execute(self):
        try:
            result = _orig_execute(self)
        except Exception as exc:  # noqa: BLE001
            # The library's own "Missing response / 204" sentinel for an empty body.
            if getattr(exc, "code", None) == "204":
                return _EmptyResponse()
            raise
        return result if result is not None else _EmptyResponse()

    SyncMaybeSingleRequestBuilder.execute = _execute


_install_maybe_single_shim()

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return _client


def is_missing_table_error(exc: Exception) -> bool:
    """True if exc is a PostgREST 'relation does not exist' (undefined_table, 42P01).

    Used to fail gracefully for tables whose schema is owned by a separate
    workstream and not yet created — see backend/docs/pending_tables.md.
    """
    code = getattr(exc, "code", None)
    if code == "42P01":
        return True
    msg = str(getattr(exc, "message", "") or exc).lower()
    return "does not exist" in msg or "could not find the table" in msg


def is_transient_upstream_error(exc: Exception) -> bool:
    """True if exc looks like a momentary gateway/PostgREST hiccup, not a real
    query error.

    The self-hosted stack sits behind Kong. When the gateway returns a plaintext
    '400 Bad request' (connection reset, brief restart, gateway timeout), the
    postgrest client can't parse the non-JSON body and rewraps it as the generic
    'JSON could not be generated' (code 400). Same query succeeds on retry, so
    callers should surface a retryable 503 instead of a hard 500.
    """
    msg = str(getattr(exc, "message", "") or "").lower()
    if "json could not be generated" in msg:
        return True
    code = getattr(exc, "code", None)
    details = str(getattr(exc, "details", "") or "").lower()
    return str(code) == "400" and "bad request" in (msg + " " + details)
