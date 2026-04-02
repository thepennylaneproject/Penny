# Penny Confidence Scoring Framework

**The thing that actually separates "cool" from "dangerous in a good way"**

---

## Problem Statement

A patch that passes 95% of validation checks is NOT 95% confident.

**Example:**
- Linting: ✅ pass
- Typecheck: ✅ pass
- Unit tests: ❌ fail (1 of 10 fail)
- Integration tests: N/A

This is ~75% on validation, but what's the actual **confidence** this is safe to merge?

Current system: **vibes in a suit**

---

## Confidence Score Formula

```
Confidence = (Validation_Weight × Validation_Score)
           + (Locality_Weight × Locality_Score)
           + (Risk_Weight × Risk_Score)
           - (Uncertainty_Penalty)
```

**Weights:** (Tunable, but suggested defaults)
- Validation: 40%
- Locality: 30%
- Risk: 20%
- Uncertainty: -10%

---

## Component 1: Validation Score (40%)

**What it measures:** Did the patch pass automated checks?

### Calculation

```
validation_score = weighted_average([
  lint_pass × 0.20,      // Style/consistency
  typecheck_pass × 0.35, // Type safety (most important)
  test_pass × 0.35,      // Functional correctness
  coverage_change × 0.10 // Did we improve/maintain coverage?
])
```

**Scoring rules:**

| Check | Weight | Pass | Partial | Fail |
|-------|--------|------|---------|------|
| Lint | 20% | 100 | 50 | 0 |
| Typecheck | 35% | 100 | 25 | 0 |
| Tests | 35% | 100 | 50 | 0 |
| Coverage | 10% | 100 | 50 | 0 |

**Partial credit:**
- Lint: 1-2 warnings = 50 (not critical)
- Typecheck: Type errors only in new code = 50
- Tests: 75%+ pass = 50 | <75% pass = 0
- Coverage: +1% coverage = 50 | -coverage = 0

**Examples:**

```
Scenario A: lint✅ typecheck✅ tests✅ coverage+
→ (0.20×100 + 0.35×100 + 0.35×100 + 0.10×100) = 100

Scenario B: lint✅ typecheck✅ tests❌(5/10) coverage-
→ (0.20×100 + 0.35×100 + 0.35×0 + 0.10×0) = 55

Scenario C: lint⚠️ typecheck✅ tests⚠️(80%) coverage✅
→ (0.20×50 + 0.35×100 + 0.35×50 + 0.10×100) = 62.5
```

---

## Component 2: Locality Score (30%)

**What it measures:** Is the patch surgical or invasive?

Wide patches = higher risk = lower confidence (even if tests pass)

### Calculation

```
locality_score = 100 - (invasiveness_penalty)
```

**Invasiveness scoring:**

| Metric | Value | Penalty |
|--------|-------|---------|
| Files changed | 1 | 0 |
| | 2-3 | 5 |
| | 4-10 | 15 |
| | 11+ | 40 |
| Lines changed | <20 | 0 |
| | 20-50 | 5 |
| | 51-200 | 10 |
| | 201+ | 25 |
| Functions modified | 1 | 0 |
| | 2-4 | 5 |
| | 5+ | 20 |
| Imports/deps changed | None | 0 |
| | Same imports | 0 |
| | New imports (local) | 5 |
| | New imports (external) | 20 |
| | Dependency upgrades | 50 |

**Examples:**

```
Scenario A: 1 file, 15 lines, 1 function, no imports
→ 100 - (0 + 0 + 0 + 0) = 100

Scenario B: 3 files, 80 lines, 4 functions, new local imports
→ 100 - (5 + 5 + 5 + 5) = 80

Scenario C: 15 files, 300 lines, 8 functions, dependency upgrade
→ 100 - (40 + 25 + 20 + 50) = -35 → **FLOOR at 0**
  (This never gets repaired regardless of validation)
```

---

## Component 3: Risk Classification (20%)

