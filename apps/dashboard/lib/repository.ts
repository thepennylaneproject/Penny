/**
 * Repository interface for projects and findings.
 * Implementations: local JSON (default), later hosted DB.
 */

import type { Project, Finding, OpenFindingsSchema } from "./types";

export interface ProjectsRepository {
  list(): Promise<Project[]>;
  getByName(name: string): Promise<Project | null>;
  create(project: Project): Promise<Project>;
  update(project: Project): Promise<Project>;
  delete(name: string): Promise<void>;
}

export interface ImportResult {
  project: Project;
  created: boolean;
}

export function parseOpenFindingsPayload(
  body: string
): { findings: Finding[] } {
  const data = JSON.parse(body) as OpenFindingsSchema & { findings?: Finding[] };
  const hasOpen = Object.prototype.hasOwnProperty.call(data, "open_findings");
  const hasFindings = Object.prototype.hasOwnProperty.call(data, "findings");
  if (!hasOpen && !hasFindings) {
    throw new Error("No findings array found");
  }
  const findings = data.open_findings ?? data.findings ?? [];
  if (!Array.isArray(findings)) {
    throw new Error("No findings array found");
  }
  return {
    findings,
  };
}
