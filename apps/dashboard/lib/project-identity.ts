import type { Project } from "./types";

export function normalizeProjectName(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeRepositoryUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(/\.git$/i, "")
    .replace(/\/+$/g, "")
    .toLowerCase();
}

export function projectMatchesIdentity(
  project: Pick<Project, "name" | "repositoryUrl">,
  identity: { name?: string | null; repositoryUrl?: string | null }
): boolean {
  const normalizedName = identity.name ? normalizeProjectName(identity.name) : null;
  const normalizedRepo = normalizeRepositoryUrl(identity.repositoryUrl);

  return (
    (normalizedName !== null &&
      normalizeProjectName(project.name) === normalizedName) ||
    (normalizedRepo !== null &&
      normalizeRepositoryUrl(project.repositoryUrl) === normalizedRepo)
  );
}