**What it measures:** What *type* of change is this?

Risk level depends on domain + severity:

```
risk_score = base_safety × domain_multiplier × severity_multiplier
```

### Risk Matrix

| Domain | Type | Base Safety | Severity Mult | Notes |
|--------|------|-------------|---------------|-------|
| Logic | bug fix | 90% | ×0.9 | Safe, often well-tested |
| Logic | refactor | 70% | ×0.8 | Riskier, may affect behavior |
| Data | schema fix | 50% | ×0.7 | Very risky, can corrupt |
| Data | validation add | 85% | ×0.9 | Safer, defensive |
| Security | fix | 75% | ×1.2 | Critical but may break UX |
| Security | vulnerability patch | 60% | ×1.5 | Highest risk (may have side effects) |
| Performance | optimization | 80% | ×0.8 | Usually safe |
| UX | improvement | 95% | ×0.9 | Lowest risk |
| Style | cleanup | 99% | ×0.5 | Nearly zero risk |

**Severity modifiers:**
- critical finding: ×1.5 (higher inherent risk)
- high finding: ×1.0 (baseline)
- medium finding: ×0.8
- low finding: ×0.5

**Examples:**

```
Scenario A: Logic bug fix, medium severity
→ 90 × 0.8 × 0.8 = 57.6

Scenario B: Security vulnerability patch, critical severity
→ 60 × 1.5 × 1.5 = 135 → **FLOOR at 100**
  (Can't exceed 100, but contributes to overall confidence negatively)

Scenario C: Style cleanup
→ 99 × 0.5 × 0.8 = 39.6
  (Low risk overall)
```

---

## Component 4: Uncertainty Penalty (-10%)

**What it measures:** Did the LLM express doubt?

Semantic analysis of LLM output:

```
penalty = base_penalty + doubt_penalty + hallucination_penalty
```

### Doubt Detection

Scan LLM reasoning for phrases like:

```
- "might be", "could cause", "possibly"
- "I'm not entirely sure"
- "This assumes X without verifying"
- "Edge case: [unhandled case]"
- "Alternatively, consider [conflicting approach]"
```

**Scoring:**

| Indicator | Penalty |
|-----------|---------|
| No doubt signals | 0 |
| 1-2 uncertainty phrases | 5 |
| 3-5 uncertainty phrases | 10 |
| >5 or explicit "I'm unsure" | 15 |

### Hallucination Detection

Red flags in patch content:

| Flag | Penalty |
|------|---------|
| References undefined variable | 10 |
| Calls non-existent function | 10 |
| Syntax error in patch | 15 |
| Patch redefines import mid-function | 8 |
| Unused variable introduced | 3 |

---

## Final Confidence Buckets

```
confidence = (validation × 0.40) 
           + (locality × 0.30)
           + (risk × 0.20)
           - (uncertainty × 0.10)

if locality_score < 0: confidence = 0  // Blocking condition
if validation_score < 30: confidence = 0  // Blocking condition
```

### Action Matrix

| Confidence | Action | Mode | Notes |
|------------|--------|------|-------|
| **≥98%** | **Auto branch + ready PR** | Fast lane | Minimal review needed |
| 95-97% | Auto branch + ready PR | Standard | Normal review |
| 90-94% | Auto branch + ready PR | Standard | Highlight for review |
| 85-89% | Auto branch + draft PR | Caution | Needs explicit review |
| 75-84% | Draft PR only | Manual | Reviewer decides |
| <75% | Don't repair | Blocked | Too risky |

---

## Governance Rules (From Your Decision)

Apply these **after** confidence is calculated:

### Rule 1: Vulnerability Gating
```
if finding_type == "vulnerability":
    if confidence < 97:
        confidence = 0  // Don't repair
    if patch.introduces_dependency_upgrade:
        confidence = 0  // Block upgrades
    if locality_score < 80:
        confidence = 0  // Must be surgical
```

