# Finding: f-cabdbd5c

> **Status:** open | **Severity:** minor | **Priority:** P2 | **Type:** bug | **Confidence:** evidence

## Title

Bearer secrets compared with plain equality

## Description

Repair service `require_auth` and the repair-callback use `!=` / `!==` for bearer tokens. Attack scenario: local timing side channels are usually low risk on cloud runtimes, but network attackers with very fine-grained timing to the same instance could theoretically learn bytes; primary practical concern is consistency with crypto best practices for long-lived shared secrets.

## Impact

Marginal risk of secret byte leakage via timing; defense-in-depth gap versus constant-time compare.

## Suggested fix

Use timing-safe comparison (e.g. `hmac.compare_digest` in Python; SubtleCrypto or hex compare loop in Deno) after normalizing encoding once.

**Affected files:** `services/repair/api/auth.py`, `supabase/functions/repair-callback/index.ts`

## Proof hooks

- **[code_ref]** String compare for bearer token.
- **[code_ref]** String compare for callback bearer.

## History

- 2026-04-11T12:00:00.000Z — **security-and-privacy-auditor** — created: Pairing Python and Deno bearer checks.

---
*Last canonical synthesizer run: `synthesized-20260411-161232`*
