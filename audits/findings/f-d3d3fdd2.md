# Finding: f-d3d3fdd2

> **Status:** open | **Severity:** major | **Priority:** P1 | **Type:** bug | **Confidence:** inference

## Title

Routing API returns HTTP 200 with default config when file-backed config throws

## Description

GET /api/engine/routing catches any error from readFileRoutingConfig/buildRoutingConfig, logs it, then responds with NextResponse.json(buildRoutingConfig(), { status: 200 }). Callers and caches see a successful response and cannot distinguish failure from a valid empty/default routing configuration, which can hide misconfiguration or disk/read errors in production.

## Impact

Operators and UIs may assume routing is valid when the engine is actually using fallbacks after a failed read; debugging production routing issues becomes harder and monitoring based on HTTP status will not fire.

## Suggested fix

On configuration read failure, return 503 or 500 with a structured error body, or include a boolean flag such as ok:false / source:'fallback' in the JSON while still returning a safe default if the product requires a body. Align with other engine routes that surface errors.

**Affected files:** `apps/dashboard/app/api/engine/routing/route.ts`

## Proof hooks

- **[code_ref]** Catch block returns 200 with default buildRoutingConfig() after logging the error.

## History

- 2026-04-11T14:30:52Z — **runtime-bug-hunter** — created: Derived from static review of route handler.

---
*Last canonical synthesizer run: `synthesized-20260411-161232`*