### Rule 2: Auto-Merge Prevention
```
# Never auto-merge, even at 99%
if confidence >= 98:
    mode = "fast_lane_ready_pr"  // Not "auto_merge"
```

### Rule 3: Concurrency Limiting
```
concurrent_repairs_per_repo = min(
    5,
    max(1, queued_jobs / confidence)
)
# More repairs with low confidence get queued
```

### Rule 4: Timeout Escalation
```
timeout_seconds = clamp(user_config.timeout, 30, 900)
if confidence < 70:
    timeout_seconds = min(timeout_seconds, 180)  // Cap at 3m
```

---

## Confidence Score Examples

### Example 1: Simple Logic Fix (No dependencies)

**Finding:** Unreachable code branch in utils.ts

**Patch:**
- 1 file changed
- 5 lines
- 1 function modified
- No imports changed
- Logic bug fix (high severity)

**Validation:**
- Lint: ✅ pass
- Typecheck: ✅ pass
- Tests: ✅ pass (all 12)
- Coverage: +1%

**LLM output:** Clear, no uncertainty phrases

**Calculation:**
```
Validation: (0.2×100 + 0.35×100 + 0.35×100 + 0.1×100) = 100
Locality: 100 - 0 = 100
Risk: 90 × 1.0 × 1.0 = 90
Uncertainty: 0

Confidence = (100×0.4) + (100×0.3) + (90×0.2) - (0×0.1)
           = 40 + 30 + 18 - 0
           = 88%

Action: Draft PR (caution mode)
```

---

### Example 2: Security Patch with Uncertainty

**Finding:** Missing input validation in API route

**Patch:**
- 2 files changed
- 35 lines
- 3 functions modified
- New npm package imported (zod for validation)
- Security fix (critical)

**Validation:**
- Lint: ⚠️ pass (2 style warnings)
- Typecheck: ✅ pass
- Tests: ⚠️ partial (8/10 pass)
- Coverage: -2%

**LLM output:** "This might break existing requests if they don't match schema... I'm not entirely sure about edge cases with legacy clients"

**Calculation:**
```
Validation: (0.2×50 + 0.35×100 + 0.35×50 + 0.1×0) = 52.5
Locality: 100 - (5 + 5 + 5 + 20) = 65
Risk: 60 × 1.5 × 1.5 = 135 → capped at 100
Uncertainty: 10 (2-3 uncertainty phrases)

Confidence = (52.5×0.4) + (65×0.3) + (100×0.2) - (10×0.1)
           = 21 + 19.5 + 20 - 1
           = 59.5%

Action: Don't repair (blocked)
Reason: Confidence < 75%, and it's a security patch with legitimate uncertainty
```

---

### Example 3: Perfect Refactor

**Finding:** Dead code in reducer

**Patch:**
- 1 file changed
- 12 lines
- 1 function simplified
- No imports
- Style cleanup (low severity)

**Validation:**
- Lint: ✅ pass
- Typecheck: ✅ pass
- Tests: ✅ pass (all 24)
- Coverage: +0% (no behavioral change)

**LLM output:** Clear, confident reasoning

**Calculation:**
```
Validation: (0.2×100 + 0.35×100 + 0.35×100 + 0.1×0) = 90
Locality: 100 - 0 = 100
Risk: 99 × 0.5 × 0.5 = 24.75
Uncertainty: 0

Confidence = (90×0.4) + (100×0.3) + (24.75×0.2) - 0
           = 36 + 30 + 4.95
           = 70.95%

Action: Draft PR
Reason: Low risk (style), but style fixes aren't "fast lane" candidates
```

---

## Implementation: Scoring Service

File: `apps/repair-service/services/confidence_scorer.py`

