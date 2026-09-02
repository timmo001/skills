import { Console, Effect, Path, Schema } from "effect";
import { readImports, trackedSkillPath } from "../imports/metadata.js";
import {
  comparison,
  directoriesMatch,
  withFetched,
} from "../imports/snapshot.js";
import { CommandExecutor } from "../services/CommandExecutor.js";

export const skillReimportCommand = (origin: string) =>
  `mise exec npm:skills -- skills add '${origin}' --global`;

export class CheckError extends Schema.TaggedError<CheckError>()("CheckError", {
  message: Schema.String,
}) {}

export const check = Effect.fn("Check.run")(function* (
  root: string,
  options: {
    readonly skill?: string | undefined;
    readonly diffOrigin: boolean;
    readonly openOpencode: boolean;
  },
) {
  const imports = yield* readImports(root);
  const path = yield* Path.Path;
  const executor = yield* CommandExecutor;
  const names = options.skill
    ? [options.skill]
    : Object.keys(imports.imports).filter(
        (name) => (imports.imports[name]?.localEdits.length ?? 0) > 0,
      );
  if (options.skill) {
    const selected = imports.imports[options.skill];
    if (!selected)
      return yield* new CheckError({
        message: `Imported skill not found: ${options.skill}`,
      });
    if (selected.localEdits.length === 0)
      return yield* new CheckError({
        message: `${options.skill}: imported skill is not adapted`,
      });
  }
  const exactMatches: string[] = [];
  for (const name of names) {
    const metadata = imports.imports[name];
    if (!metadata) continue;
    yield* withFetched(root, name, metadata, (candidate) =>
      Effect.gen(function* () {
        const target = path.dirname(
          trackedSkillPath(root, name, metadata, path),
        );
        if (yield* directoriesMatch(target, candidate)) {
          yield* Console.error(
            `${name}: adapted import exactly matches upstream; reimport with: ${skillReimportCommand(metadata.origin)}`,
          );
          exactMatches.push(name);
          return;
        }
        const diff = yield* comparison(root, name, metadata, candidate);
        if (options.diffOrigin) yield* Console.log(diff);
        if (options.openOpencode) {
          yield* executor.inherit(
            "opencode",
            [
              "--prompt",
              `Review this imported skill diff:\n${diff}`,
              "--agent",
              "plan",
            ],
            { cwd: root },
          );
        }
      }),
    ).pipe(
      Effect.catchTag("DeletedOriginError", () =>
        Console.log(
          `${name}: skipped because its upstream path no longer exists`,
        ),
      ),
    );
  }
  if (exactMatches.length > 0)
    return yield* new CheckError({
      message: `Adapted imports exactly match upstream: ${exactMatches.join(", ")}`,
    });
});
