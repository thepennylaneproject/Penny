"""Configuration endpoints for live tuning."""

import dataclasses
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

from repair_engine.orchestrator import RepairOrchestrator

router = APIRouter(tags=["config"])


# Pydantic schemas for partial config updates

class SearchConfigUpdate(BaseModel):
    root_branching_factor: Optional[int] = None
    beam_width: Optional[int] = None
    max_depth: Optional[int] = None
    max_evals_per_finding: Optional[int] = None
    min_expand_score: Optional[float] = None


class EvaluationConfigUpdate(BaseModel):
    use_docker: Optional[bool] = None
    docker_image: Optional[str] = None
    lint_command: Optional[str] = None
    typecheck_command: Optional[str] = None
    test_command: Optional[str] = None
    timeout_seconds: Optional[int] = None


class ApplyConfigUpdate(BaseModel):
    auto_apply: Optional[bool] = None
    dry_run: Optional[bool] = None
    max_files_changed: Optional[int] = None


class ConfigUpdateRequest(BaseModel):
    search: Optional[SearchConfigUpdate] = None
    evaluation: Optional[EvaluationConfigUpdate] = None
    apply: Optional[ApplyConfigUpdate] = None


def _safe_config_dict(config) -> dict:
    """Convert EngineConfig to dict with API keys redacted."""
    full_dict = dataclasses.asdict(config)

    # Redact sensitive fields in providers
    if "providers" in full_dict and isinstance(full_dict["providers"], dict):
        for key in list(full_dict["providers"].keys()):
            if any(
                sensitive in key.lower()
                for sensitive in ["api_key", "secret", "token", "password"]
            ):
                full_dict["providers"][key] = "***"

    return full_dict


@router.get("", summary="Get current engine configuration")
async def get_config(request: Request) -> dict:
    """Get the current repair engine configuration.

    API keys are redacted for security.
    """
    orchestrator: RepairOrchestrator = request.app.state.orchestrator
    return _safe_config_dict(orchestrator.config)


@router.put("", summary="Update engine configuration (partial)")
async def update_config(
    request: Request,
    body: ConfigUpdateRequest,
) -> dict:
    """Update engine configuration at runtime (partial update).

    Only the fields provided in the request are updated.
    Omitted fields are left unchanged.

    Note: Providers and integrations config cannot be modified at runtime.
    These require service restart.
    """
    orchestrator: RepairOrchestrator = request.app.state.orchestrator
    config = orchestrator.config

    # Update search config
    if body.search:
        updates = body.search.model_dump(exclude_none=True)
        for field, value in updates.items():
            setattr(config.search, field, value)

    # Update evaluation config
    if body.evaluation:
        updates = body.evaluation.model_dump(exclude_none=True)
        for field, value in updates.items():
            setattr(config.evaluation, field, value)

    # Update apply config
    if body.apply:
        updates = body.apply.model_dump(exclude_none=True)
        for field, value in updates.items():
            setattr(config.apply, field, value)

    return {
        "status": "updated",
        "config": _safe_config_dict(config),
    }
