import type { Project } from "./types";

const PORTFOLIO_DEFAULTS: Record<string, { scanDir: string }> = {
  Advocera: { scanDir: "the_penny_lane_project/Advocera" },
  Codra: { scanDir: "the_penny_lane_project/Codra" },
  FounderOS: { scanDir: "the_penny_lane_project/FounderOS" },
  Mythos: { scanDir: "the_penny_lane_project/Mythos" },
  Passagr: { scanDir: "the_penny_lane_project/Passagr" },
  Relevnt: { scanDir: "the_penny_lane_project/Relevnt" },
  embr: { scanDir: "the_penny_lane_project/embr" },
  ready: { scanDir: "the_penny_lane_project/ready" },
  Dashboard: { scanDir: "the_penny_lane_project/dashboard" },
  "Restoration Project": { scanDir: "the_penny_lane_project/restoration-project" },
  "sarahsahl.pro": { scanDir: "the_penny_lane_project/sarahsahl_pro" },
};

export function applyProjectDefaults(project: Project): Project {
  if (project.sourceType && project.auditConfig?.scanRoots?.length) {
    return project;
  }
  const portfolio = PORTFOLIO_DEFAULTS[project.name];
  if (!portfolio) {
    return {
      ...project,
      status: project.status ?? "active",
      sourceType: project.sourceType ?? "import",
    };
  }
  return {
    ...project,
    status: project.status ?? "active",
    sourceType: project.sourceType ?? "portfolio_mirror",
    sourceRef: project.sourceRef ?? portfolio.scanDir,
    repoAccess: {
      ...project.repoAccess,
      mirrorPath: project.repoAccess?.mirrorPath ?? portfolio.scanDir,
    },
    auditConfig: {
      ...project.auditConfig,
      scanRoots:
        project.auditConfig?.scanRoots && project.auditConfig.scanRoots.length > 0
          ? project.auditConfig.scanRoots
          : [portfolio.scanDir],
    },
  };
}
