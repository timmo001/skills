#!/usr/bin/env python3
"""Report retained imported skills whose tracked upstream path has changed."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORIGIN_PATTERN = re.compile(
    r"^https://github\.com/([^/]+)/([^/]+)/(tree|blob)/([^/]+)/(.*)$"
)


@dataclass(frozen=True)
class ImportStatus:
    name: str
    origin: str
    stored_sha: str
    upstream_sha: str | None
    state: str
    reason: str | None = None


def frontmatter_comment(text: str, key: str) -> str | None:
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        return None
    prefix = f"# {key}:"
    for line in lines[1:]:
        if line == "---":
            return None
        if line.startswith(prefix):
            return line.removeprefix(prefix).strip()
    return None


def parse_origin(origin: str) -> tuple[str, str, str, str] | None:
    match = ORIGIN_PATTERN.fullmatch(origin)
    if not match:
        return None
    owner, repo, kind, branch, path = match.groups()
    if kind == "blob" and not path.endswith("SKILL.md"):
        return None
    return owner, repo, branch, path


def latest_path_sha(
    owner: str, repo: str, branch: str, path: str, token: str | None
) -> str:
    query = urllib.parse.urlencode({"path": path, "sha": branch, "per_page": 1})
    request = urllib.request.Request(
        f"https://api.github.com/repos/{owner}/{repo}/commits?{query}",
        headers={
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    if not isinstance(payload, list) or not payload:
        raise ValueError("upstream path has no commits")
    sha = payload[0].get("sha")
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("GitHub returned an invalid commit SHA")
    return sha


def upstream_path_exists(
    owner: str, repo: str, branch: str, path: str, token: str | None
) -> bool:
    encoded_path = urllib.parse.quote(path, safe="/")
    query = urllib.parse.urlencode({"ref": branch})
    request = urllib.request.Request(
        f"https://api.github.com/repos/{owner}/{repo}/contents/{encoded_path}?{query}",
        headers={
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30):
            return True
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return False
        raise


def check_imports(root: Path = ROOT) -> list[ImportStatus]:
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    statuses: list[ImportStatus] = []
    imports = json.loads((root / "imports.json").read_text(encoding="utf-8"))["imports"]
    for name, metadata in sorted(imports.items()):
        origin = metadata["origin"]
        stored_sha = metadata["upstreamSha"]
        parsed = parse_origin(origin)
        if not parsed:
            statuses.append(
                ImportStatus(
                    name,
                    origin,
                    stored_sha,
                    None,
                    "error",
                    "invalid origin URL",
                )
            )
            continue
        try:
            upstream_sha = latest_path_sha(*parsed, token)
            if upstream_sha == stored_sha:
                state = "up-to-date"
                reason = None
            elif not upstream_path_exists(*parsed, token):
                state = "error"
                reason = "upstream path no longer exists"
            elif metadata.get("localEdits"):
                state = "manual-review"
                reason = None
            else:
                state = "update-available"
                reason = None
            statuses.append(
                ImportStatus(
                    name,
                    origin,
                    stored_sha,
                    upstream_sha,
                    state,
                    reason,
                )
            )
        except ValueError as error:
            statuses.append(
                ImportStatus(
                    name,
                    origin,
                    stored_sha,
                    None,
                    "error",
                    str(error),
                )
            )
        except (OSError, urllib.error.HTTPError):
            raise
    return statuses


def render_markdown(statuses: list[ImportStatus]) -> str:
    attention = [status for status in statuses if status.state != "up-to-date"]
    lines = [
        "<!-- adapted-skill-updates -->",
        "",
        "Tracked skills whose upstream source needs attention.",
        "",
        "## Manual review",
        "",
    ]
    reviews = [status for status in attention if status.state == "manual-review"]
    if reviews:
        for status in reviews:
            lines.extend(
                [
                    f"- **{status.name}**: `{status.stored_sha or 'unknown'}` -> `{status.upstream_sha}`",
                    f"  - {status.origin}",
                ]
            )
    else:
        lines.append("None.")
    updates = [status for status in attention if status.state == "update-available"]
    lines.extend(["", "## Upstream updates", ""])
    if updates:
        for status in updates:
            lines.extend(
                [
                    f"- **{status.name}**: `{status.stored_sha or 'unknown'}` -> `{status.upstream_sha}`",
                    f"  - {status.origin}",
                ]
            )
    else:
        lines.append("None.")
    lines.extend(["", "## Problems", ""])
    errors = [status for status in attention if status.state == "error"]
    if errors:
        for status in errors:
            lines.append(f"- **{status.name}**: {status.reason}")
    else:
        lines.append("None.")
    lines.extend(
        [
            "",
            f"Checked {len(statuses)} imports; {len(attention)} need attention.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--format", choices=("json", "markdown"), default="json")
    args = parser.parse_args()
    statuses = check_imports()
    if args.format == "markdown":
        print(render_markdown(statuses), end="")
    else:
        print(json.dumps([asdict(status) for status in statuses], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
