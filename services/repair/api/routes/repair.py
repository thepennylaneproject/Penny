"""Repair job endpoints."""

import asyncio
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from pydantic import BaseModel
from supabase import Client

from repair_engine.models.types import Finding
from repair_engine.orchestrator import RepairOrchestrator
from api.supabase_client import get_supabase

router = APIRouter(tags=["repair"])


# Pydantic schemas for request/response

class ProofHookInput(BaseModel):
    hook_type: str
    summary: str
    file: Optional[str] = None
    start_line: Optional[int] = None
    end_line: Optional[int] = None
    symbol: Optional[str] = None
    route: Optional[str] = None
    command: Optional[str] = None
    error_text: Optional[str] = None
    expected: Optional[str] = None
    actual: Optional[str] = None
    artifact_path: Optional[str] = None


class FindingInput(BaseModel):
    finding_id: str
    type: str
    category: str
    severity: str
    priority: str
    confidence: str
    title: str
    description: str
    impact: str
    status: str
    suggested_fix: dict = {}
    proof_hooks: list[ProofHookInput] = []
    history: list[dict] = []
    raw: dict = {}
    project_name: Optional[str] = None


class RepairRunRequest(BaseModel):
    finding: FindingInput
    project_id: Optional[str] = None
    repo_root: Optional[str] = None


class RepairRunResponse(BaseModel):
    repair_job_id: str
    finding_id: str
    status: str
    message: str


class RepairJobResponse(BaseModel):
    repair_job_id: str
    finding_id: Optional[str] = None
    project_id: Optional[str] = None
    status: str
    action: Optional[str] = None
    best_candidate_id: Optional[str] = None
    best_score: Optional[float] = None
    confidence_score: Optional[float] = None
    confidence_breakdown: Optional[dict] = None
    pr_id: Optional[str] = None
    pr_number: Optional[int] = None
    pr_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


def utc_now() -> str:
    """Return current UTC time as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


def _run_job(
    repair_job_id: str,
    finding: Finding,
    orchestrator: RepairOrchestrator,
    supabase: Client,
) -> None:
    """Background task: run repair orchestrator and update Supabase.

    This runs in a thread pool executor and must not raise exceptions
    that would crash the thread.
    """
    try:
        # Mark job as running
        supabase.table("repair_jobs").update({
            "status": "running",
            "started_at": utc_now(),
        }).eq("repair_job_id", repair_job_id).execute()

        # Run the orchestrator
        result = orchestrator.run_for_finding(finding)

        # Mark job as completed
        routing_usage = result.get("routing_usage")
        progress = None
        if isinstance(routing_usage, dict):
            progress = {"routing": routing_usage}
        supabase.table("repair_jobs").update({
            "status": result.get("status", "completed"),
            "action": result.get("status", "completed"),
            "best_candidate_id": result.get("selected_node_id"),
            "progress": progress,
            "error_message": None,
            "completed_at": utc_now(),
        }).eq("repair_job_id", repair_job_id).execute()

    except Exception as exc:
        # Catch all failures and mark job as failed
        error_msg = str(exc)[:2000]  # Cap at 2000 chars
        try:
            supabase.table("repair_jobs").update({
                "status": "failed",
                "error_message": error_msg,
                "completed_at": utc_now(),
            }).eq("repair_job_id", repair_job_id).execute()
        except Exception as db_err:
            print(f"Failed to update repair_jobs with error status: {db_err}")


@router.post(
    "/run",
    response_model=RepairRunResponse,
    status_code=202,
    summary="Submit a repair job",
)
async def submit_repair_job(
    request: Request,
    body: RepairRunRequest,
) -> RepairRunResponse:
    """Submit a repair job for a finding.

    The repair will run asynchronously in a background thread.
    Poll GET /repair/{repair_job_id} to check status.
    """
    # Get dependencies
    orchestrator: RepairOrchestrator = request.app.state.orchestrator
    supabase: Client = get_supabase()

    # Convert Pydantic model to dict, then to Finding
    finding_data = body.finding.model_dump()
    # Ensure project_name is in the finding
    if body.finding.project_name:
        finding_data["project_name"] = body.finding.project_name
    if body.project_id and "project_name" not in finding_data:
        finding_data["project_name"] = body.project_id

    try:
        finding = Finding.from_dict(finding_data)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid finding data: {str(e)}"
        )

    # Generate job ID
    repair_job_id = str(uuid.uuid4())

    # Create initial row in Supabase
    try:
        supabase.table("repair_jobs").insert({
            "repair_job_id": repair_job_id,
            "finding_id": body.finding.finding_id,
            "project_id": body.project_id,
            "status": "queued",
            "confidence_score": None,
            "confidence_breakdown": None,
            "action": None,
            "progress": None,
            "best_candidate_id": None,
            "best_score": None,
            "pr_id": None,
            "pr_number": None,
            "pr_url": None,
            "error_message": None,
            "created_at": utc_now(),
        }).execute()
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Failed to create repair job record: {str(e)}"
        )

    # Submit to executor (fire and forget)
    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        request.app.state.executor,
        _run_job,
        repair_job_id,
        finding,
        orchestrator,
        supabase,
    )

    return RepairRunResponse(
        repair_job_id=repair_job_id,
        finding_id=body.finding.finding_id,
        status="queued",
        message="Repair job submitted. Poll GET /repair/{repair_job_id} to check status.",
    )


@router.get(
    "/{repair_job_id}",
    response_model=RepairJobResponse,
    summary="Get repair job status",
)
async def get_repair_job(repair_job_id: str) -> RepairJobResponse:
    """Get the current status of a repair job."""
    supabase = get_supabase()

    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("repair_jobs")
            .select("*")
            .eq("repair_job_id", repair_job_id)
            .single()
            .execute()
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(e)}"
        )

    if not result.data:
        raise HTTPException(
            status_code=404,
            detail=f"Repair job {repair_job_id} not found"
        )

    return RepairJobResponse(**result.data)
