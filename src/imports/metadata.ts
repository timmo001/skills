import { Effect, FileSystem, JsonSchema, Path, Schema } from "effect";
import { Yaml } from "effect/encoding";

/** The single maintenance record for skills in this repository. */
export const SKILLS_FILE = "skills.yml";

/** The JSON Schema generated from {@link SkillsFile} for editors. */
export const SKILLS_SCHEMA_FILE = "skills.schema.json";

// The `u` flag lets the pattern reach the generated JSON Schema.
const Sha = Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/u)).annotate({
  identifier: "GitSha",
});

export const ImportMetadata = Schema.Struct({
  origin: Schema.NonEmptyString.annotate({
    description: "GitHub tree URL of the upstream skill directory",
  }),
  sourceName: Schema.optionalKey(
    Schema.NonEmptyString.annotate({
      description: "Upstream skill name, when it differs from the local name",
    }),
  ),
  upstreamSha: Sha.annotate({
    description: "Upstream commit the skill was last reviewed against",
  }),
  license: Schema.NonEmptyString.annotate({
    description: "Upstream licence identifier, or UNLICENSED",
  }),
  localEdits: Schema.Array(Schema.NonEmptyString).annotate({
    description:
      "What the committed copy changes from upstream; empty for external imports. An entry describes SKILL.md unless it starts with another file's path",
  }),
  /** `external` imports are unedited upstream skills installed from their origin, not committed here. */
  distribution: Schema.optionalKey(
    Schema.Literal("external").annotate({
      description:
        "Installed from the origin at the pinned SHA instead of committed here",
    }),
  ),
});

export interface ImportMetadata extends Schema.Schema.Type<
  typeof ImportMetadata
> {}

export const ToolReview = Schema.Struct({
  repo: Schema.String.check(Schema.isPattern(/^[\w.-]+\/[\w.-]+$/u)).annotate({
    description: "GitHub repository of the tool, owner/name",
  }),
  reviewed: Schema.NonEmptyString.annotate({
    description: "Release tag the skill was last reviewed against",
  }),
});

export interface ToolReview extends Schema.Schema.Type<typeof ToolReview> {}

export const SkillEntry = Schema.Struct({
  import: Schema.optionalKey(
    ImportMetadata.annotate({
      description: "Where an imported skill comes from and how it differs",
    }),
  ),
  tools: Schema.optionalKey(
    Schema.Array(ToolReview).annotate({
      description: "Tools whose new releases mean this skill needs a review",
    }),
  ),
});

export interface SkillEntry extends Schema.Schema.Type<typeof SkillEntry> {}

export const SkillsFile = Schema.Struct({
  skills: Schema.Record(Schema.String, SkillEntry).annotate({
    description: "Maintenance records keyed by skill directory name",
  }),
});

export interface SkillsFile extends Schema.Schema.Type<typeof SkillsFile> {}

/** Imported skills keyed by name, read from {@link SKILLS_FILE}. */
export interface ImportsFile {
  readonly imports: Readonly<Record<string, ImportMetadata>>;
}

export class MetadataError extends Schema.TaggedError<MetadataError>()(
  "MetadataError",
  { operation: Schema.String, message: Schema.String },
) {}

const metadataError = (operation: string) =>
  Effect.mapError(
    (cause: unknown) =>
      new MetadataError({ operation, message: String(cause) }),
  );

const HEADER = [
  `# yaml-language-server: $schema=./${SKILLS_SCHEMA_FILE}`,
  "---",
  "# Maintenance records for skills in this repository. skill-maintenance",
  "# reads and rewrites this file in canonical form; skills carry no",
  "# provenance comments of their own.",
];

const quote = (value: string) => JSON.stringify(value);

/** Render the canonical text of {@link SKILLS_FILE}: sorted skills, fixed key order. */
export const renderSkillsFile = (file: SkillsFile) => {
  const names = Object.keys(file.skills).sort();

  if (names.length === 0) return [...HEADER, "skills: {}", ""].join("\n");

  const lines = [...HEADER, "skills:"];

  for (const name of names) {
    const entry = file.skills[name];
    const metadata = entry?.import;
    const tools = entry?.tools ?? [];

    if (!metadata && tools.length === 0) {
      lines.push(`  ${name}: {}`);
      continue;
    }

    lines.push(`  ${name}:`);

    // upstreamSha sits two lines under the skill key, so a diff hunk for a
    // SHA change always carries the key in its context. Tools come after.
    if (metadata)
      lines.push(
        "    import:",
        `      upstreamSha: ${metadata.upstreamSha}`,
        `      origin: ${quote(metadata.origin)}`,
        ...(metadata.sourceName
          ? [`      sourceName: ${quote(metadata.sourceName)}`]
          : []),
        `      license: ${quote(metadata.license)}`,
        ...(metadata.localEdits.length === 0
          ? ["      localEdits: []"]
          : [
              "      localEdits:",
              ...metadata.localEdits.map((edit) => `        - ${quote(edit)}`),
            ]),
        ...(metadata.distribution
          ? [`      distribution: ${metadata.distribution}`]
          : []),
      );

    if (tools.length > 0)
      lines.push(
        "    tools:",
        ...tools.flatMap((tool) => [
          `      - repo: ${tool.repo}`,
          `        reviewed: ${quote(tool.reviewed)}`,
        ]),
      );
  }

  return [...lines, ""].join("\n");
};

