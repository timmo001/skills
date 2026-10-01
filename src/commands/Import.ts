import { Console, Effect, Path, Schema } from "effect";
import {
  getImport,
  isExternal,
  trackedSkillPath,
  writeReviewedSha,
} from "../imports/metadata.js";
import {
  applyClean,
  comparison,
  directoriesMatch,
  materialiseMetadata,
  withFetched,
} from "../imports/snapshot.js";

export class ImportError extends Schema.TaggedError<ImportError>()(
  "ImportError",
  { message: Schema.String },
) {}

export const importSkill = Effect.fn("ImportSkill.run")(function* (
  root: string,
  name: string,
  options: {
    readonly apply: boolean;
    readonly metadataOnly: boolean;
    readonly reviewedSha?: string | undefined;
  },
) {
  let metadata = yield* getImport(root, name);

  if (options.reviewedSha) {
    yield* writeReviewedSha(root, name, options.reviewedSha);
    metadata = yield* getImport(root, name);
  }

  const path = yield* Path.Path;

  if (isExternal(metadata)) {
    if (options.metadataOnly) return;

    return yield* withFetched(root, name, metadata, (latest, sha) =>
      Effect.gen(function* () {
        if (options.apply) return yield* applyClean(root, name, metadata, sha);

        yield* withFetched(
          root,
          name,
          metadata,
          (pinned) =>
            comparison(pinned, latest).pipe(Effect.flatMap(Console.log)),
          { pinned: true },
        );
      }),
    );
  }

  const target = path.dirname(trackedSkillPath(root, name, path));

  if (options.metadataOnly) {
    return yield* materialiseMetadata(
      trackedSkillPath(root, name, path),
      name,
      metadata,
    );
  }

  return yield* withFetched(root, name, metadata, (candidate, sha) =>
    Effect.gen(function* () {
      if (yield* directoriesMatch(target, candidate)) {
        yield* Console.error(
          `${name}: adapted import exactly matches its source; mark it external in imports.json instead`,
        );

        return yield* new ImportError({
          message: `${name}: adapted import exactly matches its source`,
        });
      }

      if (options.apply) {
        return yield* applyClean(root, name, metadata, sha);
      }

      yield* Console.log(yield* comparison(target, candidate));
    }),
  );
});
