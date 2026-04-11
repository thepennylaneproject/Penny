# Lane — Expectations & Boundaries Document

Lane is the **self-hosted coding agent** that runs audit passes and generates repair patches. Penny integrates with Lane over HTTP using a **shared Supabase JWT** (browser: user session; worker: password grant via service credentials). This document states the **integration contract** as implemented in the Penny repo (`apps/worker/src/lane-client.ts`, `apps/dashboard/lib/lane.ts`, `apps/dashboard/app/api/lane/*`).

## 1. Purpose & Scope
> What does this app do? What is it NOT responsible for?

**Responsibilities:**

- Expose **POST `/audit`** and **POST `/generate-patch`** for JSON clients over HTTPS.
- Accept **`Authorization: Bearer <Supabase access token>`** and validate it against the **same Supabase project** Penny uses for dashboard sign-in.
- Return JSON responses in a **stable envelope** with a top-level `data` field for successful calls (see §2).
- Support **audit** requests that identify issues in a repository (scoped paths, optional prompt/metadata).
- Support **patch** requests that turn a single finding into a diff with a **confidence** score in `[0, 1]` (Penny types use `number`).

**Out of Scope:**

- Replacing Penny’s **BullMQ worker**, **17-agent suite**, or **Python repair service** — Penny may call Lane for specific flows; Lane does not subsume the whole Penny platform.
- **Billing, quotas, or Stripe** — not part of the Lane↔Penny contract in this repo.
- **Persisting Penny’s canonical findings schema** inside Lane — Lane returns its own finding shapes; Penny maps or displays them as needed.

---

## 2. API / Interface Contracts
> What endpoints, inputs, and outputs must always exist and behave how?

**Required endpoints:**

| Path | Method | Auth | Purpose |
|------|--------|------|---------|
| `/audit` | POST | Bearer Supabase JWT | Run an audit; return run id, status, summary, findings. |
| `/generate-patch` | POST | Bearer Supabase JWT | Produce a patch (diff) for one finding; return patch id, status, file, diff, confidence. |

**Penny proxies (dashboard):**

- `POST /api/lane/audit` → forwards body to `{LANE_BASE_URL}/audit` with the **same** `Authorization` header.
- `POST /api/lane/generate-patch` → forwards to `{LANE_BASE_URL}/generate-patch`.

Base URL resolution in Penny: `LANE_API_BASE_URL` first, else `NEXT_PUBLIC_LANE_API_BASE_URL`; trailing slashes stripped.

**Input validation rules:**

- **Audit (`mode: "audit"`):** `project_id` (string), `repository` (string) required; optional `prompt`, `project_name`, `scope_paths`, `metadata`.
- **Patch (`mode: "patch"`):** `project_id`, `repository`, and `finding` required; `finding` must include at least `id` and `message` (optional `type`, `severity`, `file` per Penny worker types).
- Requests must be **JSON** with `Content-Type: application/json`.

**Response format standards:**

- Successful responses must be JSON parseable and include an envelope Penny can read:
  - Worker client expects: `{ status: string, data: T }` and uses the **`data`** field only (`lanePost` in `lane-client.ts`).
  - Browser client (`lib/lane.ts`) expects the same: top-level `data` on success.
- Error responses may use HTTP error status with `detail` or `error` string fields (Penny surfaces these messages).

**Response shapes (`data`):**

- **Audit:** `run_id`, `status` ∈ `queued` \| `running` \| `completed` \| `failed`, `summary`, `findings[]` with `id`, `type`, `severity`, `file`, `message` per finding.
- **Patch:** `patch_id`, `status` ∈ `queued` \| `running` \| `completed` \| `failed`, `file`, `diff`, `confidence`.

---

## 3. Security Boundaries
> What must never happen from a security perspective?

**Forbidden patterns:**

- No hardcoded secrets or credentials in Lane or Penny integration code paths.
- No **LANE_SERVICE_TOKEN** / worker email in **browser** bundles — worker-only env (`lane-client.ts` uses password grant server-side).
- No calling Lane **without** a valid Supabase bearer token on user-facing dashboard flows.

**Required security features:**

- **TLS** to Lane base URL in production.
- **Bearer token** validation on Lane for every `/audit` and `/generate-patch` request.
- Penny dashboard API routes **reject** requests missing `Authorization: Bearer …` with **401** (`api/lane/audit`, `api/lane/generate-patch`).
- If Lane is not configured, Penny returns **503** with a clear error (no upstream call).

---

## 4. Code Standards
> What coding patterns, naming conventions, and structural rules must be followed?

**Language/framework rules:**

- Lane HTTP API should remain **JSON in / JSON out**; version breaking changes require coordinated updates to `LaneAudit*` / `LanePatch*` types in Penny.

**File structure rules:**

- Penny integration types should stay aligned between `apps/worker/src/lane-client.ts` and `apps/dashboard/lib/lane.ts` (same field names for shared payloads).

**Naming conventions:**

- Environment variables: `LANE_API_BASE_URL` (server), `NEXT_PUBLIC_LANE_API_BASE_URL` (public base for browser); worker additionally uses `LANE_WORKER_EMAIL`, `LANE_SERVICE_TOKEN` for Supabase password grant.

---

## 5. Testing Requirements
> What test coverage and test types are required?

- Minimum test coverage: **not specified in repo** for Lane itself — Penny uses **unit tests** that reference Lane-shaped payloads (e.g. degraded audit findings). **UNDOCUMENTED CONSTRAINT:** set an org-wide % for Lane service code when the Lane repository is audited.
- Required test types: **unit** for request/response parsing; **integration** recommended for `/audit` and `/generate-patch` against a staging Lane + Supabase.
- Tests must pass before merge: **yes** (Penny CI expectation for `apps/dashboard` — `npm run ci`).

---

## 6. Performance Boundaries
> What performance characteristics must be maintained?

- Max response time: **not defined in Penny codebase** for Lane — **UNDOCUMENTED CONSTRAINT:** define SLAs (e.g. p95 latency for `/audit` vs `/generate-patch`).
- Prohibited patterns: unbounded repository scans without scope; blocking the **worker** event loop on Lane HTTP (use timeouts at fetch layer in Lane service — not specified here).

---

## 7. Dependencies & Integrations
> What external services/packages are allowed or forbidden?

**Approved dependencies:**

- **Supabase Auth** (same project as Penny) for JWT issuance and validation.
- **HTTPS** JSON API for Penny worker and dashboard.

**Forbidden dependencies:**

- **Not specified** for Lane standalone — Penny’s onboarding guidance flags **unapproved analytics SDKs** for *audited* apps; Lane should not add tracking that violates portfolio policy without explicit approval.

---

## 8. Compliance Checklist
A quick yes/no list the audit agent can scan against:

- [ ] `/audit` and `/generate-patch` are documented and stable (this document + Penny types).
- [ ] No secrets in source code (tokens via env only).
- [ ] JSON inputs validated before execution (Lane service responsibility).
- [ ] Tests present and passing (Lane repo + Penny integration tests where applicable).
- [ ] Error handling present on all async operations (Penny API routes catch and return JSON errors).
- [ ] Logging implemented per org standards (Lane service — **owner to confirm**).

---

## References (Penny codebase)

- Worker client: `apps/worker/src/lane-client.ts`
- Dashboard client: `apps/dashboard/lib/lane.ts`
- Proxies: `apps/dashboard/app/api/lane/audit/route.ts`, `apps/dashboard/app/api/lane/generate-patch/route.ts`
- Env examples: `.env.example` (`NEXT_PUBLIC_LANE_API_BASE_URL`, `LANE_API_BASE_URL`, worker `LANE_*`)
