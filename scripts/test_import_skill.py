from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from import_skill import materialise_metadata


class ImportSkillTest(unittest.TestCase):
    def test_materialises_overlay_without_changing_body(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "SKILL.md"
            path.write_text(
                "---\nname: upstream\ndescription: Example\n---\n\n# Body\n",
                encoding="utf-8",
            )
            materialise_metadata(
                path,
                "example",
                {
                    "origin": "https://github.com/org/repo/tree/main/example",
                    "upstreamSha": "a" * 40,
                    "license": "MIT",
                    "localEdits": ["SKILL.md: adapted"],
                },
            )
            content = path.read_text(encoding="utf-8")
            self.assertIn("name: example", content)
            self.assertIn("license: MIT", content)
            self.assertIn(f"# upstream-sha: {'a' * 40}", content)
            self.assertIn("#   - SKILL.md: adapted", content)
            self.assertTrue(content.endswith("\n# Body\n"))


if __name__ == "__main__":
    unittest.main()
