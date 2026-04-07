# Finding: f-27aab98a

> **Status:** open | **Severity:** minor | **Priority:** P2 | **Type:** debt | **Confidence:** evidence

## Title

auditWithLlm sets maxTokens to 12288 for every audit call

## Description

The worker requests up to 12k output tokens per audit call. That raises worst-case cost per call for providers that bill by generated tokens, even when findings JSON is small. Tiered limits by audit_kind or response-size heuristics would reduce tail spend.

## Proof hooks

- **[code_ref]** maxTokens 12288
  - File: `apps/worker/src/llm.ts`

## History

- 2026-04-07T18:45:00.000Z — **synthesizer** — note_added: Normalized finding_id from perf agent id field; merged history.

## Sources

- `perf-20260407-121845`
