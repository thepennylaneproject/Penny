/**
 * Supabase/Postgres persistence for projects (penny_projects table).
 */

import type { Project } from "./types";
import type { ProjectsRepository } from "./repository";
import { createPostgresPool, quoteIdent, readDatabaseConfig } from "./postgres";
import { applyProjectDefaults } from "./project-defaults";
import { withNormalizedBacklog } from "./maintenance-backlog";
import {
  normalizeProjectName,
  normalizeRepositoryUrl,
} from "./project-identity";
import {
  recordDurableEventBestEffort,
  recordProjectSnapshotBestEffort,
} from "./durable-state";

const TABLE = "penny_projects";

function pool() {
  return createPostgresPool();
}

async function findCanonicalProjectRow(
  name: string,
  repositoryUrl?: string | null
): Promise<Record<string, unknown> | null> {
  const db = pool();
  const normalizedName = normalizeProjectName(name);
  const normalizedRepo = normalizeRepositoryUrl(repositoryUrl);
  const rows = await db.query(
    `SELECT name, repository_url, project_json, updated_at
       FROM ${TABLE}
      WHERE lower(name) = $1
         OR (
           $2::text IS NOT NULL
           AND repository_url IS NOT NULL
           AND lower(
             regexp_replace(
               regexp_replace(repository_url, '\\.git$', '', 'i'),
               '/+$',
               ''
             )
           ) = $2
         )
      ORDER BY
        CASE
          WHEN name = $3 THEN 0
          WHEN lower(name) = $1 THEN 1
          WHEN $2::text IS NOT NULL
            AND repository_url IS NOT NULL
            AND lower(
              regexp_replace(
                regexp_replace(repository_url, '\\.git$', '', 'i'),
                '/+$',
                ''
              )
            ) = $2 THEN 2
          ELSE 3
        END,
        updated_at DESC
      LIMIT 1`,
    [normalizedName, normalizedRepo, name]
  );
  return rows[0] ?? null;
}

function rowToProject(row: Record<string, unknown>): Project {
  const raw = row.project_json;
  const projectJson =
    typeof raw === "string"
      ? (JSON.parse(raw) as Project)
      : (raw as Project);
  const name = String(row.name ?? projectJson.name ?? "");
  return withNormalizedBacklog({
    ...applyProjectDefaults(projectJson),
    name,
    findings: Array.isArray(projectJson.findings) ? projectJson.findings : [],
    repositoryUrl:
      (row.repository_url as string) || projectJson.repositoryUrl,
    lastUpdated:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at ?? projectJson.lastUpdated ?? ""),
  });
}

export function hasSupabaseProjectsStore(): boolean {
  return readDatabaseConfig().configured;
}

export function createSupabaseRepository(): ProjectsRepository {
  const db = pool();
  return {
    async list() {
      const rows = await db.query(
        `SELECT name, repository_url, project_json, updated_at FROM ${TABLE} ORDER BY name ASC`
      );
      return rows.map(rowToProject);
    },

    async getByName(name: string) {
      const row = await findCanonicalProjectRow(name);
      return row ? rowToProject(row) : null;
    },

    async create(project: Project) {
      const existing = await findCanonicalProjectRow(
        project.name,
        project.repositoryUrl
      );
      if (existing) {
        throw new Error(`Project ${String(existing.name)} already exists`);
      }
      const now = new Date().toISOString();
      const repositoryUrl = normalizeRepositoryUrl(project.repositoryUrl) ?? null;
      const withMeta: Project = {
        ...withNormalizedBacklog(applyProjectDefaults(project)),
        lastUpdated: now,
        repositoryUrl: repositoryUrl ?? undefined,
      };
      await db.query(
        `INSERT INTO ${TABLE} (name, repository_url, project_json, updated_at)
         VALUES ($1, $2, $3::jsonb, now())`,
        [
          withMeta.name,
          withMeta.repositoryUrl ?? null,
          JSON.stringify(withMeta),
        ]
      );
      await recordProjectSnapshotBestEffort(
        withMeta,
        "supabase_projects",
        "project_created"
      );
      await recordDurableEventBestEffort({
        event_type: "project_created",
        project_name: withMeta.name,
        source: "supabase_projects",
        summary: `Created project ${withMeta.name}`,
      });
      return withMeta;
    },

    async update(project: Project) {
      const existing = await findCanonicalProjectRow(
        project.name,
        project.repositoryUrl
      );
      if (!existing) {
        throw new Error(`Project ${project.name} not found`);
      }
      const now = new Date().toISOString();
      const repositoryUrl = normalizeRepositoryUrl(project.repositoryUrl) ?? null;
      const withMeta: Project = {
        ...withNormalizedBacklog(applyProjectDefaults(project)),
        name: String(existing.name),
        lastUpdated: now,
        repositoryUrl: repositoryUrl ?? undefined,
      };
      const result = await db.query(
        `UPDATE ${TABLE}
         SET repository_url = $2, project_json = $3::jsonb, updated_at = now()
         WHERE name = $1
         RETURNING name`,
        [
          withMeta.name,
          repositoryUrl,
          JSON.stringify(withMeta),
        ]
      );
      if (result.length === 0) {
        throw new Error(`Project ${project.name} not found`);
      }
      await recordProjectSnapshotBestEffort(
        withMeta,
        "supabase_projects",
        "project_updated"
      );
      await recordDurableEventBestEffort({
        event_type: "project_updated",
        project_name: withMeta.name,
        source: "supabase_projects",
        summary: `Updated project ${withMeta.name}`,
      });
      return withMeta;
    },

    async delete(name: string) {
      const existing = await findCanonicalProjectRow(name);
      if (!existing) {
        throw new Error(`Project ${name} not found`);
      }
      const canonical = String(existing.name);
      const cfg = readDatabaseConfig();
      const eventsFqn = `${quoteIdent(cfg.schema)}.${quoteIdent(cfg.eventsTable)}`;
      const snapshotsFqn = `${quoteIdent(cfg.schema)}.${quoteIdent(cfg.snapshotsTable)}`;

      await db.transaction(async (q) => {
        // FK on project is ON DELETE SET NULL — remove rows so the project leaves no audit/job history.
        await q(`DELETE FROM public.penny_audit_runs WHERE project_name = $1`, [canonical]);
        await q(`DELETE FROM public.penny_audit_jobs WHERE project_name = $1`, [canonical]);
        await q(`DELETE FROM ${eventsFqn} WHERE project_name = $1`, [canonical]);
        await q(`DELETE FROM ${snapshotsFqn} WHERE project_name = $1`, [canonical]);
        const result = await q(
          `DELETE FROM ${TABLE} WHERE name = $1 RETURNING name`,
          [canonical]
        );
        if (result.length === 0) {
          throw new Error(`Project ${name} not found`);
        }
      });

      await recordDurableEventBestEffort({
        event_type: "project_deleted",
        project_name: canonical,
        source: "supabase_projects",
        summary: `Deleted project ${canonical}`,
      });
    },
  };
}