```python
class ConfidenceScorer:
    def score_repair(
        self,
        validation_results: dict,  # {lint, typecheck, tests, coverage}
        patch_diff: str,
        finding_type: str,
        finding_severity: str,
        llm_reasoning: str,
    ) -> dict:
        """Calculate confidence and action."""
        
        # Component 1: Validation
        validation_score = self._score_validation(validation_results)
        
        # Component 2: Locality
        locality_score = self._score_locality(patch_diff)
        
        # Component 3: Risk
        risk_score = self._score_risk(finding_type, finding_severity)
        
        # Component 4: Uncertainty
        uncertainty_penalty = self._score_uncertainty(llm_reasoning, patch_diff)
        
        # Final calculation
        confidence = (
            (validation_score * 0.40) +
            (locality_score * 0.30) +
            (risk_score * 0.20) -
            (uncertainty_penalty * 0.10)
        )
        
        # Blocking conditions
        if locality_score < 0:
            confidence = 0
        if validation_score < 30:
            confidence = 0
        
        # Governance rules
        if finding_type == "vulnerability" and confidence < 97:
            confidence = 0
        
        # Action determination
        action = self._determine_action(confidence, finding_type)
        
        return {
            "confidence": min(100, max(0, confidence)),
            "breakdown": {
                "validation": validation_score,
                "locality": locality_score,
                "risk": risk_score,
                "uncertainty_penalty": uncertainty_penalty,
            },
            "action": action,
            "reasoning": self._explain_score(confidence, finding_type),
        }
    
    def _determine_action(self, confidence: float, finding_type: str) -> str:
        if confidence >= 98:
            return "fast_lane_ready_pr"
        elif confidence >= 85:
            return "ready_pr"
        elif confidence >= 75:
            return "draft_pr"
        else:
            return "do_not_repair"
```

---

## Integration with Dashboard

### Confidence Display

```tsx
<RepairConfidenceGauge
  confidence={88}
  breakdown={{
    validation: 100,
    locality: 100,
    risk: 90,
    uncertainty: 0,
  }}
  action="draft_pr"
/>
```

### Scoring Breakdown Panel

Show user:
1. What passed/failed in validation
2. How invasive the patch is
3. Risk classification
4. Doubt signals detected
5. Why it's not "fast lane"

---

## Tuning & Evolution

### Default Weights (Phase 3.0)

These are **opinionated but tunable:**

```
Validation: 40%  # Most important
Locality: 30%    # Invasiveness matters
Risk: 20%        # Domain-specific risk
Uncertainty: 10% # LLM confidence signals
```

### Feedback Loop

After deployment, track:
- Repairs that scored high but failed post-merge
- Repairs that scored low but would have been safe
- Adjust weights quarterly based on data

**Example:** If 5% of "fast lane" repairs fail, increase locality weight to 35%.

---

## Why This Matters

**Without this framework:**
- "95% confidence" = vibes
- Can't justify why something is/isn't repaired
- Inconsistent governance (arbitrary decisions)

**With this framework:**
- Confidence is **calculable, repeatable, transparent**
- Users understand why a repair was blocked
- You can defend decisions (audit trail)
- Governance is **enforceable** (code, not policy)

---

## Next Steps

1. **Review this framework** with security/engineering leads
2. **Adjust weights** if needed (I'm biased toward validation)
3. **Code confidence scorer** (service above)
4. **Integrate into Phase 3.2** (during beam search)
5. **Track metrics** post-launch

---

## Questions to Clarify

1. **Validation weights:** Should typecheck (35%) be higher than tests (35%)?
   - My thinking: types catch class of errors earlier
   - Counterpoint: tests are ground truth

2. **Risk base safety:** My numbers are conservative. Adjust?
   - Logic refactor at 70% seems low
   - Data schema changes at 50% might be too low for careful changes

3. **Uncertainty detection:** Should we be more strict?
   - Current: 3-5 phrases = -10 points
   - Stricter: 2+ phrases = -15 points

4. **Blocking conditions:** Any others to add?
   - Files changed > 20?
   - Functions modified > 10?

