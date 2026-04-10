from __future__ import annotations

import json
import unittest
from pathlib import Path


def _repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "README.md").exists() and (candidate / "audits" / "prompts").exists():
            return candidate
    raise AssertionError("Could not locate repository root")


class DashboardArchitectPromptTests(unittest.TestCase):
    @staticmethod
    def _prompt_path() -> Path:
        return _repo_root() / "audits" / "prompts" / "dashboard-architect.md"

    def _prompt_content(self) -> str:
        prompt_path = self._prompt_path()
        self.assertTrue(prompt_path.exists())
        return prompt_path.read_text()

    def _example_json(self) -> dict:
        content = self._prompt_content()
        start_marker = "```json"
        self.assertEqual(content.count(start_marker), 1)
        start = content.find(start_marker)
        self.assertGreaterEqual(start, 0, "Prompt should contain a JSON code block example")
        end = content.find("```", start + len(start_marker))
        self.assertGreater(end, start, "Prompt JSON code block should be properly closed")
        json_block = content[start + len(start_marker):end].strip()
        return json.loads(json_block)

    def test_prompt_file_exists(self) -> None:
        self.assertTrue(self._prompt_path().exists())

    def test_prompt_contains_required_guidance(self) -> None:
        content = self._prompt_content()
        self.assertIn("Define the core views (pages)", content)
        self.assertIn("Define the reusable components and their hierarchy", content)
        self.assertIn("Define the end-to-end data flows", content)
        self.assertIn("Prefer simple architecture over cleverness.", content)
        self.assertIn("Design for observability first", content)

    def test_json_example_matches_contract(self) -> None:
        example = self._example_json()

        self.assertEqual(
            set(example),
            {"pages", "components", "data_flow", "state_management", "tech_stack"},
        )
        self.assertIsInstance(example["pages"], list)
        self.assertIsInstance(example["components"], list)
        self.assertIsInstance(example["data_flow"], list)
        self.assertIsInstance(example["state_management"], str)
        self.assertIsInstance(example["tech_stack"], dict)
        self.assertEqual(
            set(example["tech_stack"].keys()),
            {"frontend", "backend", "realtime"},
        )
        self.assertGreater(len(example["pages"]), 0)
        self.assertEqual(
            set(example["pages"][0].keys()),
            {
                "name",
                "purpose",
                "primary_components",
                "data_dependencies",
                "realtime",
                "observability",
            },
        )
        self.assertIsInstance(example["pages"][0]["name"], str)
        self.assertIsInstance(example["pages"][0]["purpose"], str)
        self.assertIsInstance(example["pages"][0]["primary_components"], list)
        self.assertIsInstance(example["pages"][0]["data_dependencies"], list)
        self.assertIsInstance(example["pages"][0]["realtime"], bool)
        self.assertIsInstance(example["pages"][0]["observability"], list)
        self.assertGreater(len(example["components"]), 0)
        self.assertEqual(
            set(example["components"][0].keys()),
            {"name", "level", "parent", "children", "responsibilities", "inputs", "outputs"},
        )
        self.assertGreater(len(example["data_flow"]), 0)
        self.assertEqual(
            set(example["data_flow"][0].keys()),
            {"from", "to", "transport", "payload", "frequency", "notes"},
        )


if __name__ == "__main__":
    unittest.main()
