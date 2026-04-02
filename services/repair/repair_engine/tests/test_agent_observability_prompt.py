from __future__ import annotations

import json
import unittest
from pathlib import Path


def _repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "README.md").exists() and (candidate / "audits" / "prompts").exists():
            return candidate
    raise AssertionError("Could not locate repository root")


class AgentObservabilityPromptTests(unittest.TestCase):
    @staticmethod
    def _prompt_path() -> Path:
        return _repo_root() / "audits" / "prompts" / "agent-observability.md"

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
        json_block = content[start + len(start_marker):end].strip()
        return json.loads(json_block)

    def test_prompt_file_exists(self) -> None:
        self.assertTrue(self._prompt_path().exists())

    def test_prompt_contains_required_guidance(self) -> None:
        content = self._prompt_content()
        self.assertIn("Execution logs", content)
        self.assertIn("Model usage", content)
        self.assertIn("Errors", content)
        self.assertIn("Latency", content)
        self.assertIn("Track agent performance", content)
        self.assertIn("Track model cost", content)
        self.assertIn("Track failure rates", content)
        self.assertIn("Detect loops", content)
        self.assertIn("Prioritize actionable metrics.", content)
        self.assertIn("Avoid noise.", content)
        self.assertIn("Highlight anomalies over averages.", content)

    def test_json_example_matches_contract(self) -> None:
        example = self._example_json()

        self.assertEqual(set(example), {"metrics", "alerts", "anomaly_detection", "logging_format"})
        self.assertIsInstance(example["metrics"], list)
        self.assertIsInstance(example["alerts"], list)
        self.assertIsInstance(example["anomaly_detection"], str)
        self.assertIsInstance(example["logging_format"], str)
        self.assertGreater(len(example["metrics"]), 0)
        self.assertEqual(
            set(example["metrics"][0].keys()),
            {"name", "purpose", "source", "segment_by", "visualization", "why_actionable"},
        )
        self.assertIsInstance(example["metrics"][0]["source"], list)
        self.assertIsInstance(example["metrics"][0]["segment_by"], list)
        self.assertGreater(len(example["alerts"]), 0)
        self.assertEqual(
            set(example["alerts"][0].keys()),
            {"name", "condition", "severity", "notify", "response"},
        )
        self.assertIsInstance(example["alerts"][0]["notify"], list)
        self.assertIn("baseline", example["anomaly_detection"].lower())
        self.assertIn("json", example["logging_format"].lower())


if __name__ == "__main__":
    unittest.main()