/** Generate the editor schema from {@link SkillsFile}. */
export const renderSkillsSchema = () => {
  const document = JsonSchema.toDocumentDraft07(
    Schema.toJsonSchemaDocument(SkillsFile, { onExcessProperty: "error" }),
  );

  return `${JSON.stringify(
    {
      $schema: "http://json-schema.org/draft-07/schema#",
      title: "Skill maintenance records",
      $comment: "Generated from SkillsFile by mise run schema",
      ...document.schema,
      definitions: document.definitions,
    },
    null,
    2,
  )}\n`;
};

/** Read and decode {@link SKILLS_FILE}, keeping its text for the canonical-form check. */
export const readSkillsFile = Effect.fn("Skills.read")(function* (
  root: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const text = yield* fs
    .readFileString(path.join(root, SKILLS_FILE))
    .pipe(metadataError("skills.read"));

  const yaml = yield* Effect.try({
    try: () => Yaml.parse(text),
    catch: (cause) =>
      new MetadataError({ operation: "skills.yaml", message: String(cause) }),
  });

  const file = yield* Schema.decodeUnknownEffect(SkillsFile)(yaml, {
    onExcessProperty: "error",
  }).pipe(metadataError("skills.decode"));

  return { file, text };
});

const writeSkillsFile = Effect.fn("Skills.write")(function* (
  root: string,
  file: SkillsFile,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  yield* fs
    .writeFileString(path.join(root, SKILLS_FILE), renderSkillsFile(file))
    .pipe(metadataError("skills.write"));
});

/** Rewrite a hand-edited {@link SKILLS_FILE} in canonical form. */
export const formatSkillsFile = Effect.fn("Skills.format")(function* (
  root: string,
) {
  const { file, text } = yield* readSkillsFile(root);

  if (renderSkillsFile(file) !== text) yield* writeSkillsFile(root, file);
});

export const readImports = Effect.fn("Imports.read")(function* (root: string) {
  const { file } = yield* readSkillsFile(root);

  return {
    imports: Object.fromEntries(
      Object.entries(file.skills).flatMap(([name, entry]) =>
        entry.import ? [[name, entry.import] as const] : [],
      ),
    ),
  } satisfies ImportsFile;
});

export const getImport = Effect.fn("Imports.get")(function* (
  root: string,
  name: string,
) {
  const imports = yield* readImports(root);
  const metadata = imports.imports[name];

  if (!metadata) {
    return yield* new MetadataError({
      operation: "imports.get",
      message: `unknown imported skill: ${name}`,
    });
  }

  if (!isExternal(metadata) && metadata.localEdits.length === 0) {
    return yield* new MetadataError({
      operation: "imports.get",
      message: `${name}: imported skills must declare local edits`,
    });
  }

  return metadata;
});

/** Whether an import is installed from its origin instead of being committed here. */
export const isExternal = (metadata: ImportMetadata) =>
  metadata.distribution === "external";

/** Committed `SKILL.md` of an adapted import. External imports have none. */
export const trackedSkillPath = (root: string, name: string, path: Path.Path) =>
  path.join(root, name, "SKILL.md");

export const writeReviewedSha = Effect.fn("Imports.writeReviewedSha")(
  function* (root: string, name: string, sha: string) {
    const decoded = yield* Schema.decodeUnknownEffect(Sha)(sha).pipe(
      metadataError("imports.sha"),
    );

    const { file } = yield* readSkillsFile(root);
    const entry = file.skills[name];

    if (!entry?.import) {
      return yield* new MetadataError({
        operation: "imports.write",
        message: `unknown imported skill: ${name}`,
      });
    }

    if (entry.import.upstreamSha === decoded) return;

    yield* writeSkillsFile(root, {
      skills: {
        ...file.skills,
        [name]: { ...entry, import: { ...entry.import, upstreamSha: decoded } },
      },
    });
  },
);

/** Set the reviewed release tag of some of one skill's tools, keyed by repository. */
export const writeReviewedTags = Effect.fn("Skills.writeReviewedTags")(
  function* (root: string, name: string, tags: ReadonlyMap<string, string>) {
    const { file } = yield* readSkillsFile(root);
    const entry = file.skills[name];

    if (!entry?.tools) {
      return yield* new MetadataError({
        operation: "skills.write",
        message: `no tool reviews: ${name}`,
      });
    }

    yield* writeSkillsFile(root, {
      skills: {
        ...file.skills,
        [name]: {
          ...entry,
          tools: entry.tools.map((tool) => ({
            ...tool,
            reviewed: tags.get(tool.repo) ?? tool.reviewed,
          })),
        },
      },
    });
  },
);
