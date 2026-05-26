"""Backend launcher.

On Windows, asyncio's default policy is SelectorEventLoop which can't run
subprocesses — so Playwright fails to launch chromium for doc-retrieval.
We must switch to ProactorEventLoopPolicy BEFORE uvicorn imports any module
that creates its loop. Setting the policy inside main.py is too late — uvicorn's
CLI entry already picks the loop based on the policy active at import time.

This wrapper is the new canonical way to run the backend in dev:

    python run_server.py

It also accepts the same env vars uvicorn does (HOST, PORT, etc.).
"""
from __future__ import annotations

import asyncio
import os
import sys


def main() -> int:
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    import uvicorn  # imported AFTER policy is set

    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    reload = os.environ.get("RELOAD") == "1"

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=reload,
        loop="asyncio",  # forces stdlib asyncio (which honours our policy)
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
