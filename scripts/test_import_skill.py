from __future__ import annotations

import tempfile
import unittest
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from import_skill import (
    apply_snapshot,
    load_import,
    main,
    materialise_metadata,
    skill_directories_match,
)


class ImportSkillTest(unittest.TestCase):
    def test_applies_official_source_as_non_discoverable_snapshot(self) -> None:
        import import_skill

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            snapshot = root / "snapshot"
            snapshot.mkdir()
            snapshot.joinpath("SKILL.md").write_text("upstream\n", encoding="utf-8")
            imports = root / "imports.json"
            imports.write_text(
                '{\n  "imports": {\n'
                f'    "example": {{ "upstreamSha": "{"b" * 40}" }}\n'
                "  }\n}\n",
                encoding="utf-8",
            )
            original_root = import_skill.ROOT
            original_imports = import_skill.IMPORTS
            import_skill.ROOT = root
            import_skill.IMPORTS = imports
            try:
                apply_snapshot(
                    "example",
                    {"distribution": "official-source", "localEdits": []},
                    snapshot,
                    "a" * 40,
                )
            finally:
                import_skill.ROOT = original_root
                import_skill.IMPORTS = original_imports

            target = root / "upstream" / "example"
            self.assertEqual(
                target.joinpath("UPSTREAM_SKILL.md").read_text(encoding="utf-8"),
                "upstream\n",
            )
            self.assertFalse(target.joinpath("SKILL.md").exists())
            self.assertIn('"upstreamSha": "' + "a" * 40, imports.read_text())

    def test_refuses_to_apply_adapted_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(SystemExit, "has local edits"):
                apply_snapshot(
                    "example",
                    {"localEdits": ["adapted"]},
                    Path(temp),
                    "a" * 40,
                )

    def test_applies_wholesale_snapshot_without_renaming_skill(self) -> None:
        import import_skill

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            snapshot = root / "snapshot"
            snapshot.mkdir()
            snapshot.joinpath("SKILL.md").write_text("upstream\n", encoding="utf-8")
            imports = root / "imports.json"
            imports.write_text(
                '{\n  "imports": {\n'
                f'    "example": {{ "upstreamSha": "{"b" * 40}" }}\n'
                "  }\n}\n",
                encoding="utf-8",
            )
            original_root = import_skill.ROOT
            original_imports = import_skill.IMPORTS
            import_skill.ROOT = root
            import_skill.IMPORTS = imports
            try:
                apply_snapshot(
                    "example",
                    {"distribution": "wholesale", "localEdits": []},
                    snapshot,
                    "a" * 40,
                )
            finally:
                import_skill.ROOT = original_root
                import_skill.IMPORTS = original_imports

            self.assertEqual(
                root.joinpath("example/SKILL.md").read_text(encoding="utf-8"),
                "upstream\n",
            )
            self.assertEqual(
                imports.read_text(encoding="utf-8"),
                '{\n  "imports": {\n'
                f'    "example": {{ "upstreamSha": "{"a" * 40}" }}\n'
                "  }\n}\n",
            )

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

    def test_materialises_wholesale_import_metadata(self) -> None:
        import import_skill

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            skill = root / "example"
            skill.mkdir()
            skill.joinpath("SKILL.md").write_text(
                "---\nname: example\ndescription: Example\n---\n\n# Body\n",
                encoding="utf-8",
            )
            imports = root / "imports.json"
            imports.write_text(
                '{"imports":{"example":{'
                '"origin":"https://github.com/org/repo/tree/main/example",'
                f'"upstreamSha":"{"a" * 40}",'
                '"license":"MIT","localEdits":[],"distribution":"wholesale"}}}',
                encoding="utf-8",
            )
            original_root = import_skill.ROOT
            original_imports = import_skill.IMPORTS
            import_skill.ROOT = root
            import_skill.IMPORTS = imports
            try:
                with patch(
                    "sys.argv", ["import_skill.py", "example", "--metadata-only"]
                ):
                    self.assertEqual(main(), 0)
            finally:
                import_skill.ROOT = original_root
                import_skill.IMPORTS = original_imports

            content = skill.joinpath("SKILL.md").read_text(encoding="utf-8")
            self.assertIn("license: MIT", content)
            self.assertIn(
                "# origin: https://github.com/org/repo/tree/main/example", content
            )
            self.assertIn(f"# upstream-sha: {'a' * 40}", content)
            self.assertTrue(content.endswith("\n# Body\n"))

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

    def test_matches_complete_skill_after_ignoring_import_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            local = root / "local"
            upstream = root / "upstream"
            for directory in (local, upstream):
                (directory / "references").mkdir(parents=True)
                (directory / "references" / "guide.md").write_text(
                    "same\n", encoding="utf-8"
                )
            local.joinpath("SKILL.md").write_text(
                "---\nname: example\ndescription: Example\n"
                "# origin: https://github.com/org/repo/tree/main/example\n"
                f"# upstream-sha: {'a' * 40}\n"
                "# local-edits:\n#   - adapted\n---\n\n# Body\n",
                encoding="utf-8",
            )
            upstream.joinpath("SKILL.md").write_text(
                "---\nname: example\ndescription: Example\n"
                "# origin: https://github.com/org/repo/tree/main/example\n"
                f"# upstream-sha: {'b' * 40}\n---\n\n# Body\n",
                encoding="utf-8",
            )

            self.assertTrue(skill_directories_match(local, upstream))
            (upstream / "references" / "guide.md").write_text(
                "changed\n", encoding="utf-8"
            )
            self.assertFalse(skill_directories_match(local, upstream))

    def test_import_rejects_adapted_skill_that_matches_source(self) -> None:
        import import_skill

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            skill = root / "example"
            skill.mkdir()
            skill.joinpath("SKILL.md").write_text(
                "---\nname: example\ndescription: Example\n"
                "# origin: https://github.com/org/repo/tree/main/example\n"
                f"# upstream-sha: {'a' * 40}\n"
                "# local-edits:\n#   - adapted\n---\n\n# Body\n",
                encoding="utf-8",
            )
            imports = root / "imports.json"
            imports.write_text(
                '{"imports":{"example":{'
                '"origin":"https://github.com/org/repo/tree/main/example",'
                f'"upstreamSha":"{"a" * 40}",'
                '"localEdits":["adapted"]}}}',
                encoding="utf-8",
            )
            original_root = import_skill.ROOT
            original_imports = import_skill.IMPORTS
            import_skill.ROOT = root
            import_skill.IMPORTS = imports

            def fake_fetch(name: str, metadata: dict, destination: Path) -> str:
                destination.mkdir()
                destination.joinpath("SKILL.md").write_text(
                    "---\nname: example\ndescription: Example\n---\n\n# Body\n",
                    encoding="utf-8",
                )
                return "b" * 40

            stderr = StringIO()
            try:
                with (
                    patch.object(import_skill, "fetch_snapshot", fake_fetch),
                    patch("sys.argv", ["import_skill.py", "example"]),
                    redirect_stderr(stderr),
                ):
                    self.assertEqual(main(), 1)
            finally:
                import_skill.ROOT = original_root
                import_skill.IMPORTS = original_imports

            self.assertIn(
                "adapted import exactly matches its source", stderr.getvalue()
            )
            self.assertIn("skills add", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
