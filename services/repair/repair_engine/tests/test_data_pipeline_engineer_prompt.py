from __future__ import annotations

import json
import unittest
from pathlib import Path


def _repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "README.md").exists() and (candidate / "audits" / "prompts").exists():
            return candidate
    raise AssertionError("Could not locate repository root")


class DataPipelineEngineerPromptTests(unittest.TestCase):
    @staticmethod
    def _prompt_path() -> Path:
        return _repo_root() / "audits" / "prompts" / "data-pipeline-engineer.md"

    def _prompt_content(self) -> str:
        prompt_path = self._prompt_path()
        self.assertTrue(prompt_path.exists())
        return prompt_path.read_text()

    def _example_json(self) -> dict:
        content = self._prompt_content()
        output_contract = "## Output Contract"
        self.assertIn(output_contract, content)
        start_marker = "```json"
        self.assertEqual(content.count(start_marker), 1)
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
        self.assertIn("Define the data ingestion pipeline", content)
        self.assertIn("Define the storage structure", content)
        self.assertIn("Define an indexing strategy", content)
        self.assertIn("Optimize for read-heavy workloads.", content)
        self.assertIn("Preserve full execution history.", content)
        self.assertIn("Ensure auditability.", content)
        self.assertIn("Ensure traceability", content)
        self.assertIn("fast reads", content)

    def test_json_example_matches_contract(self) -> None:
        example = self._example_json()

        self.assertEqual(set(example), {"schemas", "endpoints", "streaming_strategy", "storage"})
        self.assertIsInstance(example["schemas"], dict)
        self.assertIsInstance(example["endpoints"], list)
        self.assertIsInstance(example["streaming_strategy"], str)
        self.assertIsInstance(example["storage"], str)
        self.assertIn("raw_agent_runs", example["schemas"])
        self.assertIn("dashboard_views", example["schemas"])
        self.assertIn("lineage_log", example["schemas"])
        self.assertGreater(len(example["endpoints"]), 0)
        self.assertEqual(
            set(example["endpoints"][0].keys()),
            {"name", "path", "method", "reads_from", "supports", "latency_goal"},
        )
        self.assertIsInstance(example["endpoints"][0]["reads_from"], list)
        self.assertIsInstance(example["endpoints"][0]["supports"], list)
        self.assertIn("append-only", example["streaming_strategy"].lower())
        self.assertIn("immutable", example["storage"].lower())


if __name__ == "__main__":
    unittest.main()
