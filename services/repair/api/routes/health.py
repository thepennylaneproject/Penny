"""Health check endpoint."""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    service: str


@router.get("/health")
async def health() -> HealthResponse:
    """Health check endpoint for Railway monitoring."""
    return HealthResponse(
        status="ok",
        service="repair"
    )
