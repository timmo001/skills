from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from check_upstream import (
    ImportStatus,
    check_imports,
    frontmatter_comment,
    parse_origin,
    render_markdown,
)


class CheckUpstreamTest(unittest.TestCase):
    def test_only_adapted_changes_require_manual_review(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "imports.json").write_text(
                '{"imports":{'
                '"adapted":{"origin":"https://github.com/org/repo/tree/main/adapted","upstreamSha":"old","localEdits":["adapted"]},'
                '"official":{"origin":"https://github.com/org/repo/tree/main/official","upstreamSha":"old","localEdits":[],"distribution":"official-source"}'
                '}}',
                encoding="utf-8",
            )
            with (
                patch("check_upstream.latest_path_sha", return_value="a" * 40),
                patch("check_upstream.upstream_path_exists", return_value=True),
            ):
                statuses = check_imports(root)

        self.assertEqual(
            {status.name: status.state for status in statuses},
            {"adapted": "manual-review", "official": "update-available"},
        )

    def test_deleted_upstream_path_is_a_problem(self) -> None:
        with TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "imports.json").write_text(
                '{"imports":{"deleted":{'
                '"origin":"https://github.com/org/repo/tree/main/deleted",'
                '"upstreamSha":"old","localEdits":[],"distribution":"official-source"}}}',
                encoding="utf-8",
            )
            with (
                patch("check_upstream.latest_path_sha", return_value="a" * 40),
                patch("check_upstream.upstream_path_exists", return_value=False),
            ):
                status = check_imports(root)[0]

        self.assertEqual(status.state, "error")
        self.assertEqual(status.reason, "upstream path no longer exists")

    def test_reads_frontmatter_comments_only(self) -> None:
        text = "---\n# origin: https://github.com/org/repo/tree/main/skill\n---\n# origin: ignored\n"
        self.assertEqual(
            frontmatter_comment(text, "origin"),
            "https://github.com/org/repo/tree/main/skill",
        )

    def test_parses_tree_and_skill_blob_origins(self) -> None:
        self.assertEqual(
            parse_origin("https://github.com/org/repo/tree/main/skills/example"),
            ("org", "repo", "main", "skills/example"),
        )
        self.assertEqual(
            parse_origin("https://github.com/org/repo/blob/main/SKILL.md"),
            ("org", "repo", "main", "SKILL.md"),
        )
        self.assertIsNone(
            parse_origin("https://github.com/org/repo/blob/main/README.md")
        )

    def test_renders_manual_review_and_errors(self) -> None:
        output = render_markdown(
            [
                ImportStatus(
                    "changed", "https://example.test", "a", "b", "manual-review"
                ),
                ImportStatus(
                    "upstream", "https://example.test", "a", "b", "update-available"
                ),
                ImportStatus(
                    "broken", "https://example.test", "a", None, "error", "failed"
                ),
            ]
        )
        self.assertIn("**changed**", output)
        self.assertIn("## Upstream updates\n\n- **upstream**", output)
        self.assertIn("**broken**: failed", output)


if __name__ == "__main__":
    unittest.main()
