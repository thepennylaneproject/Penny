/**
 * Onboarding/project addition flow state machine.
 *
 * Defines the lifecycle for adding a new project to the portfolio.
 * Users select a mode (repository or import) → provide details → confirm → done.
 */

export type OnboardingMode = "select_mode" | "input_details" | "confirm" | "done" | "error";

/**
 * Valid transitions for onboarding flow.
 * Flow is linear: select_mode → input_details → confirm → done
 * Can return to select_mode if user wants to switch modes
 * Can reach error from any state, then back to input_details to retry
 */
export const ONBOARDING_TRANSITIONS: Record<OnboardingMode, OnboardingMode[]> = {
  select_mode: ["input_details", "done"],
  input_details: ["select_mode", "confirm", "error"],
  confirm: ["done", "error", "input_details"],
  done: [],
  error: ["input_details", "select_mode"],
};

/**
 * Sub-mode selection within onboarding.
 * Users choose whether to create new project from repository or import findings.
 */
export type SubmitMode = "repository" | "json";

/**
 * Data collected during onboarding flow.
 */
export interface OnboardingData {
  submitMode: SubmitMode;
  projectName?: string;
  repositoryUrl?: string;
  defaultBranch?: string;
  jsonContent?: string;
}

/**
 * Human-readable labels for submission modes.
 */
export const SUBMIT_MODE_LABELS: Record<SubmitMode, string> = {
  repository: "New Project from Repository",
  json: "Import Findings from File",
};

/**
 * Guidance for each submission mode.
 */
export const SUBMIT_MODE_GUIDANCE: Record<
  SubmitMode,
  { title: string; description: string; subtitle: string }
> = {
  repository: {
    title: "New Project from Repository",
    subtitle: "Link a GitHub repository to start auditing",
    description:
      "Connect your repository to Penny. We'll analyze it and create a portfolio of findings.",
  },
  json: {
    title: "Import Findings from File",
    subtitle: "Import previously audited findings",
    description:
      "Upload a JSON file with audit findings to import them into your portfolio.",
  },
};

/**
 * Guidance for each onboarding step.
 */
export const ONBOARDING_STEP_GUIDANCE: Record<
  OnboardingMode,
  { title: string; subtitle?: string }
> = {
  select_mode: {
    title: "Add a New Project",
    subtitle: "Choose how you'd like to proceed",
  },
  input_details: {
    title: "Project Details",
    subtitle: "Provide the information we need",
  },
  confirm: {
    title: "Review & Confirm",
    subtitle: "Everything look good?",
  },
  done: {
    title: "Success!",
    subtitle: "Your project has been added",
  },
  error: {
    title: "Something went wrong",
    subtitle: "Let's try again",
  },
};

/**
 * Check if transition is valid.
 */
export function isValidOnboardingTransition(
  from: OnboardingMode,
  to: OnboardingMode
): boolean {
  return ONBOARDING_TRANSITIONS[from].includes(to);
}

/**
 * Get allowed next steps from current step.
 */
export function getNextOnboardingSteps(step: OnboardingMode): OnboardingMode[] {
  return ONBOARDING_TRANSITIONS[step];
}

/**
 * Validate onboarding data based on submit mode.
 */
export function validateOnboardingData(data: OnboardingData): { valid: boolean; error?: string } {
  if (!data.submitMode) {
    return { valid: false, error: "Mode not selected" };
  }

  if (data.submitMode === "repository") {
    if (!data.projectName?.trim()) {
      return { valid: false, error: "Project name is required" };
    }
    if (!data.repositoryUrl?.trim()) {
      return { valid: false, error: "Repository URL is required" };
    }
    // Basic URL validation
    try {
      new URL(data.repositoryUrl);
    } catch {
      return { valid: false, error: "Invalid repository URL" };
    }
  } else if (data.submitMode === "json") {
    if (!data.jsonContent?.trim()) {
      return { valid: false, error: "JSON content is required" };
    }
    // Basic JSON validation
    try {
      JSON.parse(data.jsonContent);
    } catch {
      return { valid: false, error: "Invalid JSON format" };
    }
  }

  return { valid: true };
}
