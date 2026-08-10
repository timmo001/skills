#!/usr/bin/env python3
"""Validate repository-level Agent Skills invariants without dependencies."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ALLOWED_FIELDS = {
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
    "allowed-tools",
}
NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
LINK_PATTERN = re.compile(r"(?<!!)\[[^]]*]\(([^)]+)\)")
TABLE_SKILL_PATTERN = re.compile(r"^\| `([^`]+)` \|", re.MULTILINE)


def frontmatter(path: Path) -> tuple[dict[str, str], list[str]]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    errors: list[str] = []
    if not lines or lines[0] != "---":
        return {}, ["missing opening frontmatter delimiter"]
    try:
        end = lines.index("---", 1)
    except ValueError:
        return {}, ["missing closing frontmatter delimiter"]

    fields: dict[str, str] = {}
    for line in lines[1:end]:
        if not line or line.lstrip().startswith("#") or line[0].isspace():
            continue
        match = re.match(r"^([a-z][a-z0-9-]*):(?:\s*(.*))?$", line)
        if not match:
            errors.append(f"invalid top-level frontmatter line: {line!r}")
            continue
        key, value = match.groups()
        fields[key] = value or ""
    return fields, errors


def validate_skill(skill_dir: Path) -> list[str]:
    path = skill_dir / "SKILL.md"
    fields, errors = frontmatter(path)
    unknown = sorted(set(fields) - ALLOWED_FIELDS)
    if unknown:
        errors.append(f"unsupported frontmatter fields: {', '.join(unknown)}")

    name = fields.get("name", "").strip(" '\"")
    if not name:
        errors.append("missing non-empty name")
    elif not NAME_PATTERN.fullmatch(name):
        errors.append(f"invalid skill name: {name!r}")
    elif name != skill_dir.name:
        errors.append(f"name {name!r} does not match directory {skill_dir.name!r}")

    if "description" not in fields:
        errors.append("missing description")

    text = path.read_text(encoding="utf-8")
    for target in LINK_PATTERN.findall(text):
        target = target.split("#", 1)[0]
        if not target or "://" in target or target.startswith(("#", "mailto:")):
            continue
        if target.startswith("/"):
            errors.append(f"absolute Markdown link is not portable: {target}")
        elif not (skill_dir / target).resolve().exists():
            errors.append(f"broken relative Markdown link: {target}")
    return errors


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"{path.relative_to(ROOT)}: {error}") from error


def main() -> int:
    failures: list[str] = []
    skill_dirs = sorted(path.parent for path in ROOT.glob("*/SKILL.md"))
    skill_names = {path.name for path in skill_dirs}
    if not skill_dirs:
        failures.append("no top-level skills found")

    for skill_dir in skill_dirs:
        for error in validate_skill(skill_dir):
            failures.append(f"{skill_dir.relative_to(ROOT)}: {error}")

    try:
        catalog = load_json(ROOT / "skills.sh.json")
        catalog_names = [
            name
            for grouping in catalog.get("groupings", [])
            for name in grouping.get("skills", [])
        ]
        if len(catalog_names) != len(set(catalog_names)):
            failures.append("skills.sh.json: a skill appears in more than one grouping")
        missing = sorted(skill_names - set(catalog_names))
        extra = sorted(set(catalog_names) - skill_names)
        if missing:
            failures.append(f"skills.sh.json: missing skills: {', '.join(missing)}")
        if extra:
            failures.append(f"skills.sh.json: unknown skills: {', '.join(extra)}")

        portability = (ROOT / "PORTABILITY.md").read_text(encoding="utf-8")
        inventory_names = TABLE_SKILL_PATTERN.findall(portability)
        if len(inventory_names) != len(set(inventory_names)):
            failures.append("PORTABILITY.md: a skill appears more than once")
        missing_inventory = sorted(skill_names - set(inventory_names))
        extra_inventory = sorted(set(inventory_names) - skill_names)
        if missing_inventory:
            failures.append(
                f"PORTABILITY.md: missing skills: {', '.join(missing_inventory)}"
            )
        if extra_inventory:
            failures.append(
                f"PORTABILITY.md: unknown skills: {', '.join(extra_inventory)}"
            )

    except ValueError as error:
        failures.append(str(error))

    if failures:
        print("Validation failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    print(f"Validated {len(skill_dirs)} skills and repository metadata.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
