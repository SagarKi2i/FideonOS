from pathlib import Path

# pyrefly: ignore [missing-import]
from pydantic_settings import (
    BaseSettings,
    JsonConfigSettingsSource,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)

# Paths resolved relative to this file so config loads regardless of the cwd
# uvicorn is launched from.
_BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    environment: str = "development"   # "development" | "production"
    # Optional: the platform is moving to a self-hosted SLM (no external AI), so the
    # backend boots without an Anthropic key. The chat / workflow-ai endpoints that
    # call services/anthropic.py will 401 at call time until a key is set or the SLM
    # swap lands; every other endpoint runs normally. The client is built lazily
    # (services/anthropic.py:get_anthropic), so an empty key never breaks startup.
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    anthropic_max_tokens: int = 4096
    frontend_url: str = "http://localhost:3000"

    # Auth cookie cross-site behavior.
    # The frontend and API are on DIFFERENT sites in every deployed env
    # (frontend on *.azurewebsites.net, API behind APIM on *.azure-api.net), so the
    # auth cookies are cross-site and MUST be SameSite=None; Secure — otherwise the
    # browser drops the cookie on the /auth/me fetch right after login and the user
    # is bounced back to the sign-in page. localhost is a secure context, so Secure
    # cookies also work for same-site local dev. Override via .env only if you run a
    # same-site local setup that needs plain-http cookies (cookie_samesite="lax").
    cookie_samesite: str = "none"   # "none" | "lax" | "strict"
    cookie_secure: bool = True

    # RS256 JWT keys.
    # In production (Azure / GitHub Actions) the PEM files are not committed.
    # Provide the base64-encoded PEM contents via env instead; these take
    # priority over the *_path values when set. Locally, leave the *_b64 vars
    # empty and the loader falls back to reading the files at *_path.
    jwt_private_key_path: str = "backend/keys/private.pem"
    jwt_public_key_path: str = "backend/keys/public.pem"
    jwt_private_key_b64: str = ""
    jwt_public_key_b64: str = ""

    # Resend
    resend_api_key: str = ""
    email_from: str = "Fideon OS <noreply@fideonai.fyi>"

    # --- Tunable policy (default source: settings.json; override via .env) ---
    # Token expiry
    jwt_access_expiry_minutes: int = 15
    jwt_refresh_expiry_days: int = 7
    invite_expiry_hours: int = 48
    otp_expiry_minutes: int = 10
    password_reset_expiry_minutes: int = 15

    # OTP rate limits
    otp_resend_limit: int = 3
    otp_rate_window_requests: int = 5
    otp_rate_window_minutes: int = 60

    # Login rate limits (per IP and per email). Three independent windows guard
    # /auth/login. Bump these in dev so active testing doesn't trip the per-hour
    # caps; keep them tight in production. NB: separate from account lockout
    # (5 wrong passwords → 30-min lock), which is unaffected by these.
    login_rate_per_minute: int = 10          # per IP, 60s window
    login_rate_ip_per_hour: int = 5          # per IP, 3600s window
    login_rate_email_per_hour: int = 5       # per email, 3600s window

    # OTP bypass — comma-separated emails that skip the OTP step on login.
    # TESTING ONLY (e.g. a seeded admin on a fake email). Leave empty in production.
    # All other users still go through the normal OTP flow.
    otp_bypass_emails: str = ""

    @property
    def otp_bypass_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.otp_bypass_emails.split(",") if e.strip()}

    # Geo anomaly detection
    geo_anomaly_threshold_minutes: int = 60

    # Valkey
    valkey_url: str = "valkey://localhost:6379"

    # Doc Retrieval storage backend: "supabase" (prod/staging) or "json"
    # (local dev fallback when Supabase isn't reachable). The JSON backend
    # persists run rows and the carriers/ams_targets registry to
    # `backend/.run_store/`. Switch to "supabase" once the migration has been
    # applied AND the SUPABASE_URL/SERVICE_ROLE_KEY point at the right env.
    doc_retrieval_storage_backend: str = "json"

    # Azure Blob storage for downloaded carrier docs. When the connection
    # string is empty, downloads stay on local FS (preserves offline dev).
    # See backend/services/storage/azure_blob.py for the upload path.
    azure_blob_connection_string: str = ""
    azure_blob_container: str = "doc-retrieval-runs"

    model_config = SettingsConfigDict(
        env_file=str(_BASE_DIR / ".env"),
        json_file=str(_BASE_DIR / "settings.json"),
        extra="ignore",  # ignore settings.json's "_comment" key
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        # Priority high → low. settings.json sits below env/.env, so any value
        # also present in the environment or .env overrides the JSON default.
        return (
            init_settings,
            env_settings,
            dotenv_settings,
            JsonConfigSettingsSource(settings_cls),
            file_secret_settings,
        )


settings = Settings()
