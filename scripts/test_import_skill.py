from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from import_skill import load_import, materialise_metadata


class ImportSkillTest(unittest.TestCase):
    def test_rejects_distributed_import_without_local_edits(self) -> None:
        import import_skill

        with tempfile.TemporaryDirectory() as temp:
            imports = Path(temp) / "imports.json"
            imports.write_text(
                '{"imports":{"example":{"localEdits":[]}}}', encoding="utf-8"
            )
            original = import_skill.IMPORTS
            import_skill.IMPORTS = imports
            try:
                with self.assertRaisesRegex(SystemExit, "must declare local edits"):
                    load_import("example")
            finally:
                import_skill.IMPORTS = original

    def test_accepts_official_source_import_without_local_edits(self) -> None:
        import import_skill

        with tempfile.TemporaryDirectory() as temp:
            imports = Path(temp) / "imports.json"
            imports.write_text(
                '{"imports":{"example":{"localEdits":[],"distribution":"official-source"}}}',
                encoding="utf-8",
            )
            original = import_skill.IMPORTS
            import_skill.IMPORTS = imports
            try:
                self.assertEqual(
                    load_import("example")["distribution"], "official-source"
                )
            finally:
                import_skill.IMPORTS = original

    def test_accepts_wholesale_import_without_local_edits(self) -> None:
        import import_skill

        with tempfile.TemporaryDirectory() as temp:
            imports = Path(temp) / "imports.json"
            imports.write_text(
                '{"imports":{"example":{"localEdits":[],"distribution":"wholesale"}}}',
                encoding="utf-8",
            )
            original = import_skill.IMPORTS
            import_skill.IMPORTS = imports
            try:
                self.assertEqual(load_import("example")["distribution"], "wholesale")
            finally:
                import_skill.IMPORTS = original

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
