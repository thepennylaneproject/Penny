"""Repair job endpoints."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from config import get_settings
from db.supabase_client import get_supabase_client
from models import (
    ConfidenceBreakdown,
    RepairJobRequest,
    RepairJobResponse,
    RepairJobStatus,
    RepairStatus,
)

router = APIRouter()
settings = get_settings()


@router.post("", response_model=RepairJobResponse, status_code=status.HTTP_201_CREATED)
async def create_repair_job(request: RepairJobRequest) -> RepairJobResponse:
    """
    Submit a repair job.

    Returns a repair_job_id that can be used to monitor progress.
    """
    # Validate request
    if not request.run_id or not request.finding_id or not request.project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing required fields: run_id, finding_id, project_id",
        )

    if not request.repair_config.timeout_seconds or not (
        settings.MIN_REPAIR_TIMEOUT_SECONDS
        <= request.repair_config.timeout_seconds
        <= settings.MAX_REPAIR_TIMEOUT_SECONDS
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"timeout_seconds must be between {settings.MIN_REPAIR_TIMEOUT_SECONDS} and {settings.MAX_REPAIR_TIMEOUT_SECONDS}",
        )

    # Check concurrency limits
    supabase_client = get_supabase_client()
    concurrent_count = await supabase_client.check_concurrent_repairs(request.project_id)
    if concurrent_count >= settings.MAX_CONCURRENT_REPAIRS_PER_REPO:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Max concurrent repairs ({settings.MAX_CONCURRENT_REPAIRS_PER_REPO}) reached for project",
        )

    # Create repair job in Supabase
    try:
        job_id = await supabase_client.create_repair_job(
            run_id=request.run_id,
            finding_id=request.finding_id,
            project_id=request.project_id,
            file_path=request.file_path,
            finding_type=request.finding_type,
            finding_severity=request.finding_severity,
            language=request.repair_config.language,
            beam_width=request.repair_config.beam_width,
            max_depth=request.repair_config.max_depth,
            timeout_seconds=request.repair_config.timeout_seconds,
            validation_commands=request.repair_config.validation_commands,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create repair job: {str(e)}",
        )

    # Estimate completion time (rough estimate: 2 seconds per depth level per beam width)
    estimated_ms = (
        request.repair_config.beam_width * request.repair_config.max_depth * 2000
    )

    return RepairJobResponse(
        repair_job_id=job_id,
        status=RepairStatus.QUEUED,
        created_at=datetime.utcnow(),
        estimated_completion_ms=estimated_ms,
    )


@router.get("/{repair_job_id}", response_model=RepairJobStatus)
async def get_repair_job(repair_job_id: UUID) -> RepairJobStatus:
    """
    Get repair job status and candidates.

    Returns full status including:
    - Current job status (queued, in_progress, completed, failed)
    - Confidence score and breakdown
    - List of candidate patches with scores
    - Best candidate so far
    - PR link if created
    """
    supabase_client = get_supabase_client()

    # Fetch repair job
    try:
        job = await supabase_client.get_repair_job(repair_job_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch repair job: {str(e)}",
        )

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Repair job {repair_job_id} not found",
        )

    # Fetch repair candidates
    try:
        candidates = await supabase_client.get_repair_candidates(repair_job_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch repair candidates: {str(e)}",
        )

    # Build response
    confidence_breakdown = None
    if job.get("confidence_breakdown"):
        bd = job["confidence_breakdown"]
        confidence_breakdown = ConfidenceBreakdown(
            validation=bd.get("validation", 0),
            locality=bd.get("locality", 0),
            risk=bd.get("risk", 0),
            uncertainty_penalty=bd.get("uncertainty_penalty", 0),
        )

    return RepairJobStatus(
        repair_job_id=UUID(job["id"]),
        finding_id=job["finding_id"],
        project_id=UUID(job["project_id"]),
        status=RepairStatus(job["status"]),
        confidence_score=job.get("confidence_score"),
        confidence_breakdown=confidence_breakdown,
        action=job.get("action"),
        best_candidate_id=UUID(job["best_candidate_id"]) if job.get("best_candidate_id") else None,
        best_score=job.get("best_score"),
        candidates=[
            {
                "id": c["id"],
                "depth": c["depth"],
                "score": c["score"],
                "validation_results": c.get("validation_results"),
            }
            for c in candidates
        ],
        pr_id=UUID(job["pr_id"]) if job.get("pr_id") else None,
        pr_number=job.get("pr_number"),
        pr_url=job.get("pr_url"),
        error_message=job.get("error_message"),
        created_at=datetime.fromisoformat(job["created_at"]),
        started_at=datetime.fromisoformat(job["started_at"]) if job.get("started_at") else None,
        completed_at=datetime.fromisoformat(job["completed_at"]) if job.get("completed_at") else None,
    )


@router.get("")
async def list_repair_jobs(
    run_id: UUID | None = None,
    status: RepairStatus | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    List repair jobs with optional filtering.

    Returns paginated list of repair jobs.
    """
    supabase_client = get_supabase_client()

    try:
        jobs, total_count = await supabase_client.list_repair_jobs(
            run_id=run_id,
            status=status.value if status else None,
            limit=limit,
            offset=offset,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch repair jobs: {str(e)}",
        )

    return {
        "items": [
            {
                "repair_job_id": UUID(j["id"]),
                "finding_id": j["finding_id"],
                "project_id": UUID(j["project_id"]),
                "status": j["status"],
                "confidence_score": j.get("confidence_score"),
                "best_score": j.get("best_score"),
                "created_at": datetime.fromisoformat(j["created_at"]),
                "completed_at": datetime.fromisoformat(j["completed_at"])
                if j.get("completed_at")
                else None,
            }
            for j in jobs
        ],
        "total": total_count,
        "limit": limit,
        "offset": offset,
    }


@router.post("/{repair_job_id}/run")
async def run_repair_job(
    repair_job_id: UUID,
    repo_path: str,
    code_context: str,
):
    """
    Run the repair orchestration for a job.

    Triggers the beam search, evaluation, and action routing.
    This is called by the worker when a job is ready to process.

    Args:
        repair_job_id: The repair job ID
        repo_path: Path to the repository
        code_context: Code context for the finding

    Returns:
        Job status after orchestration
    """
    from services.repair_orchestrator import RepairOrchestrator

    orchestrator = RepairOrchestrator(repair_job_id)

    try:
        result = await orchestrator.run(repo_path, code_context)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Repair execution failed: {str(e)}",
        )


@router.post("/{repair_job_id}/create-pr")
async def create_pr_from_repair(
    repair_job_id: UUID,
    candidate_id: UUID,
    branch_name: str,
    create_draft: bool = True,
):
    """
    Create GitHub PR from a repair candidate.

    Returns PR details (number, URL, branch).
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Endpoint implementation pending Phase 3.4",
    )
