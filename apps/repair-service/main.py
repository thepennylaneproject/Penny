"""Penny Repair Service - FastAPI application."""

import os
import sys
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment
from dotenv import load_dotenv

load_dotenv()

from config import get_settings
from routes import health, jobs

# Initialize Sentry if configured
settings = get_settings()
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown logic."""
    # Startup
    print("[penny-repair-service] Starting up...")
    settings.validate()
    yield
    # Shutdown
    print("[penny-repair-service] Shutting down...")


# Create FastAPI app
app = FastAPI(
    title="Penny Repair Service",
    description="AI-powered patch generation and evaluation service",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware (for dashboard + worker)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(health.router, tags=["health"])
app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])


@app.get("/", tags=["root"])
async def root():
    """Root endpoint."""
    return {
        "service": "penny-repair-service",
        "version": "0.1.0",
        "status": "operational",
        "docs": "/docs",
        "health": "/health",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.SERVICE_PORT,
        reload=settings.DEBUG,
        log_level="info",
    )
