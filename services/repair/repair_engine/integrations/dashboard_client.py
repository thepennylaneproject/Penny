"""
Dashboard API client for repair engine.

The repair engine calls back to the dashboard when a repair run completes
to update the repair job status and finding state.
"""

from __future__ import annotations

import json
import os
from typing import Any
import requests


class DashboardClient:
    """Client for calling dashboard API endpoints."""

    def __init__(self, base_url: str, api_key: str = ""):
        """
        Initialize dashboard client.

        Args:
            base_url: Base URL of the dashboard (e.g., http://localhost:3000)
            api_key: Optional API key for authentication (x-penny-api-secret header)
        """
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key or os.getenv("penny_DASHBOARD_API_KEY", "")

    def _make_request(
        self,
        method: str,
        path: str,
        data: dict[str, Any] | None = None,
        timeout: int = 30,
    ) -> dict[str, Any]:
        """Make authenticated HTTP request to dashboard."""
        url = f"{self.base_url}{path}"
        headers = {
            "Content-Type": "application/json",
        }

        if self.api_key:
            headers["x-penny-api-secret"] = self.api_key

        response = requests.request(
            method,
            url,
            json=data,
            headers=headers,
            timeout=timeout,
        )

        if response.status_code >= 400:
            try:
                error_body = response.json()
                error_msg = error_body.get("error", response.text)
            except Exception:
                error_msg = response.text

            raise RuntimeError(
                f"Dashboard API error ({response.status_code}): {error_msg}"
            )

        return response.json() if response.text else {}

    def report_repair_complete(
        self,
        finding_id: str,
        project_name: str,
        run_id: str,
        status: str,
        patch_applied: bool = False,
        applied_files: list[str] | None = None,
        repair_proof: dict[str, Any] | None = None,
        provider_used: str | None = None,
        model_used: str | None = None,
        routing_lane: str | None = None,
        routing_strategy: str | None = None,
        routing_usage: dict[str, Any] | None = None,
        error: str | None = None,
        message: str | None = None,
    ) -> dict[str, Any]:
        """
        Report repair completion to the dashboard.

        Args:
            finding_id: The finding ID that was repaired
            project_name: The project name
            run_id: The repair run ID from the engine
            status: One of "completed", "failed", or "applied"
            patch_applied: Whether a patch was successfully applied
            applied_files: List of files modified by the patch
            repair_proof: Structured evidence for reviewable patch application
            error: Error message if the repair failed
            message: Human-readable message about the outcome

        Returns:
            Response from the dashboard API

        Raises:
            RuntimeError: If the API call fails
        """
        payload = {
            "finding_id": finding_id,
            "project_name": project_name,
            "run_id": run_id,
            "status": status,
            "patch_applied": patch_applied,
            "applied_files": applied_files or [],
            "repair_proof": repair_proof,
            "provider_used": provider_used,
            "model_used": model_used,
            "routing_lane": routing_lane,
            "routing_strategy": routing_strategy,
            "routing_usage": routing_usage,
            "error": error,
            "message": message,
        }

        return self._make_request("POST", "/api/engine/complete", payload)


    def dequeue_next_job(self) -> dict[str, Any] | None:
        """
        Claim the next queued repair job from the dashboard.

        Calls POST /api/engine/dequeue which atomically marks the job as
        running and returns both the job record and the full finding payload.

        Returns:
            A dict with keys "job" and "finding" when a job is available,
            or None when the queue is empty.

        Raises:
            RuntimeError: If the API call fails.
        """
        result = self._make_request("POST", "/api/engine/dequeue")
        if not result.get("job"):
            return None
        return result


def get_dashboard_client(base_url: str | None = None) -> DashboardClient:
    """
    Get or create a dashboard API client.

    Args:
        base_url: Optional dashboard base URL. Defaults to penny_DASHBOARD_URL env var.

    Returns:
        DashboardClient instance

    Raises:
        ValueError: If no base URL is provided or configured
    """
    url = base_url or os.getenv("penny_DASHBOARD_URL", "")

    if not url:
        raise ValueError(
            "Dashboard base URL not provided. "
            "Set penny_DASHBOARD_URL env var or pass base_url parameter."
        )

    return DashboardClient(url)
