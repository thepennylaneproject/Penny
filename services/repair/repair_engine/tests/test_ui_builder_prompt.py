from __future__ import annotations

import json
import unittest
from pathlib import Path


def _repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "README.md").exists() and (candidate / "audits" / "prompts").exists():
            return candidate
    raise AssertionError("Could not locate repository root")


class UiBuilderPromptTests(unittest.TestCase):
    @staticmethod
    def _prompt_path() -> Path:
        return _repo_root() / "audits" / "prompts" / "ui-builder.md"

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
        self.assertIn("production-ready React components for the dashboard", content)
        self.assertIn("Component spec", content)
        self.assertIn("Data schema", content)
        self.assertIn("UX goals", content)
        self.assertIn("responsive layout", content)
        self.assertIn("clear visual and information hierarchy", content)
        self.assertIn("loading states", content)
        self.assertIn("error states", content)
        self.assertIn("empty states", content)
        self.assertIn("Use a consistent design system.", content)
        self.assertIn("Avoid unnecessary complexity.", content)
        self.assertIn("Prioritize clarity over decoration.", content)

    def test_json_example_matches_contract(self) -> None:
        example = self._example_json()

        self.assertEqual(set(example), {"component_code", "props", "state_logic", "notes"})
        self.assertIsInstance(example["component_code"], str)
        self.assertIsInstance(example["props"], dict)
        self.assertIsInstance(example["state_logic"], str)
        self.assertIsInstance(example["notes"], str)
        self.assertGreater(len(example["props"]), 0)
        self.assertIn("title", example["props"])
        self.assertIn("isLoading", example["props"])
        self.assertIn("errorMessage", example["props"])
        self.assertIn("loading", example["state_logic"].lower())
        self.assertIn("empty", example["state_logic"].lower())


if __name__ == "__main__":
    unittest.main()
