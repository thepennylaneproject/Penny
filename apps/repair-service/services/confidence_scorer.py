"""Confidence scoring for repair patches."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class ValidationScore:
    """Validation test results."""

    lint_pass: bool = False
    typecheck_pass: bool = False
    tests_pass: bool = False
    coverage_delta: float = 0.0  # +/- percentage change

    def score(self) -> float:
        """Calculate validation score (0-100)."""
        base_score = 0.0
        if self.lint_pass:
            base_score += 30.0
        if self.typecheck_pass:
            base_score += 35.0
        if self.tests_pass:
            base_score += 30.0
        if self.coverage_delta > 0:
            base_score += min(5.0, self.coverage_delta)

        return min(100.0, base_score)


@dataclass
class LocalityScore:
    """Locality assessment."""

    files_touched: int = 1
    functions_touched: int = 1
    related_code_touched: bool = False
    unrelated_changes: int = 0

    def score(self) -> float:
        """Calculate locality score (0-100)."""
        # Single file, single function, related code = high locality (80-100)
        # Multiple files or functions = lower locality (40-80)
        # Unrelated changes = significant penalty

        if self.unrelated_changes > 0:
            return 0.0

        if self.files_touched == 1 and self.functions_touched == 1:
            return 90.0 if self.related_code_touched else 85.0
        elif self.files_touched <= 2 and self.functions_touched <= 2:
            return 70.0 if self.related_code_touched else 60.0
        else:
            return 40.0


@dataclass
class RiskScore:
    """Risk assessment."""

    new_dependencies: int = 0
    external_imports: int = 0
    complexity_increase: float = 0.0
    breaking_changes: int = 0

    def score(self) -> float:
        """Calculate risk score (0-100)."""
        # Start at 80 (neutral/low risk)
        score = 80.0

        # Deduct for new dependencies
        if self.new_dependencies > 0:
            score -= min(20.0, self.new_dependencies * 5.0)

        # Deduct for external imports
        if self.external_imports > 0:
            score -= min(30.0, self.external_imports * 10.0)

        # Deduct for complexity increase
        if self.complexity_increase > 0:
            score -= min(15.0, self.complexity_increase * 3.0)

        # Breaking changes are catastrophic
        if self.breaking_changes > 0:
            score = 0.0

        return max(0.0, min(100.0, score))


class ConfidenceScorer:
    """Calculates overall confidence score for a repair patch."""

    VALIDATION_WEIGHT = 0.40
    LOCALITY_WEIGHT = 0.30
    RISK_WEIGHT = 0.20
    UNCERTAINTY_PENALTY_MAX = 15.0

    def __init__(self):
        """Initialize scorer."""
        pass

    def calculate(
        self,
        validation: ValidationScore,
        locality: LocalityScore,
        risk: RiskScore,
        uncertainty_penalty: float = 0.0,
    ) -> float:
        """
        Calculate overall confidence score.

        Formula:
        confidence = (validation*0.4 + locality*0.3 + risk*0.2) - uncertainty_penalty

        Args:
            validation: Validation test results
            locality: Locality assessment
            risk: Risk assessment
            uncertainty_penalty: Penalty for uncertain/generated parts (0-15%)

        Returns:
            Confidence score (0-100)
        """
        v_score = validation.score()
        l_score = locality.score()
        r_score = risk.score()

        # Clamp uncertainty penalty
        penalty = min(self.UNCERTAINTY_PENALTY_MAX, max(0.0, uncertainty_penalty))

        # Weighted average
        weighted_score = (
            v_score * self.VALIDATION_WEIGHT
            + l_score * self.LOCALITY_WEIGHT
            + r_score * self.RISK_WEIGHT
        )

        # Apply uncertainty penalty
        final_score = weighted_score - penalty

        return max(0.0, min(100.0, final_score))

    def breakdown(
        self,
        validation: ValidationScore,
        locality: LocalityScore,
        risk: RiskScore,
        uncertainty_penalty: float = 0.0,
    ) -> dict:
        """
        Get detailed confidence breakdown.

        Returns:
            Dictionary with individual component scores
        """
        v_score = validation.score()
        l_score = locality.score()
        r_score = risk.score()
        penalty = min(self.UNCERTAINTY_PENALTY_MAX, max(0.0, uncertainty_penalty))

        weighted_score = (
            v_score * self.VALIDATION_WEIGHT
            + l_score * self.LOCALITY_WEIGHT
            + r_score * self.RISK_WEIGHT
        )

        final_score = weighted_score - penalty

        return {
            "validation": v_score,
            "locality": l_score,
            "risk": r_score,
            "uncertainty_penalty": penalty,
            "overall": max(0.0, min(100.0, final_score)),
        }
