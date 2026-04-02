/** Portfolio apps: expectations path + source directory under repo root */
export interface PortfolioApp {
  projectName: string;
  expectations: string;
  scanDir: string;
}

export const PORTFOLIO_APPS: PortfolioApp[] = [
  { projectName: "Advocera", expectations: "expectations/advocera-expectations.md", scanDir: "the_penny_lane_project/Advocera" },
  { projectName: "Codra", expectations: "expectations/codra-expectations.md", scanDir: "the_penny_lane_project/Codra" },
  { projectName: "FounderOS", expectations: "expectations/founderos-expectations.md", scanDir: "the_penny_lane_project/FounderOS" },
  { projectName: "Mythos", expectations: "expectations/mythos-expectations.md", scanDir: "the_penny_lane_project/Mythos" },
  { projectName: "Passagr", expectations: "expectations/passagr-expectations.md", scanDir: "the_penny_lane_project/Passagr" },
  { projectName: "Relevnt", expectations: "expectations/relevnt-expectations.md", scanDir: "the_penny_lane_project/Relevnt" },
  { projectName: "embr", expectations: "expectations/embr-expectations.md", scanDir: "the_penny_lane_project/embr" },
  { projectName: "ready", expectations: "expectations/ready-expectations.md", scanDir: "the_penny_lane_project/ready" },
  { projectName: "Dashboard", expectations: "expectations/dashboard-expectations.md", scanDir: "the_penny_lane_project/dashboard" },
  { projectName: "Restoration Project", expectations: "expectations/restoration-project-expectations.md", scanDir: "the_penny_lane_project/restoration-project" },
  { projectName: "sarahsahl.pro", expectations: "expectations/sarahsahl-pro-expectations.md", scanDir: "the_penny_lane_project/sarahsahl_pro" },
];

export function resolveApps(
  jobType: string,
  projectName: string | null
): PortfolioApp[] {
  if (projectName?.trim()) {
    const p = projectName.trim();
    const one = PORTFOLIO_APPS.find(
      (a) => a.projectName.toLowerCase() === p.toLowerCase()
    );
    if (one) return [one];
    // QA-006: Reject non-portfolio projects with a clear error instead of
    // fabricating placeholder paths that produce meaningless audit results.
    throw new Error(
      `Project "${p}" is not a recognized portfolio project. ` +
        `Only portfolio projects can be audited by the worker. ` +
        `Known projects: ${PORTFOLIO_APPS.map((a) => a.projectName).join(", ")}.`
    );
  }
  return [...PORTFOLIO_APPS];
}
