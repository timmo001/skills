import { Console, Effect, FileSystem, Path, Result, Schema } from "effect";
import { isExternal, readImports } from "../imports/metadata.js";
import { parseOrigin } from "../imports/upstream.js";
import { parseFrontmatter } from "../lib/frontmatter.js";

export const CATALOGUE_FILE = "SKILLS.md";

/** Claude plugin marketplace generated alongside the catalogue. */
export const MARKETPLACE_FILE = ".claude-plugin/marketplace.json";

/** Plugin that loads every committed top-level skill. */
const MARKETPLACE_PLUGIN = "timmo";

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

  if (Result.isFailure(catalogResult))
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
    "External imports are installed from their origin and are not listed here.",
    "",
    sections.join("\n\n"),
    "",
  ].join("\n");
});

/**
 * Renders the Claude plugin marketplace: one plugin for the committed skills,
 * and one per external import pinned to its reviewed upstream commit, with
 * the skill it provides in `metadata.skill`.
 */
export const renderMarketplace = Effect.fn("Catalogue.renderMarketplace")(
  function* (root: string) {
    const path = yield* Path.Path;

    const imports = yield* readImports(root).pipe(
      Effect.mapError(
        (error) =>
          new CatalogueError({
            failures: [`imports.json: ${error.message}`],
          }),
      ),
    );

    const external = Object.entries(imports.imports)
      .filter(([, metadata]) => isExternal(metadata))
      .sort(([a], [b]) => a.localeCompare(b));

    const importPlugins = [];

    for (const [name, metadata] of external) {
      const origin = yield* parseOrigin(metadata.origin).pipe(
        Effect.mapError(
          () =>
            new CatalogueError({
              failures: [`${name}: unsupported origin URL`],
            }),
        ),
      );

      // Prefixed so imports never shadow a same-named plugin from elsewhere.
      importPlugins.push({
        name: `${MARKETPLACE_PLUGIN}-${name}`,
        description: `External import from ${origin.owner}/${origin.repo}`,
        license: metadata.license,
        metadata: { skill: name },
        source: {
          source: "git-subdir",
          url: `${origin.owner}/${origin.repo}`,
          path:
            origin.type === "file" ? path.dirname(origin.path) : origin.path,
          sha: metadata.upstreamSha,
        },
      });
    }

    const marketplace = {
      name: "timmo001-skills",
      description:
        "Agent Skills from timmo001/skills, with external imports pinned to their reviewed commits",
      owner: { name: "Aidan Timson", url: "https://github.com/timmo001" },
      plugins: [
        {
          name: MARKETPLACE_PLUGIN,
          description: "Skills authored or adapted in timmo001/skills",
          source: ".",
          skills: "./",
        },
        ...importPlugins,
      ],
    };

    return `${JSON.stringify(marketplace, null, 2)}\n`;
  },
);

const generatedFiles = Effect.fn("Catalogue.generatedFiles")(function* (
  root: string,
) {
  return [
    [CATALOGUE_FILE, yield* renderSkillsCatalogue(root)],
    [MARKETPLACE_FILE, yield* renderMarketplace(root)],
  ] as const;
});

export const writeSkillsCatalogue = Effect.fn("Catalogue.writeSkillsCatalogue")(
  function* (root: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    for (const [name, rendered] of yield* generatedFiles(root)) {
      const file = path.join(root, name);
      yield* fs.makeDirectory(path.dirname(file), { recursive: true });
      yield* fs.writeFileString(file, rendered);
      yield* Console.log(`Wrote ${name}.`);
    }
  },
);

export const checkSkillsCatalogue = Effect.fn("Catalogue.checkSkillsCatalogue")(
  function* (root: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const failures: string[] = [];

    for (const [name, rendered] of yield* generatedFiles(root)) {
      const file = path.join(root, name);

      if (!(yield* fs.exists(file)))
        failures.push(
          `${name}: missing; run ./dist/skill-maintenance catalogue`,
        );
      else if ((yield* fs.readFileString(file)) !== rendered)
        failures.push(`${name}: stale; run ./dist/skill-maintenance catalogue`);
    }

    if (failures.length > 0) return yield* new CatalogueError({ failures });
  },
);
