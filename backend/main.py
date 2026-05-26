import asyncio
import logging
import sys

# Windows: uvicorn defaults to SelectorEventLoop which can't spawn subprocesses,
# so Playwright fails to launch chromium for doc-retrieval. Set the proactor
# loop BEFORE any async runtime is created. No-op on macOS/Linux.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from config import settings
from services.observability.logging import configure_logging

# Configure structured logging before anything else logs. Idempotent.
configure_logging(settings.environment)

logger = logging.getLogger("uvicorn.error")

# pyrefly: ignore [missing-import]
from postgrest.exceptions import APIError

from routers import auth, chat, devices, workflows, agents, approvals, training, governance, settings as settings_router, admin, mcp, help, workflow_ai, demo, agent_runs, dashboard
from services.supabase import is_missing_table_error, is_transient_upstream_error

app = FastAPI(title="Fideon OS API", version="1.0.0")


@app.on_event("startup")
async def _log_event_loop() -> None:
    """Diagnostic: emit which event loop class is running. On Windows, this
    must be ProactorEventLoop for Playwright to be able to spawn chromium."""
    import asyncio as _asyncio
    logger.info("event loop class: %s", type(_asyncio.get_event_loop()).__name__)

# Dev: allow localhost on any port. Production: only the deployed frontend URL.
_dev_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
]
_allowed_origins = (
    _dev_origins if settings.environment == "development"
    else [settings.frontend_url]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Screen-Res", "X-Timezone"],
)


@app.exception_handler(APIError)
async def _postgrest_error_handler(request: Request, exc: APIError):
    """Classify PostgREST/gateway errors into meaningful HTTP responses.

    Registered for APIError specifically (not the base Exception) so Starlette's
    inner ExceptionMiddleware handles it and returns cleanly — the base-Exception
    handler runs in the outer ServerErrorMiddleware, which re-raises afterward and
    (via the BaseHTTPMiddleware below) logs the traceback twice.
    """
    if is_missing_table_error(exc):
        # Table owned by a separate workstream, not yet created.
        # See backend/docs/pending_tables.md / ALIGNMENT_AND_REMAINING_WORK.md.
        return JSONResponse(
            status_code=501,
            content={"detail": "This feature is not provisioned yet (database table missing)."},
        )
    if is_transient_upstream_error(exc):
        # Momentary gateway/connection blip — retryable, not an app bug.
        # One clean warning line instead of a full traceback.
        logger.warning(
            "Transient upstream error on %s %s: %s",
            request.method, request.url.path, exc,
        )
        return JSONResponse(
            status_code=503,
            content={"detail": "The service is temporarily unavailable. Please retry."},
        )
    logger.exception("PostgREST error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.exception_handler(Exception)
async def _unhandled_error_handler(request: Request, exc: Exception):
    """Fallback for any non-APIError unhandled exception."""
    # Return (don't re-raise) so the response flows back through CORSMiddleware
    # and carries Access-Control-Allow-Origin. Re-raising produces a 500 above
    # the CORS layer, which the browser then mislabels as a CORS error and hides
    # the real failure.
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.middleware("http")
async def enforce_https_in_production(request: Request, call_next):
    """Reject plain HTTP requests on production. Azure sets X-Forwarded-Proto."""
    if settings.environment == "production":
        proto = request.headers.get("x-forwarded-proto", "https")
        if proto != "https":
            return JSONResponse(
                status_code=301,
                headers={"Location": str(request.url).replace("http://", "https://", 1)},
            )
    return await call_next(request)

app.include_router(auth.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(devices.router, prefix="/api")
app.include_router(workflows.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(approvals.router, prefix="/api")
app.include_router(training.router, prefix="/api")
app.include_router(governance.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(mcp.router, prefix="/api")
app.include_router(help.router, prefix="/api")
app.include_router(workflow_ai.router, prefix="/api")
app.include_router(demo.router, prefix="/api")
app.include_router(agent_runs.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "fideon-os-api",
        "environment": settings.environment,
    }
