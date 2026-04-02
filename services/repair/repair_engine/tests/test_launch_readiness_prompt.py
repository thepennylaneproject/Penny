from __future__ import annotations

import json
import unittest
from pathlib import Path


def _repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "README.md").exists() and (candidate / "audits" / "prompts").exists():
            return candidate
    raise AssertionError("Could not locate repository root")


class LaunchReadinessPromptTests(unittest.TestCase):
    @staticmethod
    def _prompt_path() -> Path:
        return _repo_root() / "audits" / "prompts" / "agent-launch-readiness.md"

    def _prompt_content(self) -> str:
        prompt_path = self._prompt_path()
        self.assertTrue(prompt_path.exists())
        return prompt_path.read_text()

    def _example_json(self) -> dict:
        content = self._prompt_content()
        output_contract = "## Output Contract"
        self.assertIn(output_contract, content)
        contract_content = content[content.find(output_contract):]
        start_marker = "```json"
        self.assertEqual(contract_content.count(start_marker), 1)
        start = content.find(start_marker, content.find(output_contract))
        self.assertGreaterEqual(start, 0, "Prompt should contain a JSON code block example")
        end = content.find("```", start + len(start_marker))
        self.assertGreater(end, start, "Prompt JSON code block should be properly closed")
        json_block = content[start + len(start_marker) : end].strip()
        return json.loads(json_block)

    # ------------------------------------------------------------------ #
    # Existence
    # ------------------------------------------------------------------ #

    def test_prompt_file_exists(self) -> None:
        self.assertTrue(self._prompt_path().exists())

    # ------------------------------------------------------------------ #
    # Required guidance strings
    # ------------------------------------------------------------------ #

    def test_prompt_contains_agent_identity(self) -> None:
        content = self._prompt_content()
        self.assertIn("launch-readiness-auditor", content)
        self.assertIn("launch_readiness", content)

    def test_prompt_covers_all_nine_test_areas(self) -> None:
        content = self._prompt_content()
        # 1. Primary e2e flows
        self.assertIn("user journeys", content)
        # 2. Abandonment & resume
        self.assertIn("abandonment", content.lower())
        self.assertIn("session timeout", content)
        # 3. Error/failure simulation
        self.assertIn("invalid inputs", content)
        self.assertIn("API failures", content)
        self.assertIn("AI timeouts", content)
        # 4. State consistency
        self.assertIn("state consistency", content.lower())
        self.assertIn("autosave", content)
        # 5. Role/permission
        self.assertIn("permission", content)
        # 6. Perceived performance
        self.assertIn("perceived", content.lower())
        self.assertIn("loading states", content)
        # 7. Emotional trust
        self.assertIn("emotional", content.lower())
        self.assertIn("safe", content)
        # 8. First-time user
        self.assertIn("cold", content.lower())
        self.assertIn("first win", content)
        # 9. Demo risk
        self.assertIn("demo", content.lower())
        self.assertIn("Demo risk", content)

    def test_prompt_contains_journey_rating_definitions(self) -> None:
        content = self._prompt_content()
        self.assertIn("pass", content)
        self.assertIn("soft_fail", content)
        self.assertIn("hard_fail", content)

    def test_prompt_contains_risk_types(self) -> None:
        content = self._prompt_content()
        for risk in [
            "e2e_flow",
            "abandonment_resume",
            "error_failure",
            "state_consistency",
            "permission_boundary",
            "perceived_performance",
            "emotional_trust",
            "first_time_ux",
            "demo_risk",
        ]:
            self.assertIn(risk, content, f"Missing risk type: {risk}")

    def test_prompt_contains_triage_output_lists(self) -> None:
        content = self._prompt_content()
        self.assertIn("must_fix_before_launch", content)
        self.assertIn("fix_soon_after_launch", content)
        self.assertIn("safe_to_monitor", content)

    def test_prompt_contains_launch_confidence_score(self) -> None:
        content = self._prompt_content()
        self.assertIn("launch_confidence_score", content)
        self.assertIn("launch_confidence_justification", content)
        self.assertIn("1 to 10", content)

    def test_prompt_contains_standard_penny_enums(self) -> None:
        content = self._prompt_content()
        self.assertIn("blocker", content)
        self.assertIn("major", content)
        self.assertIn("evidence", content)
        self.assertIn("inference", content)
        self.assertIn("fixed_pending_verify", content)

    def test_prompt_contains_quality_bar_rules(self) -> None:
        content = self._prompt_content()
        self.assertIn("silent failure", content.lower())
        self.assertIn("Demo risk is launch risk", content)
        self.assertIn("No markdown wrapper", content)

    # ------------------------------------------------------------------ #
    # JSON example contract
    # ------------------------------------------------------------------ #

    def test_json_example_top_level_keys(self) -> None:
        example = self._example_json()
        required_keys = {
            "schema_version",
            "kind",
            "suite",
            "run_id",
            "agent",
            "journeys",
            "issues",
            "must_fix_before_launch",
            "fix_soon_after_launch",
            "safe_to_monitor",
            "launch_confidence_score",
            "launch_confidence_justification",
        }
        self.assertEqual(set(example.keys()), required_keys)

    def test_json_example_schema_version(self) -> None:
        example = self._example_json()
        self.assertEqual(example["schema_version"], "1.1.0")

    def test_json_example_kind_and_suite(self) -> None:
        example = self._example_json()
        self.assertEqual(example["kind"], "agent_output")
        self.assertEqual(example["suite"], "launch_readiness")

    def test_json_example_agent_shape(self) -> None:
        example = self._example_json()
        agent = example["agent"]
        self.assertEqual(
            set(agent.keys()),
            {"name", "role", "inputs_used", "stop_conditions_hit"},
        )
        self.assertEqual(agent["name"], "launch-readiness-auditor")
        self.assertIsInstance(agent["role"], str)
        self.assertGreater(len(agent["role"]), 0)
        self.assertIsInstance(agent["inputs_used"], list)
        self.assertIsInstance(agent["stop_conditions_hit"], list)

    def test_json_example_journeys_shape(self) -> None:
        example = self._example_json()
        journeys = example["journeys"]
        self.assertIsInstance(journeys, list)
        self.assertGreater(len(journeys), 0)
        journey = journeys[0]
        required_keys = {
            "name",
            "persona",
            "start_state",
            "steps",
            "friction_points",
            "uncertainty_points",
            "delight_points",
            "rating",
            "issue_ids",
        }
        self.assertEqual(set(journey.keys()), required_keys)
        self.assertIn(journey["rating"], {"pass", "soft_fail", "hard_fail"})
        self.assertIsInstance(journey["steps"], list)
        self.assertGreater(len(journey["steps"]), 0)
        step = journey["steps"][0]
        self.assertEqual(
            set(step.keys()),
            {"step", "action", "expected", "actual", "friction"},
        )
        self.assertIsInstance(step["step"], int)
        self.assertIsInstance(journey["friction_points"], list)
        self.assertIsInstance(journey["uncertainty_points"], list)
        self.assertIsInstance(journey["delight_points"], list)
        self.assertIsInstance(journey["issue_ids"], list)

    def test_json_example_issues_shape(self) -> None:
        example = self._example_json()
        issues = example["issues"]
        self.assertIsInstance(issues, list)
        self.assertGreater(len(issues), 0)
        issue = issues[0]
        required_keys = {
            "issue_id",
            "journey",
            "risk_type",
            "scenario",
            "what_breaks",
            "severity",
            "user_impact",
            "fix_recommendation",
            "effort",
            "finding_id",
        }
        self.assertEqual(set(issue.keys()), required_keys)
        self.assertIn(issue["severity"], {"low", "medium", "high", "critical"})
        self.assertIn(
            issue["risk_type"],
            {
                "e2e_flow",
                "abandonment_resume",
                "error_failure",
                "state_consistency",
                "permission_boundary",
                "perceived_performance",
                "emotional_trust",
                "first_time_ux",
                "demo_risk",
            },
        )
        self.assertIn(issue["effort"], {"trivial", "small", "medium", "large", "epic"})

    def test_json_example_triage_lists_are_arrays(self) -> None:
        example = self._example_json()
        self.assertIsInstance(example["must_fix_before_launch"], list)
        self.assertIsInstance(example["fix_soon_after_launch"], list)
        self.assertIsInstance(example["safe_to_monitor"], list)

    def test_json_example_launch_confidence_score_is_integer_in_range(self) -> None:
        example = self._example_json()
        score = example["launch_confidence_score"]
        self.assertIsInstance(score, int)
        self.assertGreaterEqual(score, 1)
        self.assertLessEqual(score, 10)

    def test_json_example_launch_confidence_justification_is_nonempty_string(self) -> None:
        example = self._example_json()
        justification = example["launch_confidence_justification"]
        self.assertIsInstance(justification, str)
        self.assertGreater(len(justification), 0)

    def test_json_example_issue_ids_cross_reference_journeys(self) -> None:
        example = self._example_json()
        all_issue_ids = {i["issue_id"] for i in example["issues"]}
        for journey in example["journeys"]:
            for issue_id in journey["issue_ids"]:
                self.assertIn(
                    issue_id,
                    all_issue_ids,
                    f"Journey '{journey['name']}' references issue_id '{issue_id}' not found in issues array",
                )

    def test_json_example_triage_ids_reference_valid_issues(self) -> None:
        example = self._example_json()
        all_issue_ids = {i["issue_id"] for i in example["issues"]}
        for triage_list_key in ("must_fix_before_launch", "fix_soon_after_launch", "safe_to_monitor"):
            for issue_id in example[triage_list_key]:
                self.assertIn(
                    issue_id,
                    all_issue_ids,
                    f"Triage list '{triage_list_key}' references issue_id '{issue_id}' not found in issues array",
                )


if __name__ == "__main__":
    unittest.main()
