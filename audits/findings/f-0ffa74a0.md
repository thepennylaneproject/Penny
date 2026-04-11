# Finding: f-0ffa74a0

> **Status:** open | **Severity:** major | **Priority:** P1 | **Type:** debt | **Confidence:** evidence

## Title

Dashboard server Supabase client uses the service role key, bypassing RLS

## Description

`createSupabaseServerClient` builds the JS client with `SUPABASE_SERVICE_ROLE_KEY`. In Supabase, the service role bypasses row level security. Policies on `projects`, `findings`, `audit_runs`, and related tables therefore do not constrain queries from API routes that use this client. Multi-tenant isolation must rely entirely on application-level checks (middleware, explicit filters). This contradicts comments in 20260408120000_penny_tables_rls.sql that imply end-user JWT usage for dashboard routes.

## Impact

See description.

## Suggested fix

See synthesizer merged notes and agent description.

**Affected files:** —

## Proof hooks

- **[code_ref]** [code_ref] return createClient(config.url, config.serviceRoleKey, {
- **[code_ref]** [code_ref] Client access: dashboard routes using createSupabaseServerClient use the end-user JWT (authenticated);

## History

- 2026-04-11T16:12:32Z — **schema-auditor** — created: From data suite agent output.
- 2026-04-11T16:12:32Z — **synthesizer** — note_added: Normalized schema-auditor output: finding_id, proof_hooks.summary, history, suggested_fix defaults per LYRA 1.1.0.

---
*Last canonical synthesizer run: `synthesized-20260411-161232`*
