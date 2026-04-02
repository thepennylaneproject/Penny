"""Supabase client for Penny Repair Service."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from supabase import create_client
from supabase.lib.client_options import ClientOptions

from config import get_settings


class SupabaseClient:
    """Supabase database client."""

    def __init__(self):
        """Initialize Supabase client."""
        settings = get_settings()

        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
            raise ValueError("Supabase credentials not configured")

        options = ClientOptions(
            postgrest_client_timeout=10,
            storage_client_timeout=10,
            realtime={"timeout": 10000},
        )

        self.client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY,
            options=options,
        )

    async def create_repair_job(
        self,
        run_id: UUID,
        finding_id: str,
        project_id: UUID,
        file_path: str,
        finding_type: str,
        finding_severity: str,
        language: str,
        beam_width: int,
        max_depth: int,
        timeout_seconds: int,
        validation_commands: list[str],
        created_by: Optional[UUID] = None,
    ) -> UUID:
        """Create a new repair job."""
        data = {
            "run_id": str(run_id),
            "finding_id": finding_id,
            "project_id": str(project_id),
            "file_path": file_path,
            "finding_type": finding_type,
            "finding_severity": finding_severity,
            "language": language,
            "status": "queued",
            "beam_width": beam_width,
            "max_depth": max_depth,
            "timeout_seconds": timeout_seconds,
            "validation_commands": validation_commands,
            "created_by": str(created_by) if created_by else None,
        }

        response = self.client.table("repair_jobs").insert(data).execute()

        if response.data:
            return UUID(response.data[0]["id"])
        else:
            raise ValueError("Failed to create repair job")

    async def get_repair_job(self, job_id: UUID) -> Optional[dict[str, Any]]:
        """Fetch repair job by ID."""
        response = self.client.table("repair_jobs").select("*").eq("id", str(job_id)).execute()

        if response.data:
            return response.data[0]
        return None

    async def update_repair_job(
        self,
        job_id: UUID,
        updates: dict[str, Any],
    ) -> dict[str, Any]:
        """Update repair job."""
        response = self.client.table("repair_jobs").update(updates).eq("id", str(job_id)).execute()

        if response.data:
            return response.data[0]
        else:
            raise ValueError(f"Failed to update repair job {job_id}")

    async def get_repair_candidates(self, job_id: UUID) -> list[dict[str, Any]]:
        """Fetch repair candidates for a job."""
        response = (
            self.client.table("repair_candidates")
            .select("*")
            .eq("repair_job_id", str(job_id))
            .order("depth, sequence_number", desc=False)
            .execute()
        )

        return response.data or []

    async def create_repair_candidate(
        self,
        job_id: UUID,
        depth: int,
        sequence_number: int,
        patch_diff: str,
        score: float,
        validation_results: Optional[dict[str, Any]] = None,
        error_log: Optional[str] = None,
        parent_candidate_id: Optional[UUID] = None,
    ) -> UUID:
        """Create a repair candidate."""
        data = {
            "repair_job_id": str(job_id),
            "depth": depth,
            "sequence_number": sequence_number,
            "patch_diff": patch_diff,
            "score": score,
            "validation_results": validation_results,
            "error_log": error_log,
            "parent_candidate_id": str(parent_candidate_id) if parent_candidate_id else None,
        }

        response = self.client.table("repair_candidates").insert(data).execute()

        if response.data:
            return UUID(response.data[0]["id"])
        else:
            raise ValueError("Failed to create repair candidate")

    async def list_repair_jobs(
        self,
        project_id: Optional[UUID] = None,
        run_id: Optional[UUID] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        """List repair jobs with optional filtering and pagination."""
        query = self.client.table("repair_jobs").select("*", count="exact")

        if project_id:
            query = query.eq("project_id", str(project_id))
        if run_id:
            query = query.eq("run_id", str(run_id))
        if status:
            query = query.eq("status", status)

        response = (
            query.order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )

        total_count = response.count or 0
        return response.data or [], total_count

    async def create_repair_cost(
        self,
        job_id: UUID,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float,
        usage_type: str,
    ) -> UUID:
        """Track LLM cost for repair job."""
        data = {
            "repair_job_id": str(job_id),
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost_usd,
            "usage_type": usage_type,
        }

        response = self.client.table("repair_costs").insert(data).execute()

        if response.data:
            return UUID(response.data[0]["id"])
        else:
            raise ValueError("Failed to create repair cost")

    async def check_concurrent_repairs(self, project_id: UUID) -> int:
        """Check number of concurrent repairs for a project."""
        response = (
            self.client.table("repair_jobs")
            .select("id", count="exact")
            .eq("project_id", str(project_id))
            .in_("status", ["queued", "in_progress"])
            .execute()
        )

        return response.count or 0


# Singleton instance
_supabase_client: Optional[SupabaseClient] = None


def get_supabase_client() -> SupabaseClient:
    """Get or create Supabase client."""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = SupabaseClient()
    return _supabase_client
