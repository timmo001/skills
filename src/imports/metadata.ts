import { Effect, FileSystem, Path, Schema } from "effect";

const Sha = Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/)).annotate({
  identifier: "GitSha",
});

export const ImportMetadata = Schema.Struct({
  origin: Schema.NonEmptyString,
  sourceName: Schema.optionalKey(Schema.NonEmptyString),
  upstreamSha: Sha,
  license: Schema.NonEmptyString,
  localEdits: Schema.Array(Schema.NonEmptyString),
  distribution: Schema.optionalKey(
    Schema.Literals(["official-source", "wholesale"]),
  ),
});
export interface ImportMetadata
  extends Schema.Schema.Type<typeof ImportMetadata> {}

export const ImportsFile = Schema.Struct({
  version: Schema.Literal(1),
  imports: Schema.Record(Schema.String, ImportMetadata),
});
export interface ImportsFile extends Schema.Schema.Type<typeof ImportsFile> {}

export class MetadataError extends Schema.TaggedError<MetadataError>()(
  "MetadataError",
  { operation: Schema.String, message: Schema.String },
) {}

const metadataError = (operation: string) =>
  Effect.mapError(
    (cause: unknown) =>
      new MetadataError({ operation, message: String(cause) }),
  );

export const readImports = Effect.fn("Imports.read")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = yield* fs
    .readFileString(path.join(root, "imports.json"))
    .pipe(metadataError("imports.read"));
  const json = yield* Effect.try({
    try: () => JSON.parse(text),
    catch: (cause) =>
      new MetadataError({ operation: "imports.json", message: String(cause) }),
  });
  return yield* Schema.decodeUnknownEffect(ImportsFile)(json).pipe(
    metadataError("imports.decode"),
  );
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
  if (
    metadata.distribution !== "official-source" &&
    metadata.distribution !== "wholesale" &&
    metadata.localEdits.length === 0
  ) {
    return yield* new MetadataError({
      operation: "imports.get",
      message: `${name}: imported skills must declare local edits`,
    });
  }
  return metadata;
});

export const trackedSkillPath = (
  root: string,
  name: string,
  metadata: ImportMetadata,
  path: Path.Path,
) =>
  metadata.distribution === "official-source"
    ? path.join(root, "upstream", name, "UPSTREAM_SKILL.md")
    : path.join(root, name, "SKILL.md");

export const writeReviewedSha = Effect.fn("Imports.writeReviewedSha")(
  function* (root: string, name: string, sha: string) {
    const decoded = yield* Schema.decodeUnknownEffect(Sha)(sha).pipe(
      metadataError("imports.sha"),
    );
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.join(root, "imports.json");
    const text = yield* fs
      .readFileString(file)
      .pipe(metadataError("imports.read"));
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const marker = new RegExp(`"${escapedName}"\\s*:\\s*\\{`);
    const match = marker.exec(text);
    if (!match) {
      return yield* new MetadataError({
        operation: "imports.write",
        message: `unknown imported skill: ${name}`,
      });
    }
    const start = match.index;
    const remaining = text.slice(start + match[0].length);
    const nextEntry = /,\s*"[^"]+"\s*:\s*\{/.exec(remaining);
    const end = nextEntry
      ? start + match[0].length + nextEntry.index
      : text.length;
    const entry = text.slice(start, end);
    const shaPattern = /("upstreamSha"\s*:\s*")[0-9a-f]+(")/;
    if (!shaPattern.test(entry)) {
      return yield* new MetadataError({
        operation: "imports.write",
        message: `${name}: missing upstream SHA`,
      });
    }
    const updated = entry.replace(shaPattern, `$1${decoded}$2`);
    if (updated === entry) return;
    yield* fs
      .writeFileString(file, text.slice(0, start) + updated + text.slice(end))
      .pipe(metadataError("imports.write"));
  },
);
