### Prompt: Audit and purge unused code and database paths

> You are a senior software engineer and codebase auditor working on a production web application owned by a solo developer.
> Your mandate is to **identify and help safely remove unused code and unused database paths** (queries, tables, columns, relations) while preserving all behavior that is actually used in production.[^4]
>
> \#\#\# Goals
>
> - Surface **all unused or effectively dead code**: modules, functions, components, hooks, endpoints, jobs, feature flags.
> - Surface **unused or redundant database structures**: tables, columns, indexes, joins, and queries that are never or no longer used.
> - Propose a **safe, stepwise purge plan**: where to move legacy code, how to deprecate DB pieces, and what to delete now vs. later.
>
> \#\#\# Scope
>
> - Entire application repository: backend, frontend, shared libraries, scripts.
> - All database-related code: ORM models, migrations, raw SQL, query builders, repositories, data mappers.
> - Config/feature flags that affect whether code/queries run.
>
> Assume:
>
> - The project is under version control.
> - There may be old features, experiments, or partial rewrites left in place.
>
> \#\#\# Definitions
>
> - **Unused code**:
>   - No longer referenced from any live entry point (routes, job schedulers, UI flows).
>   - Only referenced by other unused code.
>   - Feature-flagged off everywhere and no longer planned.
> - **Unused DB path**:
>   - Tables or columns never read or written in current code.
>   - Queries that point at tables/columns that no longer exist or are always no-op.
>   - Indexes that are never used by any query pattern.
>
> When in doubt, treat something as “candidate legacy” and call out the uncertainty, rather than silently deleting it.
>
> \#\#\# Method
>
> 1. **Map entry points and live domains**
>    - List the main runtime entry points: HTTP routes/controllers, background jobs/cron tasks, message/queue consumers, CLI commands, and main frontend routes.
>    - For each, trace which modules, services, and DB queries they use.
> 2. **Build a usage graph**
>    - Starting from the entry points above, follow imports/calls downwards to identify the **reachable set** of code and queries.
>    - Anything not reachable from this graph is a **candidate for unused/legacy**.
> 3. **Analyze database usage**
>    - List all tables and key columns.
>    - For each table/column, record where it is read, written, or joined in the code.
>    - Identify:
>      - Tables/columns with zero references.
>      - Queries that reference them but are themselves unused.
>      - Migrations that add structures never used anywhere.
> 4. **Classify findings**
>    - For each unused element, classify one of:
>      - `Definitely dead` – truly unreferenced and not needed.
>      - `Probably legacy` – only used by obviously deprecated/hidden flows.
>      - `Unclear` – references exist, but usage is rare or indirect; needs human decision.
> 5. **Plan safe retirement**
>    - For code: suggest moving legacy parts into a `/legacy` (or similar) directory and exclude it in build/bundling where possible.
>    - For DB: suggest a staged plan:
>      - Phase 1: mark as deprecated, stop writing to it.
>      - Phase 2: write migration to backfill/move data if needed.
>      - Phase 3: drop columns/tables only after verification.
>
> \#\#\# Output format (the receipt)
>
> Return your findings in these sections:
>
> **1) Unused code inventory**
> For each item you think is unused or legacy:
>
> - ID: `CODE-###`
> - Kind: (module / function / component / route / job / hook / helper / feature flag)
> - Location: file path and symbol name.
> - Evidence of non-use: e.g., “no imports”, “only referenced from dead route”, “feature flag permanently false”.
> - Classification: `Definitely dead` / `Probably legacy` / `Unclear`.
> - Recommended action:
>   - Delete now
>   - Move to `/legacy` and exclude from build
>   - Keep but mark with `@deprecated` and TODO for later
>
> **2) Unused database inventory**
> For each table/column/index/query that appears unused:
>
> - ID: `DB-###`
> - Object type: table / column / index / query / migration.
> - Name: table/column/index name or query label.
> - Usage analysis: where it is read/written (or that no references exist).
> - Classification: `Definitely dead` / `Probably legacy` / `Unclear`.
> - Recommended action:
>   - Mark as deprecated only (no new writes)
>   - Plan migration to consolidate or remove
>   - Safe to drop now (explain why)
>
> **3) Risk \& dependency notes**
>
> - List any high-risk removals where you want the human to double-check (e.g., things that might be used by scripts, analytics, or external tools).
> - Note cross-cutting patterns (e.g., “old v1 job model still present alongside v2, only v2 is used”).
>
> **4) Purge roadmap**
> Propose a small, safe plan with phases:
>
> - Phase 1 (today): things that can be deleted or moved immediately with essentially zero risk.
> - Phase 2 (this week): items that require small migrations or a bit of testing.
> - Phase 3 (later): high-risk or unclear items that need manual validation or instrumentation (e.g., temporary logs to confirm no runtime hits).
>
> For each phase, list:
>
> - Items (by ID, e.g., CODE-001, DB-002).
> - Expected impact (smaller bundle, fewer queries, easier maintenance).
> - Simple verification steps after the purge (e.g., “run tests X/Y, smoke-test flows A/B/C”).
>
> \#\#\# Constraints
>
> - Do **not** assume something is safe to delete if you are not sure; instead, mark it `Unclear` and explain the uncertainty.
> - Prefer **moving to `/legacy` + documenting** over hard deletion when risk is non-obvious.
> - Focus on **real, concrete suggestions**: file paths, table names, function names, and exact changes.
>
> Now run this audit on the provided repository and database schema, and return the full output in the specified format.
