import type { Project } from "./types";
import type { ProjectsRepository } from "./repository";
import { normalizeProjectName, projectMatchesIdentity } from "./project-identity";
import { applyProjectDefaults } from "./project-defaults";
import { withNormalizedBacklog } from "./maintenance-backlog";

const projects: Map<string, Project> = new Map();

function resolveProjectKey(
  name: string,
  repositoryUrl?: string
): string | null {
  if (projects.has(name)) return name;
  for (const [key, project] of projects.entries()) {
    if (
      projectMatchesIdentity(project, {
        name,
        repositoryUrl,
      })
    ) {
      return key;
    }
  }
  return null;
}

export const memoryRepository: ProjectsRepository = {
  async list() {
    return Array.from(projects.values()).map((project) =>
      withNormalizedBacklog(applyProjectDefaults(project))
    );
  },

  async getByName(name: string) {
    const key =
      resolveProjectKey(name) ??
      Array.from(projects.keys()).find(
        (projectName) => normalizeProjectName(projectName) === normalizeProjectName(name)
      ) ??
      null;
    const project = key ? projects.get(key) ?? null : null;
    return project ? withNormalizedBacklog(applyProjectDefaults(project)) : null;
  },

  async create(project: Project) {
    const key = resolveProjectKey(project.name, project.repositoryUrl);
    if (key) {
      throw new Error(`Project ${key} already exists`);
    }
    const withMeta = {
      ...withNormalizedBacklog(applyProjectDefaults(project)),
      lastUpdated: new Date().toISOString(),
    };
    projects.set(project.name, withMeta);
    return withMeta;
  },

  async update(project: Project) {
    const key = resolveProjectKey(project.name, project.repositoryUrl);
    if (!key) {
      throw new Error(`Project ${project.name} not found`);
    }
    const withMeta = {
      ...withNormalizedBacklog(applyProjectDefaults(project)),
      name: key,
      lastUpdated: new Date().toISOString(),
    };
    projects.set(key, withMeta);
    return withMeta;
  },

  async delete(name: string) {
    const key = resolveProjectKey(name);
    if (key) {
      projects.delete(key);
    }
  },
};
