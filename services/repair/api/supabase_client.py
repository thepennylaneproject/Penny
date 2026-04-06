"""Supabase client singleton for repair service."""

import os
from typing import Any
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


def insert_repair_costs(
    client: Client,
    repair_job_id: str,
    usage_records: list[dict[str, Any]],
) -> None:
    """Persist repair LLM cost usage rows for a repair job."""
    rows: list[dict[str, Any]] = []
    for record in usage_records:
        model = str(record.get("model", "")).strip()
        if not model:
            continue
        rows.append(
            {
                "repair_job_id": repair_job_id,
                "model": model,
                "input_tokens": int(record.get("input_tokens", 0) or 0),
                "output_tokens": int(record.get("output_tokens", 0) or 0),
                "cost_usd": float(record.get("cost_usd", 0) or 0),
                "usage_type": str(record.get("task_type", "patch_generation")),
            }
        )

    if rows:
        client.table("repair_costs").insert(rows).execute()
