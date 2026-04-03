"""Supabase client singleton for repair service."""

import os
from supabase import create_client, Client

_client: Client | None = None


def get_supabase() -> Client:
    """Get or create Supabase service-role client.

    Raises:
        RuntimeError: If SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing
    """
    global _client

    if _client is None:
        url = os.getenv("SUPABASE_URL", "")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
            )

        _client = create_client(url, key)

    return _client
