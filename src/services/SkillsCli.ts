import { Context, Effect, Layer } from "effect";
import { resolveSkillsRoot } from "../lib/root.js";
import {
  CommandExecutor,
  type CommandError,
  type CommandOptions,
} from "./CommandExecutor.js";

/** Runs the Agent Skills CLI pinned in this repository's `mise.toml`, from any working directory. */
export interface SkillsCliService {
  /** Run `skills` with captured output, failing on a non-zero exit. */
  readonly run: (
    args: readonly string[],
    options?: CommandOptions,
  ) => Effect.Effect<string, CommandError>;
  /** Run `skills` with inherited stdio and return its exit code. */
  readonly inherit: (
    args: readonly string[],
    options?: CommandOptions,
  ) => Effect.Effect<number, CommandError>;
}

const make = (binary: Effect.Effect<string, CommandError>) =>
  Effect.gen(function* () {
    const executor = yield* CommandExecutor;

    return SkillsCli.of({
      run: (args, options) =>
        binary.pipe(
          Effect.flatMap((path) => executor.run(path, args, options)),
        ),
      inherit: (args, options) =>
        binary.pipe(
          Effect.flatMap((path) => executor.inherit(path, args, options)),
        ),
    });
  });

/** The {@link SkillsCliService} for the pinned Agent Skills CLI. */
export class SkillsCli extends Context.Service<SkillsCli, SkillsCliService>()(
  "skill-maintenance/SkillsCli",
) {
  /**
   * Resolve the pinned binary once, from the skills checkout, so runs inside
   * temporary directories and consumer clones use the same version.
   */
  static readonly layer = Layer.effect(
    SkillsCli,
    Effect.gen(function* () {
      const executor = yield* CommandExecutor;
      const root = yield* resolveSkillsRoot();

      const binary = yield* Effect.cached(
        executor
          .run("mise", ["which", "skills"], { cwd: root })
          .pipe(Effect.map((path) => path.trim())),
      );

      return yield* make(binary);
    }),
  );

  /** Run a known `skills` executable, such as a test fixture command. */
  static readonly layerWith = (binary: string) =>
    Layer.effect(SkillsCli, make(Effect.succeed(binary)));
}
