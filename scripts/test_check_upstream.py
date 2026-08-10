from __future__ import annotations

import unittest

from check_upstream import (
    ImportStatus,
    frontmatter_comment,
    parse_origin,
    render_markdown,
)


class CheckUpstreamTest(unittest.TestCase):
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
                    "broken", "https://example.test", "a", None, "error", "failed"
                ),
            ]
        )
        self.assertIn("**changed**", output)
        self.assertIn("**broken**: failed", output)


if __name__ == "__main__":
    unittest.main()
