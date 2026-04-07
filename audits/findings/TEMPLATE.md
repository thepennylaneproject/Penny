# Finding: {{FINDING_ID}}

> **Status:** {{status}} | **Severity:** {{severity}} | **Priority:** {{priority}} | **Type:** {{type}} | **Confidence:** {{confidence}}

## Title

{{title}}

## Description

{{description}}

## Proof Hooks

{{#each proof_hooks}}
### [{{hook_type}}] {{summary}}
| Field | Value |
|-------|-------|
{{#if file}}| File | `{{file}}` |{{/if}}
{{#if symbol}}| Symbol | `{{symbol}}` |{{/if}}
{{#if start_line}}| Lines | {{start_line}}-{{end_line}} |{{/if}}
{{#if error_text}}| Error | `{{error_text}}` |{{/if}}
{{#if command}}| Command | `{{command}}` |{{/if}}
{{#if expected}}| Expected | {{expected}} |{{/if}}
{{#if actual}}| Actual | {{actual}} |{{/if}}
{{#if route}}| Route | `{{route}}` |{{/if}}
{{#if selector}}| Selector | `{{selector}}` |{{/if}}
{{#if config_key}}| Config Key | `{{config_key}}` |{{/if}}
{{#if query_text}}| Query | `{{query_text}}` |{{/if}}
{{#if artifact_path}}| Artifact | `{{artifact_path}}` |{{/if}}
{{#if steps}}
**Steps:**
{{#each steps}}
{{@index}}. {{this}}
{{/each}}
{{/if}}
{{/each}}

## Reproduction Steps

{{#each repro_steps}}
{{@index}}. {{this}}
{{/each}}

_(Optional for enhancements, debt, and questions.)_

## Impact

{{impact}}

## Suggested Fix

**Approach:** {{suggested_fix.approach}}

**Affected files:** {{#each suggested_fix.affected_files}}`{{this}}` {{/each}}
**Effort:** {{suggested_fix.estimated_effort}}
**Risk:** {{suggested_fix.risk_notes}}

## Tests Needed

{{#each suggested_fix.tests_needed}}
- [ ] {{this}}
{{/each}}

## Related Findings

| ID | Relationship |
|----|-------------|
{{#each related_ids}}
| {{this}} | _(describe relationship)_ |
{{/each}}

## Timeline

| Date | Actor | Event | Notes |
|------|-------|-------|-------|
{{#each history}}
| {{timestamp}} | {{actor}} | {{event}} | {{notes}} |
{{/each}}

## Artifacts

{{#each artifacts}}
- `{{this}}`
{{/each}}

_(Add logs, screenshots, or traces to `audits/artifacts/{{FINDING_ID}}/`.)_

## Enhancement Notes

_Future improvements related to this surface area can be noted here. These persist across runs so agents can find them._

## Decision Log (for type: question)

_If this finding is a "question" type, record the product decision and reasoning here when resolved._

- **Decision:** _(pending / option A / option B / ...)_
- **Decided by:** _(solo-dev / team lead / ...)_
- **Date:** _(YYYY-MM-DD)_
- **Reasoning:** _(why this option was chosen)_
