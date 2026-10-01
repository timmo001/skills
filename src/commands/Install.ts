import { Console, Effect, FileSystem, Path, Result, Schema } from "effect";
import { isExternal, readImports } from "../imports/metadata.js";
import { withFetched } from "../imports/snapshot.js";

/** Records which skill directories the installer owns and the SHA each was installed from. */
export const MANIFEST_FILE = ".external-skills.json";

const Manifest = Schema.Record(Schema.String, Schema.String);

export class InstallError extends Schema.TaggedError<InstallError>()(
  "InstallError",
  { message: Schema.String },
) {}

const readManifest = Effect.fn("Install.readManifest")(function* (
  file: string,
) {
  const fs = yield* FileSystem.FileSystem;

  if (!(yield* fs.exists(file))) return {};

  const decoded = yield* Effect.result(
    fs.readFileString(file).pipe(
      Effect.flatMap((text) =>
        Effect.try({ try: () => JSON.parse(text), catch: String }),
      ),
      Effect.flatMap(Schema.decodeUnknownEffect(Manifest)),
    ),
  );

  return Result.isSuccess(decoded) ? { ...decoded.success } : {};
});

/** A skill whose `SKILL.md` is a live symlink, such as one stowed from a dotfiles source. */
const isLinkedSkill = Effect.fn("Install.isLinkedSkill")(function* (
  directory: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(directory, "SKILL.md");
  const link = yield* Effect.result(fs.readLink(file));

  return Result.isSuccess(link) && (yield* fs.exists(file));
});

/**
 * Install every external import into `target` at its pinned SHA, without
 * committing anything. Linked local skills win over external ones of the same
 * name, and directories this installer created are removed once their import
 * is no longer external.
 */
export const install = Effect.fn("Install.run")(function* (
  root: string,
  target: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const imports = yield* readImports(root);
  const manifestFile = path.join(target, MANIFEST_FILE);
  const manifest: Record<string, string> = yield* readManifest(manifestFile);
  const failed: string[] = [];

  const external = Object.entries(imports.imports).filter(([, metadata]) =>
    isExternal(metadata),
  );

  yield* fs.makeDirectory(target, { recursive: true });

  for (const [name, metadata] of external) {
    const destination = path.join(target, name);

    if (yield* isLinkedSkill(destination)) {
      delete manifest[name];
      yield* Console.error(
        `${name}: skipped, a linked local skill already uses this name`,
      );
      continue;
    }

    if (
      manifest[name] === metadata.upstreamSha &&
      (yield* fs.exists(path.join(destination, "SKILL.md")))
    )
      continue;

    const installed = yield* Effect.result(
      withFetched(
        root,
        name,
        metadata,
        (candidate) =>
          Effect.gen(function* () {
            if (yield* fs.exists(destination))
              yield* fs.remove(destination, { recursive: true });
            yield* fs.copy(candidate, destination);
          }),
        { pinned: true },
      ),
    );

    if (Result.isFailure(installed)) {
      yield* Console.error(
        `${name}: install failed: ${installed.failure instanceof Error ? installed.failure.message : String(installed.failure)}`,
      );
      failed.push(name);
      continue;
    }

    manifest[name] = metadata.upstreamSha;
    yield* Console.log(`${name}: installed ${metadata.upstreamSha}`);
  }

  for (const name of Object.keys(manifest)) {
    if (external.some(([candidate]) => candidate === name)) continue;

    const destination = path.join(target, name);

    if ((yield* fs.exists(destination)) && !(yield* isLinkedSkill(destination)))
      yield* fs.remove(destination, { recursive: true });
    delete manifest[name];
    yield* Console.log(`${name}: removed`);
  }

  yield* fs.writeFileString(
    manifestFile,
    `${JSON.stringify(manifest, Object.keys(manifest).sort(), 2)}\n`,
  );

  if (failed.length > 0)
    return yield* new InstallError({
      message: `Failed to install external skills: ${failed.join(", ")}`,
    });
});
