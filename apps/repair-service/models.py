"""Pydantic models for Penny Repair Service."""

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class RepairStatus(str, Enum):
    """Repair job status."""
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    BLOCKED = "blocked"


class RepairAction(str, Enum):
    """Action determined by confidence score."""
    FAST_LANE_READY_PR = "fast_lane_ready_pr"
    READY_PR = "ready_pr"
    DRAFT_PR = "draft_pr"
    CANDIDATE_ONLY = "candidate_only"
    DO_NOT_REPAIR = "do_not_repair"


class RepairConfig(BaseModel):
    """Repair configuration."""
    beam_width: int = Field(default=3, ge=1, le=10)
    max_depth: int = Field(default=4, ge=1, le=5)
    timeout_seconds: int = Field(default=180, ge=30, le=900)
    validation_commands: list[str] = Field(default_factory=list)
    language: str = "typescript"


class RepairJobRequest(BaseModel):
    """Request to create a repair job."""
    run_id: UUID
    finding_id: str
    project_id: UUID
    file_path: str
    finding_title: str
    finding_type: str = "bug"
    finding_severity: str = "high"
    description: str
    code_context: str
    repair_config: RepairConfig = Field(default_factory=RepairConfig)


class RepairJobResponse(BaseModel):
    """Response after creating repair job."""
    repair_job_id: UUID
    status: RepairStatus
    created_at: datetime
    estimated_completion_ms: int


class ConfidenceBreakdown(BaseModel):
    """Confidence score breakdown."""
    validation: float = Field(ge=0, le=100)
    locality: float = Field(ge=0, le=100)
    risk: float = Field(ge=0, le=100)
    uncertainty_penalty: float = Field(ge=0, le=15)


class RepairJobStatus(BaseModel):
    """Status of a repair job."""
    repair_job_id: UUID
    finding_id: str
    project_id: UUID
    status: RepairStatus
    confidence_score: Optional[float] = None
    confidence_breakdown: Optional[ConfidenceBreakdown] = None
    action: Optional[RepairAction] = None
    progress: Optional[dict] = None
    best_candidate_id: Optional[UUID] = None
    best_score: Optional[float] = None
    candidates: list[dict] = Field(default_factory=list)
    pr_id: Optional[UUID] = None
    pr_number: Optional[int] = None
    pr_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class HealthCheckResponse(BaseModel):
    """Health check response."""
    status: str = "healthy"
    docker_available: bool
    supabase_connected: bool
    github_token_valid: bool
    queue_size: int
