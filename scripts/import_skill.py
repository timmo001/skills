#!/usr/bin/env python3
"""Fetch and materialise reviewed skill snapshots from imports.json."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMPORTS = ROOT / "imports.json"
ORIGIN = re.compile(r"^https://github\.com/([^/]+)/([^/]+)/(?:tree|blob)/([^/]+)/(.*)$")


def load_import(name: str) -> dict:
    imports = json.loads(IMPORTS.read_text(encoding="utf-8"))["imports"]
    if name not in imports:
        raise SystemExit(f"unknown imported skill: {name}")
    metadata = imports[name]
    if metadata.get("distribution") in {"official-source", "wholesale"}:
        return metadata
    local_edits = metadata.get("localEdits")
    if (
        not isinstance(local_edits, list)
        or not local_edits
        or not all(isinstance(edit, str) and edit.strip() for edit in local_edits)
    ):
        raise SystemExit(f"{name}: imported skills must declare local edits")
    return metadata


def tracked_skill_path(name: str, metadata: dict) -> Path:
    if metadata.get("distribution") == "official-source":
        return ROOT / "upstream" / name / "UPSTREAM_SKILL.md"
    return ROOT / name / "SKILL.md"


def frontmatter_lines(path: Path) -> tuple[list[str], list[str]]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0] != "---":
        raise SystemExit(f"{path}: missing frontmatter")
    end = lines.index("---", 1)
    return lines[1:end], lines[end + 1 :]


def materialise_metadata(path: Path, name: str, metadata: dict) -> None:
    frontmatter, body = frontmatter_lines(path)
    fields = [
        line
        for line in frontmatter
        if not line.startswith(("name:", "license:", "# origin:", "# upstream-sha:"))
        and line != "# local-edits:"
        and not line.startswith("#   - ")
    ]
    result = ["---", f"name: {name}"]
    result.extend(fields)
    if metadata.get("license"):
        result.append(f"license: {metadata['license']}")
    result.extend(
        [
            f"# origin: {metadata['origin']}",
            f"# upstream-sha: {metadata['upstreamSha']}",
        ]
    )
    if metadata["localEdits"]:
        result.append("# local-edits:")
        result.extend(f"#   - {edit}" for edit in metadata["localEdits"])
    result.extend(["---", *body])
    path.write_text("\n".join(result) + "\n", encoding="utf-8")


def fetch_snapshot(name: str, metadata: dict, destination: Path) -> str:
    match = ORIGIN.fullmatch(metadata["origin"])
    if not match:
        raise SystemExit(f"{name}: unsupported origin URL")
    owner, repo, ref, origin_path = match.groups()
    with tempfile.TemporaryDirectory(prefix=f"skill-import-{name}-") as temp:
        worktree = Path(temp)
        checkout = worktree / "source"
        subprocess.run(
            [
                "git",
                "clone",
                "--quiet",
                "--filter=blob:none",
                "--no-checkout",
                f"https://github.com/{owner}/{repo}.git",
                str(checkout),
            ],
            check=True,
        )
        subprocess.run(
            ["git", "-C", str(checkout), "sparse-checkout", "set", origin_path],
            check=True,
        )
        subprocess.run(
            ["git", "-C", str(checkout), "checkout", "--quiet", ref], check=True
        )
        upstream_sha = subprocess.run(
            [
                "git",
                "-C",
                str(checkout),
                "log",
                "-1",
                "--format=%H",
                "--",
                origin_path,
            ],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        subprocess.run(
            ["git", "-C", str(checkout), "checkout", "--quiet", upstream_sha],
            check=True,
        )
        subprocess.run(
            [
                "mise",
                "exec",
                "npm:skills",
                "--",
                "skills",
                "add",
                str(checkout / origin_path),
                "--skill",
                metadata.get("sourceName", name),
                "--copy",
                "--yes",
                "--agent",
                "codex",
                "--metadata",
                '{"source":"skills-update-review"}',
            ],
            cwd=worktree,
            check=True,
            env={
                key: value
                for key, value in os.environ.items()
                if key not in {"GH_TOKEN", "GITHUB_TOKEN"}
            },
            stdout=subprocess.DEVNULL,
        )
        generated = worktree / ".agents" / "skills" / metadata.get("sourceName", name)
        if not generated.is_dir():
            raise SystemExit(f"{name}: skills CLI did not materialise the snapshot")
        shutil.copytree(generated, destination)
        return upstream_sha


def update_reviewed_sha(name: str, sha: str) -> None:
    document = json.loads(IMPORTS.read_text(encoding="utf-8"))
    document["imports"][name]["upstreamSha"] = sha
    IMPORTS.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("name")
    parser.add_argument("--metadata-only", action="store_true")
    parser.add_argument("--reviewed-sha")
    args = parser.parse_args()
    metadata = load_import(args.name)
    if args.reviewed_sha:
        if not re.fullmatch(r"[0-9a-f]{40}", args.reviewed_sha):
            raise SystemExit("reviewed SHA must be 40 lowercase hexadecimal characters")
        update_reviewed_sha(args.name, args.reviewed_sha)
        metadata = load_import(args.name)
    if args.metadata_only:
        if metadata.get("distribution") == "wholesale":
            return 0
        materialise_metadata(
            tracked_skill_path(args.name, metadata), args.name, metadata
        )
        return 0
    with tempfile.TemporaryDirectory(prefix=f"skill-review-{args.name}-") as temp:
        snapshot = Path(temp) / args.name
        upstream_sha = fetch_snapshot(args.name, metadata, snapshot)
        if metadata.get("distribution") != "wholesale":
            review_metadata = {**metadata, "upstreamSha": upstream_sha}
            materialise_metadata(snapshot / "SKILL.md", args.name, review_metadata)
        target = tracked_skill_path(args.name, metadata).parent
        subprocess.run(
            ["diff", "--recursive", "--unified", str(target), str(snapshot)],
            check=False,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
