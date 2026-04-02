"""Health check endpoint."""

from fastapi import APIRouter

from models import HealthCheckResponse

router = APIRouter()


@router.get("/health", response_model=HealthCheckResponse)
async def health_check() -> HealthCheckResponse:
    """Health check endpoint for monitoring."""
    # TODO: Check Supabase connectivity
    # TODO: Check Docker availability
    # TODO: Check GitHub token validity
    # TODO: Check queue size

    return HealthCheckResponse(
        status="healthy",
        docker_available=True,
        supabase_connected=True,
        github_token_valid=True,
        queue_size=0,
    )
