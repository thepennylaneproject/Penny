/**
 * Pure onboarding PATCH logic (no fs). Kept separate from `onboarding.ts` so API routes
 * that only apply artifact updates do not pull the repo-scanning pipeline into the NFT graph (f-203ecae0).
 */

import { makeDecisionEvent } from "./decision-events";
import type { OnboardingState, Project } from "./types";

export function updateOnboardingArtifacts(
  project: Project,
  input: {
    actor?: string;
    profileContent?: string;
    expectationsContent?: string;
    approveProfile?: boolean;
    approveExpectations?: boolean;
    activate?: boolean;
    notes?: string;
  }
): Project {
  const actor = input.actor?.trim() || "dashboard";
  const now = new Date().toISOString();
  const decisionHistory = [...(project.decisionHistory ?? [])];
  const onboardingEvents = [...(project.onboardingState?.events ?? [])];
  let nextProfile = project.profile ?? {};
  let nextExpectations = project.expectations ?? {};
  let nextStatus = project.status ?? "draft";
  const onboardingState: OnboardingState = {
    stage: project.onboardingState?.stage ?? "operator_review",
    reviewRequired: true,
    updatedAt: now,
    ...project.onboardingState,
  };

  if (typeof input.profileContent === "string") {
    const previous = nextProfile.draft ?? nextProfile.active;
    nextProfile = {
      ...nextProfile,
      draft: {
        version: (previous?.version ?? 0) + 1,
        status: "draft",
        content: input.profileContent,
        generatedAt: now,
        source: "manual",
      },
    };
    const draftVersion = nextProfile.draft?.version ?? previous?.version ?? 1;
    const event = makeDecisionEvent(actor, "profile_edited", "profile", {
      notes: input.notes,
      before: { version: previous?.version },
      after: { version: draftVersion },
    });
    decisionHistory.push(event);
    onboardingEvents.push(event);
  }

  if (typeof input.expectationsContent === "string") {
    const previous = nextExpectations.draft ?? nextExpectations.active;
    nextExpectations = {
      ...nextExpectations,
      draft: {
        version: (previous?.version ?? 0) + 1,
        status: "draft",
        content: input.expectationsContent,
        generatedAt: now,
        source: "manual",
      },
    };
    const draftVersion = nextExpectations.draft?.version ?? previous?.version ?? 1;
    const event = makeDecisionEvent(actor, "expectations_edited", "expectations", {
      notes: input.notes,
      before: { version: previous?.version },
      after: { version: draftVersion },
    });
    decisionHistory.push(event);
    onboardingEvents.push(event);
  }

  if (input.approveProfile && nextProfile.draft) {
    const approvedDraft = nextProfile.draft;
    nextProfile = {
      ...nextProfile,
      active: { ...approvedDraft, status: "active" },
    };
    onboardingState.profileApprovedAt = now;
    const activeVersion = nextProfile.active?.version ?? approvedDraft.version;
    const event = makeDecisionEvent(actor, "profile_approved", "profile", {
      notes: input.notes,
      after: { version: activeVersion },
    });
    decisionHistory.push(event);
    onboardingEvents.push(event);
  }

  if (input.approveExpectations && nextExpectations.draft) {
    const approvedDraft = nextExpectations.draft;
    nextExpectations = {
      ...nextExpectations,
      active: { ...approvedDraft, status: "active" },
    };
    onboardingState.expectationsApprovedAt = now;
    const activeVersion =
      nextExpectations.active?.version ?? approvedDraft.version;
    const event = makeDecisionEvent(actor, "expectations_approved", "expectations", {
      notes: input.notes,
      after: { version: activeVersion },
    });
    decisionHistory.push(event);
    onboardingEvents.push(event);
  }

  if (input.activate) {
    if (!nextProfile.active || !nextExpectations.active) {
      throw new Error("Profile and expectations must both be approved before activation");
    }
    nextStatus = "active";
    onboardingState.stage = "completed";
    onboardingState.reviewRequired = false;
    onboardingState.activatedAt = now;
    const event = makeDecisionEvent(actor, "project_activated", "project", {
      notes: input.notes,
    });
    decisionHistory.push(event);
    onboardingEvents.push(event);
  } else {
    onboardingState.stage = "operator_review";
    onboardingState.reviewRequired = true;
  }

  onboardingState.updatedAt = now;
  onboardingState.events = onboardingEvents;

  return {
    ...project,
    profile: nextProfile,
    expectations: nextExpectations,
    status: nextStatus,
    onboardingState,
    decisionHistory,
    lastUpdated: now,
  };
}
