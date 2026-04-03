"""FastAPI entry point for Penny repair service."""

import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from repair_engine.config import EngineConfig
from repair_engine.orchestrator import RepairOrchestrator

from api.auth import require_auth
from api.routes import health, repair, config

_executor: ThreadPoolExecutor | None = None
_orchestrator: RepairOrchestrator | None = None


def get_orchestrator() -> RepairOrchestrator:
    """Get the initialized orchestrator instance."""
    if _orchestrator is None:
        raise RuntimeError("Orchestrator not initialized. Application may not have started properly.")
    return _orchestrator


def get_executor() -> ThreadPoolExecutor:
    """Get the initialized executor instance."""
    if _executor is None:
        raise RuntimeError("Executor not initialized. Application may not have started properly.")
    return _executor


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context manager for startup/shutdown."""
    global _executor, _orchestrator

    # Startup
    secret = os.getenv("REPAIR_SERVICE_SECRET", "")
    if not secret:
        raise RuntimeError(
            "REPAIR_SERVICE_SECRET environment variable must be set. "
            "Cannot start service without authentication configured."
        )

    try:
        config = EngineConfig()
        repo_root = os.getenv("REPO_ROOT", "/app")
        _orchestrator = RepairOrchestrator(repo_root, config)
        worker_threads = int(os.getenv("WORKER_THREADS", "4"))
        _executor = ThreadPoolExecutor(max_workers=worker_threads)
        print(f"✓ Repair orchestrator initialized (repo_root={repo_root})")
        print(f"✓ ThreadPoolExecutor initialized (max_workers={worker_threads})")
    except Exception as e:
        print(f"✗ Failed to initialize service: {e}")
        raise

    yield

    # Shutdown
    if _executor:
        _executor.shutdown(wait=False)
        print("✓ ThreadPoolExecutor shutdown complete")


app = FastAPI(
    title="Penny Repair Service",
    description="Automated code repair orchestrator",
    version="3.0.0",
    lifespan=lifespan,
)

# Register health router (no auth required)
app.include_router(health.router)

# Register repair router (requires auth)
app.include_router(
    repair.router,
    prefix="/repair",
    dependencies=[Depends(require_auth)],
)

# Register config router (requires auth)
app.include_router(
    config.router,
    prefix="/config",
    dependencies=[Depends(require_auth)],
)


@app.get("/")
async def root() -> dict:
    """Root endpoint."""
    return {
        "service": "penny-repair",
        "version": "3.0.0",
        "status": "running"
    }
