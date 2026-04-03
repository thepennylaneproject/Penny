"""Authentication middleware for repair service."""

import os
from fastapi import HTTPException, Header


async def require_auth(authorization: str = Header(...)) -> None:
    """Validate Bearer token against REPAIR_SERVICE_SECRET.

    Args:
        authorization: Authorization header value (e.g., "Bearer <token>")

    Raises:
        HTTPException: 401 if token is invalid or missing
    """
    secret = os.getenv("REPAIR_SERVICE_SECRET", "")

    if not secret:
        raise HTTPException(
            status_code=503,
            detail="Service not properly configured (missing REPAIR_SERVICE_SECRET)"
        )

    scheme, _, token = authorization.partition(" ")

    if scheme.lower() != "bearer" or token != secret:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized"
        )
