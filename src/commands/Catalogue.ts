import { Console, Effect, FileSystem, Path, Schema } from "effect";
import { parseFrontmatter } from "../lib/frontmatter.js";

export const CATALOGUE_FILE = "SKILLS.md";

export class CatalogueError extends Schema.TaggedError<CatalogueError>()(
  "CatalogueError",
  { failures: Schema.Array(Schema.String) },
) {}

const CatalogFile = Schema.Struct({
  groupings: Schema.Array(
    Schema.Struct({
      title: Schema.String,
      description: Schema.String,
      skills: Schema.Array(Schema.String),
    }),
  ),
});

const escapeCell = (value: string) =>
  value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

export const listTopLevelSkills = Effect.fn("Catalogue.listTopLevelSkills")(
  function* (root: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(root);
    const skillNames: string[] = [];
    for (const entry of entries.sort()) {
      const entryInfo = yield* fs.stat(path.join(root, entry));
      if (entryInfo.type !== "Directory") continue;
      if (!(yield* fs.exists(path.join(root, entry, "SKILL.md")))) continue;
      skillNames.push(entry);
    }
    return skillNames;
  },
);

export const readSkillDescriptions = Effect.fn(
  "Catalogue.readSkillDescriptions",
)(function* (root: string, skillNames: readonly string[]) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const descriptions = new Map<string, string>();
  const failures: string[] = [];
  for (const name of skillNames) {
    const text = yield* fs.readFileString(path.join(root, name, "SKILL.md"));
    const parsed = parseFrontmatter(text);
    for (const failure of parsed.failures) failures.push(`${name}: ${failure}`);
    const description = (parsed.fields.get("description") ?? "").trim();
    if (!description) failures.push(`${name}: missing non-empty description`);
    else descriptions.set(name, description);
  }
  return { descriptions, failures };
});

export const renderSkillsCatalogue = Effect.fn(
  "Catalogue.renderSkillsCatalogue",
)(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const skillNames = yield* listTopLevelSkills(root);
  const { descriptions, failures } = yield* readSkillDescriptions(
    root,
    skillNames,
  );
  const catalogResult = yield* Effect.result(
    fs.readFileString(path.join(root, "skills.sh.json")).pipe(
      Effect.flatMap((text) =>
        Effect.try({
          try: () => JSON.parse(text),
          catch: (cause) => cause,
        }),
      ),
      Effect.flatMap(Schema.decodeUnknownEffect(CatalogFile)),
    ),
  );
  if (catalogResult._tag === "Failure")
    return yield* new CatalogueError({
      failures: [
        ...failures,
        `skills.sh.json: ${String(catalogResult.failure)}`,
      ],
    });
  const catalog = catalogResult.success;
  const catalogNames = catalog.groupings.flatMap(({ skills }) => skills);
  const missing = skillNames.filter((name) => !catalogNames.includes(name));
  const extra = catalogNames.filter((name) => !skillNames.includes(name));
  if (missing.length)
    failures.push(
      `skills.sh.json: missing skills: ${missing.sort().join(", ")}`,
    );
  if (extra.length)
    failures.push(`skills.sh.json: unknown skills: ${extra.sort().join(", ")}`);
  for (const name of catalogNames) {
    if (!descriptions.has(name) && skillNames.includes(name))
      failures.push(`${name}: missing description for catalogue`);
  }
  if (failures.length > 0) return yield* new CatalogueError({ failures });

  const sections = catalog.groupings.map((group) => {
    const rows = group.skills.map((name) => {
      const description = escapeCell(descriptions.get(name) ?? "");
      return `| [\`${name}\`](./${name}/) | ${description} |`;
    });
    return [
      `## ${group.title}`,
      "",
      group.description,
      "",
      "| Skill | Description |",
      "| --- | --- |",
      ...rows,
    ].join("\n");
  });

  return [
    "# Skills catalogue",
    "",
    "Generated from each top-level skill's `SKILL.md` frontmatter (`name` and `description`) and the groupings in `skills.sh.json`. Do not edit by hand; regenerate with:",
    "",
    "```bash",
    "./dist/skill-maintenance catalogue",
    "# or: mise run catalogue",
    "```",
    "",
    `This repository currently documents **${skillNames.length}** tracked skills. Upstream review snapshots under \`upstream/\` are not listed here.`,
    "",
    sections.join("\n\n"),
    "",
  ].join("\n");
});

export const writeSkillsCatalogue = Effect.fn("Catalogue.writeSkillsCatalogue")(
  function* (root: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const rendered = yield* renderSkillsCatalogue(root);
    const file = path.join(root, CATALOGUE_FILE);
    yield* fs.writeFileString(file, rendered);
    yield* Console.log(`Wrote ${CATALOGUE_FILE}.`);
  },
);

export const checkSkillsCatalogue = Effect.fn("Catalogue.checkSkillsCatalogue")(
  function* (root: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.join(root, CATALOGUE_FILE);
    const rendered = yield* renderSkillsCatalogue(root);
    if (!(yield* fs.exists(file)))
      return yield* new CatalogueError({
        failures: [
          `${CATALOGUE_FILE}: missing; run ./dist/skill-maintenance catalogue`,
        ],
      });
    const existing = yield* fs.readFileString(file);
    if (existing !== rendered)
      return yield* new CatalogueError({
        failures: [
          `${CATALOGUE_FILE}: stale; run ./dist/skill-maintenance catalogue`,
        ],
      });
  },
);
