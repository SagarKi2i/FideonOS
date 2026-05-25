import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from config import settings

logger = logging.getLogger("uvicorn.error")

from routers import auth, chat, devices, workflows, agents, approvals, training, governance, settings as settings_router, admin, mcp, help, workflow_ai, demo, agent_runs, dashboard
from services.supabase import is_missing_table_error

app = FastAPI(title="Fideon OS API", version="1.0.0")

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


@app.exception_handler(Exception)
async def _missing_table_handler(request: Request, exc: Exception):
    """Any query against a not-yet-provisioned table returns 501 instead of a hard 500.
    These tables are tracked in backend/docs/pending_tables.md / ALIGNMENT_AND_REMAINING_WORK.md.
    FastAPI's own HTTPException handler takes precedence, so this only catches unhandled errors.
    """
    if is_missing_table_error(exc):
        return JSONResponse(
            status_code=501,
            content={"detail": "This feature is not provisioned yet (database table missing)."},
        )
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
