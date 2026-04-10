from __future__ import annotations

import json
import unittest
from pathlib import Path


def _repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "README.md").exists() and (candidate / "audits" / "prompts").exists():
            return candidate
    raise AssertionError("Could not locate repository root")


class DashboardOrchestratorPromptTests(unittest.TestCase):
    @staticmethod
    def _prompt_path() -> Path:
        return _repo_root() / "audits" / "prompts" / "dashboard-orchestrator.md"

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
        self.assertIn("Architect output", content)
        self.assertIn("UI components", content)
        self.assertIn("Data pipeline", content)
        self.assertIn("Observability specs", content)
        self.assertIn("Assemble full application structure", content)
        self.assertIn("Ensure components integrate correctly", content)
        self.assertIn("Validate data flow end-to-end", content)
        self.assertIn("Ensure system coherence.", content)
        self.assertIn("Do not leave undefined dependencies.", content)
        self.assertIn("Favor working system over theoretical perfection.", content)

    def test_json_example_matches_contract(self) -> None:
        example = self._example_json()

        self.assertEqual(
            set(example),
            {"app_structure", "integration_notes", "missing_pieces", "deployment_steps"},
        )
        self.assertIsInstance(example["app_structure"], str)
        self.assertIsInstance(example["integration_notes"], list)
        self.assertIsInstance(example["missing_pieces"], list)
        self.assertIsInstance(example["deployment_steps"], list)
        self.assertGreater(len(example["integration_notes"]), 0)
        self.assertGreater(len(example["missing_pieces"]), 0)
        self.assertGreater(len(example["deployment_steps"]), 0)
        self.assertTrue(all(isinstance(item, str) for item in example["integration_notes"]))
        self.assertTrue(all(isinstance(item, str) for item in example["missing_pieces"]))
        self.assertTrue(all(isinstance(item, str) for item in example["deployment_steps"]))


if __name__ == "__main__":
    unittest.main()
