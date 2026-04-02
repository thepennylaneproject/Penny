from __future__ import annotations

from .models import EvalResult, PatchCandidate, ScoreCard


def score_candidate(result: EvalResult, candidate: PatchCandidate) -> ScoreCard:
    reasons: list[str] = []
    metrics: dict[str, float] = {}

    if not result.apply_ok:
        reasons.append("patch apply failed")
        return ScoreCard(candidate_id=result.candidate_id, score=0.0, passed=False, metrics={"apply_ok": 0.0}, reasons=reasons)

    score = 0.0

    compile_score = 1.0 if result.compile_ok else 0.0
    lint_score = 1.0 if result.lint_ok else 0.0
    tests_score = 1.0 if result.tests_ok else 0.0
    warnings_penalty = min(1.0, result.warnings * 0.05)
    diff_penalty = min(0.3, len(candidate.operations) * 0.04)

    score += 0.2
    score += 0.25 * compile_score
    score += 0.20 * lint_score
    score += 0.35 * tests_score
    score -= warnings_penalty
    score -= diff_penalty

    if result.tests_ok:
        reasons.append("tests passed")
    else:
        reasons.append("tests failed")
    if result.compile_ok:
        reasons.append("compile/typecheck passed")
    if result.lint_ok:
        reasons.append("lint passed")
    if warnings_penalty > 0:
        reasons.append(f"warnings penalty {warnings_penalty:.2f}")
    if diff_penalty > 0:
        reasons.append(f"diff size penalty {diff_penalty:.2f}")

    score = max(0.0, min(1.0, score))
    metrics.update(
        {
            "compile_ok": compile_score,
            "lint_ok": lint_score,
            "tests_ok": tests_score,
            "warnings_penalty": warnings_penalty,
            "diff_penalty": diff_penalty,
            "ops": float(len(candidate.operations)),
        }
    )
    return ScoreCard(
        candidate_id=result.candidate_id,
        score=score,
        passed=result.passed,
        metrics=metrics,
        reasons=reasons,
    )

