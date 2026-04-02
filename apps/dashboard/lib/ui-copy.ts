/**
 * User-facing copy for repair / worker concepts (keep implementation terms out of UI).
 */

export const UI_COPY = {
  navPortfolio: "Portfolio",
  /** Sidebar + engine view nav label */
  navRepairLedger: "Repair engine",
  /** Count badge next to nav item */
  navLedgerCountTitle: "Findings queued for auto-repair",
  /** Engine footer / queue section */
  ledgerSectionLabel: "Repair queue",
  ledgerExplainer:
    "Queued findings are dispatched automatically through the model router. The worker applies patches as capacity allows.",
  ledgerEmpty: "No queued repairs",
  /** Next action / finding detail */
  addToLedger: "Queue repair →",
  ledgerAdding: "queuing…",
  onLedger: "queued for repair",
  ledgerIntentHint:
    "Queues this finding for automatic repair through the model router.",
  nextActionOpenProject: "Open in project",
  /** Portfolio Patterns panel (fragile files) */
  nextActionViewPatterns: "View portfolio patterns",
  ledgerRecorded: "Queued for repair",
  /** Finding detail — closure loop */
  lifecycleSection: "Closure loop",
  lifecyclepenny: "penny record",
  lifecycleRepairLedger: "Repair queue",
  lifecycleLinear: "Linear",
  lifecycleNextHeading: "What happens next",
  lifecycleLinearNotConfigured: "Linear integration not configured.",
  lifecycleLinearNoIssue: "No Linear issue linked for this finding.",
  lifecycleLinearDrift:
    "Linear last saw a different status than penny does now — push an update from the Linear panel if you use issues for tracking.",
  lifecycleRepairNone: "Not queued for repair.",
  lifecycleRepairQueued:
    "Queued — the worker will dispatch this automatically through the model router.",
  lifecycleRepairRunning: "Running — repair in progress.",
  lifecycleRepairCompleted: "Completed.",
  lifecycleRepairFailed: "Failed — see activity for detail.",
  lifecycleRepairIntentOnly:
    "Queued this session; job list still loading.",
  lifecycleNextSteps: [
    "The model router selects the best provider and generates a patch automatically.",
    "Once complete, verify the fix and update status here.",
    "Re-audit from Orchestration to confirm the fix holds.",
  ],
  /** Import modal — merge summary */
  importSummaryHeading: "Import summary",
  importSummaryMergeHint:
    "Compared file rows to the previous project snapshot by finding_id (content fingerprint for updated vs unchanged).",
  importSummaryReplaceHint: "Previous findings list was replaced by the file.",
  importSummaryDone: "Done",
  importSummaryAdded: "New findings",
  importSummaryUpdated: "Updated from file",
  importSummaryUnchanged: "Unchanged (same fingerprint)",
  importSummaryRemoved: "Removed (replaced list)",
  importSummaryTotals: "Totals",
  /** Sidebar: imports audits/open_findings.json + audits/runs into project DB (server filesystem). */
  syncAuditImportLabel: "Import audits from repo",
  syncAuditImportTitle:
    "Reads audits/open_findings.json and audits/runs on the server and merges findings into the dashboard project store. Does not pull from your browser.",
  auditSyncOkShort: "✓ Audits imported",
  auditSyncFailedShort: "✗ Audit import failed",
  /** Engine view when routing API fails */
  engineRoutingDegradedTitle: "Routing unavailable",
  engineRoutingDegradedBody:
    "Task → model mapping could not be loaded. Rows below may be empty or stale until routing loads.",
  /** Confirm dialog */
  confirmRemoveProjectTitle: "Remove project?",
  confirmRemoveProjectBody:
    "This removes the project from penny: dashboard record, durable snapshots and events for this project, and queued/completed audit jobs tied to it. Linear mappings and maintenance rows cascade with the project. Your git repository is not affected.",
  confirmDiscardImportTitle: "Discard form?",
  confirmDiscardImportBody: "You have unsaved text in the onboard form.",
  confirmCancel: "Cancel",
  confirmRemove: "Remove",
  confirmDiscard: "Discard",
  /** Project operations sections */
  opsSectionSetup: "Setup & review",
  opsSectionBulk: "Bulk operations & backlog",
  opsSectionLinear: "Linear",
  opsSectionHistory: "Audit history",
  /** Finding save / refresh */
  findingSavedLine: "Saved.",
  findingRefreshFailedLine: "Could not refresh from the server.",
  findingRefreshFailedHint: "Your change is stored. Retry when the connection is back.",
  /** Orchestration panel */
  orchestrationUpdatedPrefix: "Updated",
  /** Host misconfiguration */
  hostMisconfigDetailsSummary: "Deployment details",
  /** Shell — source of truth */
  sourceTruthTitle: "Source of truth",
  sourceTruthBody:
    "This dashboard stores findings in the configured project database. Local CLI workflows use audits/open_findings.json. Use one primary workflow per environment so they do not silently diverge.",
  sourceTruthDocLink: "Workflows table (docs)",
  sourceTruthDocPath: "docs/penny_NEAR_TERM_THEMES.md",
  /** Project — export */
  exportOpenFindingsJson: "Export open_findings.json",
  exportOpenFindingsTitle: "Download findings in open_findings.json shape for CLI / repair engine",
} as const;

/** Maintenance backlog `next_action` → short UI label */
export const BACKLOG_NEXT_STEP_LABEL: Record<string, string> = {
  review: "Review",
  plan_task: "Plan task",
  queue_repair: "Queue repair",
  verify: "Verify",
  re_audit: "Re-audit",
  defer: "Defer",
};
