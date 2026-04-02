"""Health check endpoint."""

import subprocess
from typing import Any

from fastapi import APIRouter, status

from config import get_settings
from db.supabase_client import get_supabase_client
from models import HealthCheckResponse

router = APIRouter()


@router.get("/health", response_model=HealthCheckResponse, status_code=status.HTTP_200_OK)
async def health_check() -> HealthCheckResponse:
    """Health check endpoint for monitoring."""
    settings = get_settings()
    supabase_client = get_supabase_client()

    # Check Supabase connectivity
    supabase_connected = False
    try:
        response = supabase_client.client.table("repair_jobs").select("id", count="exact").limit(1).execute()
        supabase_connected = response.count is not None
    except Exception as e:
        print(f"[health-check] Supabase check failed: {e}")

    # Check Docker availability
    docker_available = False
    try:
        result = subprocess.run(
            ["docker", "ps"],
            capture_output=True,
            timeout=5,
            check=False,
        )
        docker_available = result.returncode == 0
    except Exception as e:
        print(f"[health-check] Docker check failed: {e}")

    # Check GitHub token validity
    github_token_valid = bool(settings.GITHUB_TOKEN)

    # Check queue size (count of queued + in_progress jobs)
    queue_size = 0
    try:
        response = (
            supabase_client.client.table("repair_jobs")
            .select("id", count="exact")
            .in_("status", ["queued", "in_progress"])
            .execute()
        )
        queue_size = response.count or 0
    except Exception as e:
        print(f"[health-check] Queue size check failed: {e}")

    return HealthCheckResponse(
        status="healthy" if (supabase_connected and docker_available) else "degraded",
        docker_available=docker_available,
        supabase_connected=supabase_connected,
        github_token_valid=github_token_valid,
        queue_size=queue_size,
    )
