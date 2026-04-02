"""Repair job endpoints."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from models import (
    RepairJobRequest,
    RepairJobResponse,
    RepairJobStatus,
    RepairStatus,
)

router = APIRouter()


@router.post("", response_model=RepairJobResponse, status_code=status.HTTP_201_CREATED)
async def create_repair_job(request: RepairJobRequest) -> RepairJobResponse:
    """
    Submit a repair job.

    Returns a repair_job_id that can be used to monitor progress.
    """
    # TODO: Validate request
    # TODO: Create repair_jobs row in Supabase
    # TODO: Queue for processing (respects concurrency limits)
    # TODO: Return RepairJobResponse with estimated completion time

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Endpoint implementation pending Phase 3.1.1",
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
    # TODO: Fetch repair_jobs row from Supabase
    # TODO: Fetch repair_candidates for this job
    # TODO: Return RepairJobStatus with all details

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Endpoint implementation pending Phase 3.1.1",
    )


@router.get("")
async def list_repair_jobs(
    run_id: UUID | None = None,
    status: RepairStatus | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """
    List repair jobs with optional filtering.

    Returns paginated list of repair jobs.
    """
    # TODO: Query repair_jobs from Supabase with filters
    # TODO: Return paginated results

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Endpoint implementation pending Phase 3.1.1",
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
    # TODO: Fetch candidate and job details
    # TODO: Create GitHub branch
    # TODO: Commit patch
    # TODO: Create PR (draft or ready based on create_draft)
    # TODO: Update repair_jobs with PR info
    # TODO: Return PR details

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Endpoint implementation pending Phase 3.1.2",
    )
