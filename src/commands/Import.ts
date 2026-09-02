import { Console, Effect, Path, Schema } from "effect";
import {
  getImport,
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
  if (options.metadataOnly) {
    return yield* materialiseMetadata(
      trackedSkillPath(root, name, metadata, path),
      name,
      metadata,
    );
  }
  return yield* withFetched(root, name, metadata, (candidate, sha) =>
    Effect.gen(function* () {
      const target = path.dirname(trackedSkillPath(root, name, metadata, path));
      if (
        metadata.localEdits.length > 0 &&
        (yield* directoriesMatch(target, candidate))
      ) {
        yield* Console.error(
          `${name}: adapted import exactly matches its source; reimport with: mise exec npm:skills -- skills add '${metadata.origin}' --global`,
        );
        return yield* new ImportError({
          message: `${name}: adapted import exactly matches its source`,
        });
      }
      if (options.apply) {
        return yield* applyClean(root, name, metadata, candidate, sha);
      }
      yield* Console.log(yield* comparison(root, name, metadata, candidate));
    }),
  );
});
