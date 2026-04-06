"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";
import { apiFetch } from "@/lib/api-fetch";

interface OnboardingReviewPanelProps {
  project: Project;
  onUpdated: (project: Project) => Promise<void> | void;
}

export function OnboardingReviewPanel({
  project,
  onUpdated,
}: OnboardingReviewPanelProps) {
  const initialProfileText =
    project.profile?.draft?.content ?? project.profile?.active?.content ?? "";
  const initialExpectationsText =
    project.expectations?.draft?.content ?? project.expectations?.active?.content ?? "";

  const [profileText, setProfileText] = useState(initialProfileText);
  const [expectationsText, setExpectationsText] = useState(initialExpectationsText);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const profileDirty = profileText !== initialProfileText;
  const expectationsDirty = expectationsText !== initialExpectationsText;
  const isDirty = profileDirty || expectationsDirty;

  // Check if both approvals exist
  const profileApproved = project.profile?.active != null;
  const expectationsApproved = project.expectations?.active != null;
  const canActivate =
    profileApproved &&
    expectationsApproved &&
    saving === null &&
    !isDirty;

  useEffect(() => {
    setProfileText(initialProfileText);
    setExpectationsText(initialExpectationsText);
  }, [project, initialProfileText, initialExpectationsText]);

  // Warn on unload if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && saving === null) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, saving]);

  const save = async (body: Record<string, unknown>, key: string) => {
    setSaving(key);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/projects/${encodeURIComponent(project.name)}/onboarding`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Failed (${res.status})`);
      }
      const updated = (await res.json()) as Project;
      await onUpdated(updated);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(null);
    }
  };

  if ((project.status ?? "active") === "active" && !project.onboardingState?.reviewRequired) {
    return null;
  }

  return (
    <div
      style={{
        marginBottom: "1.5rem",
        padding: "1rem 1.1rem",
        borderRadius: "var(--radius-lg)",
        border: "0.5px solid var(--ink-border-faint)",
        background: "var(--ink-bg-raised)",
      }}
    >
      <div
        style={{
          fontSize: "9px",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink-text-4)",
          marginBottom: "0.5rem",
        }}
      >
        Onboarding Review
      </div>
      <div style={{ fontSize: "11px", color: "var(--ink-text-4)", marginBottom: "0.85rem" }}>
        Draft profile and expectations must be reviewed before the project becomes active for audits.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "0.9rem",
          marginBottom: "0.9rem",
        }}
      >
        <div>
          <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: isDirty ? "var(--ink-amber)" : "var(--ink-text-4)", marginBottom: "0.35rem" }}>
            Draft profile{isDirty && <span style={{ color: "var(--ink-amber)" }}> · unsaved</span>}
          </div>
          <textarea
            rows={14}
            value={profileText}
            onChange={(e) => setProfileText(e.target.value)}
            style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}
          />
        </div>
        <div>
          <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: isDirty ? "var(--ink-amber)" : "var(--ink-text-4)", marginBottom: "0.35rem" }}>
            Draft expectations{isDirty && <span style={{ color: "var(--ink-amber)" }}> · unsaved</span>}
          </div>
          <textarea
            rows={14}
            value={expectationsText}
            onChange={(e) => setExpectationsText(e.target.value)}
            style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}
          />
        </div>
      </div>

      {error && (
        <div style={{ fontSize: "11px", color: "var(--ink-red)", fontFamily: "var(--font-mono)", marginBottom: "0.75rem" }}>
          {error}
        </div>
      )}

      <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", marginBottom: "0.75rem" }}>
        <div style={{ marginBottom: "0.5rem" }}>Prerequisites to activate:</div>
        <div style={{ marginLeft: "0.5rem", lineHeight: 1.6 }}>
          <div style={{ color: profileApproved ? "var(--ink-text-4)" : "var(--ink-amber)" }}>
            {profileApproved ? "✓" : "○"} Profile approved
          </div>
          <div style={{ color: expectationsApproved ? "var(--ink-text-4)" : "var(--ink-amber)" }}>
            {expectationsApproved ? "✓" : "○"} Expectations approved
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() =>
            save(
              {
                ...(profileDirty ? { profileContent: profileText } : {}),
                ...(expectationsDirty ? { expectationsContent: expectationsText } : {}),
              },
              "save"
            )
          }
          disabled={saving !== null || !isDirty}
        >
          {saving === "save" ? "saving…" : "Save drafts"}
        </button>
        <button
          type="button"
          onClick={() =>
            save(
              {
                ...(profileDirty ? { profileContent: profileText } : {}),
                ...(expectationsDirty ? { expectationsContent: expectationsText } : {}),
                approveProfile: true,
              },
              "approve-profile"
            )
          }
          disabled={saving !== null}
        >
          {saving === "approve-profile" ? "…" : "Approve profile"}
        </button>
        <button
          type="button"
          onClick={() =>
            save(
              {
                ...(profileDirty ? { profileContent: profileText } : {}),
                ...(expectationsDirty ? { expectationsContent: expectationsText } : {}),
                approveExpectations: true,
              },
              "approve-expectations"
            )
          }
          disabled={saving !== null}
        >
          {saving === "approve-expectations" ? "…" : "Approve expectations"}
        </button>
        <button
          type="button"
          onClick={() => save({ activate: true }, "activate")}
          disabled={!canActivate}
          title={
            !profileApproved
              ? "Approve profile first"
              : !expectationsApproved
                ? "Approve expectations first"
                : isDirty
                  ? "Save drafts before activating"
                  : ""
          }
        >
          {saving === "activate" ? "…" : "Activate project"}
        </button>
      </div>
    </div>
  );
}
