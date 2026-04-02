"use client";

import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api-fetch";

interface BulkActionsPanelProps {
  activeProject?: string | null;
  onActionComplete?: () => void;
}

export function BulkActionsPanel({
  activeProject,
  onActionComplete,
}: BulkActionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<string>>(
    new Set()
  );
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<{
    action: string;
    message: string;
  } | null>(null);

  const clearError = useCallback(() => setActionError(null), []);
  const clearSuccess = useCallback(() => setActionSuccess(null), []);

  const performBulkAction = useCallback(
    async (
      endpoint: string,
      body: Record<string, unknown>,
      actionLabel: string
    ) => {
      setActionError(null);
      setActionSuccess(null);
      setActionInProgress(actionLabel);
      setShowConfirmModal(null);

      try {
        const res = await apiFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            (err as Record<string, unknown>).error
              ? String((err as Record<string, unknown>).error)
              : `Failed (${res.status})`
          );
        }

        const result = (await res.json()) as Record<string, unknown>;
        const successMsg =
          (result as Record<string, unknown>).message ||
          `${actionLabel} completed successfully`;
        setActionSuccess(successMsg as string);
        setSelectedFindingIds(new Set());

        if (onActionComplete) {
          onActionComplete();
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setActionError(msg);
      } finally {
        setActionInProgress(null);
      }
    },
    [onActionComplete]
  );

  const handleClearRuns = useCallback(async () => {
    await performBulkAction(
      "/api/bulk-operations/clear-runs",
      { project_name: activeProject },
      "Clear Runs"
    );
  }, [activeProject, performBulkAction]);

  const handleClearJobs = useCallback(async () => {
    await performBulkAction(
      "/api/bulk-operations/clear-jobs",
      { project_name: activeProject },
      "Clear Jobs"
    );
  }, [activeProject, performBulkAction]);

  const handleLinearSync = useCallback(async () => {
    if (!activeProject) {
      setActionError("No project selected");
      return;
    }

    const findingIds = Array.from(selectedFindingIds);
    await performBulkAction(
      "/api/bulk-operations/linear-sync",
      {
        project_name: activeProject,
        finding_ids: findingIds.length > 0 ? findingIds : undefined,
      },
      "Linear Sync"
    );
  }, [activeProject, selectedFindingIds, performBulkAction]);

  const handleRepairQueue = useCallback(async () => {
    if (!activeProject) {
      setActionError("No project selected");
      return;
    }

    const findingIds = Array.from(selectedFindingIds);
    if (findingIds.length === 0) {
      setActionError("Select at least one finding to queue for repair");
      return;
    }

    await performBulkAction(
      "/api/bulk-operations/repair-queue",
      {
        project_name: activeProject,
        finding_ids: findingIds,
        priority: "normal",
      },
      "Queue for Repair"
    );
  }, [activeProject, selectedFindingIds, performBulkAction]);

  const handleSyncAllLinear = useCallback(async () => {
    await performBulkAction(
      "/api/bulk-operations/linear-sync-all",
      {},
      "Sync All to Linear"
    );
  }, [performBulkAction]);

  const confirmAction = useCallback(
    async (callback: () => Promise<void>) => {
      setShowConfirmModal(null);
      await callback();
    },
    []
  );

  return (
    <div
      style={{
        backgroundColor: "var(--canvas-2)",
        borderRadius: "8px",
        padding: "1rem",
        marginTop: "1rem",
        fontSize: "13px",
        fontFamily: "var(--font-mono)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: isExpanded ? "1rem" : "0",
          cursor: "pointer",
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ fontWeight: 600, color: "var(--ink-text-1)" }}>
          🔧 Bulk Actions
          {selectedFindingIds.size > 0 && (
            <span style={{ color: "var(--ink-text-4)", marginLeft: "0.5rem" }}>
              ({selectedFindingIds.size} selected)
            </span>
          )}
        </div>
        <div
          style={{
            color: "var(--ink-text-4)",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        >
          ▼
        </div>
      </div>

      {isExpanded && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {/* Error/Success messages */}
          {actionError && (
            <div
              style={{
                padding: "0.75rem",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                color: "var(--error-text)",
                borderRadius: "4px",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{actionError}</span>
              <button
                onClick={clearError}
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                  padding: "0",
                }}
              >
                ✕
              </button>
            </div>
          )}

          {actionSuccess && (
            <div
              style={{
                padding: "0.75rem",
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                color: "var(--success-text)",
                borderRadius: "4px",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{actionSuccess}</span>
              <button
                onClick={clearSuccess}
                style={{
                  background: "none",
                  border: "none",
                  color: "inherit",
                  cursor: "pointer",
                  padding: "0",
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              onClick={() =>
                setShowConfirmModal({
                  action: "clearRuns",
                  message: `Clear all audit runs for ${activeProject || "all projects"}? This cannot be undone.`,
                })
              }
              disabled={actionInProgress !== null || !activeProject}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "var(--canvas-3)",
                border: "1px solid var(--border-1)",
                borderRadius: "4px",
                cursor:
                  actionInProgress || !activeProject ? "not-allowed" : "pointer",
                opacity: actionInProgress || !activeProject ? 0.5 : 1,
                fontSize: "12px",
              }}
            >
              {actionInProgress === "Clear Runs" ? "Clearing..." : "Clear Runs"}
            </button>

            <button
              onClick={() =>
                setShowConfirmModal({
                  action: "clearJobs",
                  message: `Clear all pending jobs for ${activeProject || "all projects"}? This cannot be undone.`,
                })
              }
              disabled={actionInProgress !== null || !activeProject}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "var(--canvas-3)",
                border: "1px solid var(--border-1)",
                borderRadius: "4px",
                cursor:
                  actionInProgress || !activeProject ? "not-allowed" : "pointer",
                opacity: actionInProgress || !activeProject ? 0.5 : 1,
                fontSize: "12px",
              }}
            >
              {actionInProgress === "Clear Jobs"
                ? "Clearing..."
                : "Clear Jobs"}
            </button>

            <button
              onClick={handleLinearSync}
              disabled={
                actionInProgress !== null ||
                !activeProject
              }
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "var(--canvas-3)",
                border: "1px solid var(--border-1)",
                borderRadius: "4px",
                cursor:
                  actionInProgress || !activeProject ? "not-allowed" : "pointer",
                opacity: actionInProgress || !activeProject ? 0.5 : 1,
                fontSize: "12px",
              }}
            >
              {actionInProgress === "Linear Sync"
                ? "Syncing..."
                : "Sync to Linear"}
            </button>

            <button
              onClick={handleSyncAllLinear}
              disabled={actionInProgress !== null}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: "var(--canvas-3)",
                border: "1px solid var(--border-1)",
                borderRadius: "4px",
                cursor: actionInProgress ? "not-allowed" : "pointer",
                opacity: actionInProgress ? 0.5 : 1,
                fontSize: "12px",
              }}
            >
              {actionInProgress === "Sync All to Linear"
                ? "Syncing all..."
                : "Sync all to Linear"}
            </button>

            <button
              onClick={() =>
                setShowConfirmModal({
                  action: "repairQueue",
                  message: `Queue ${selectedFindingIds.size} finding(s) for repair? They will be added to the maintenance backlog for follow-up (see docs/DASHBOARD.md).`,
                })
              }
              disabled={
                actionInProgress !== null ||
                !activeProject ||
                selectedFindingIds.size === 0
              }
              style={{
                padding: "0.5rem 1rem",
                backgroundColor:
                  selectedFindingIds.size > 0
                    ? "var(--accent-5)"
                    : "var(--canvas-3)",
                color:
                  selectedFindingIds.size > 0
                    ? "var(--accent-text)"
                    : "var(--ink-text-4)",
                border:
                  selectedFindingIds.size > 0
                    ? "1px solid var(--accent-5)"
                    : "1px solid var(--border-1)",
                borderRadius: "4px",
                cursor:
                  actionInProgress ||
                  !activeProject ||
                  selectedFindingIds.size === 0
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  actionInProgress ||
                  !activeProject ||
                  selectedFindingIds.size === 0
                    ? 0.5
                    : 1,
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              {actionInProgress === "Queue for Repair"
                ? "Queuing..."
                : `Queue for Repair (${selectedFindingIds.size})`}
            </button>
          </div>

          {/* Selection note */}
          <div style={{ color: "var(--ink-text-4)", fontSize: "12px" }}>
            Tip: Use checkboxes on the Findings tab to select findings and queue them for repair in bulk. Use &quot;Sync all to Linear&quot; to sync all projects at once, or select a project to sync only that one.
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowConfirmModal(null)}
        >
          <div
            style={{
              backgroundColor: "var(--canvas-1)",
              padding: "2rem",
              borderRadius: "8px",
              maxWidth: "400px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: "1rem", fontWeight: 600 }}>
              Confirm Action
            </div>
            <div style={{ marginBottom: "1.5rem", color: "var(--ink-text-3)" }}>
              {showConfirmModal.message}
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <button
                onClick={() => setShowConfirmModal(null)}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  backgroundColor: "var(--canvas-3)",
                  border: "1px solid var(--border-1)",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (showConfirmModal.action === "clearRuns") {
                    confirmAction(handleClearRuns);
                  } else if (showConfirmModal.action === "clearJobs") {
                    confirmAction(handleClearJobs);
                  } else if (showConfirmModal.action === "repairQueue") {
                    confirmAction(handleRepairQueue);
                  }
                }}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  backgroundColor: "var(--accent-5)",
                  color: "var(--accent-text)",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
