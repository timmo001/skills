import path from "node:path";
import { Config, Context, Effect, Layer } from "effect";
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

interface SkillsBinary {
  readonly path: string;
  readonly env?: Readonly<Record<string, string>> | undefined;
}

const make = (binary: Effect.Effect<SkillsBinary, CommandError>) =>
  Effect.gen(function* () {
    const executor = yield* CommandExecutor;

    const withEnv = (
      resolved: SkillsBinary,
      options: CommandOptions | undefined,
    ): CommandOptions => ({
      ...options,
      env: { ...options?.env, ...resolved.env },
    });

    return SkillsCli.of({
      run: (args, options) =>
        binary.pipe(
          Effect.flatMap((resolved) =>
            executor.run(resolved.path, args, withEnv(resolved, options)),
          ),
        ),
      inherit: (args, options) =>
        binary.pipe(
          Effect.flatMap((resolved) =>
            executor.inherit(resolved.path, args, withEnv(resolved, options)),
          ),
        ),
    });
  });

/** The {@link SkillsCliService} for the pinned Agent Skills CLI. */
export class SkillsCli extends Context.Service<SkillsCli, SkillsCliService>()(
  "skill-maintenance/SkillsCli",
) {
  /**
   * Resolve the pinned binary and Node once, from the skills checkout, so runs
   * inside temporary directories and consumer clones use the same versions.
   * Node goes first on `PATH` so the launcher's `node` skips the mise shim,
   * which would otherwise read (and refuse) a consumer's untrusted `mise.toml`.
   */
  static readonly layer = Layer.effect(
    SkillsCli,
    Effect.gen(function* () {
      const executor = yield* CommandExecutor;
      const root = yield* resolveSkillsRoot();

      const inheritedPath = yield* Config.String("PATH").pipe(
        Config.withDefault(""),
      );

      const which = (tool: string) =>
        executor
          .run("mise", ["which", tool], { cwd: root })
          .pipe(Effect.map((output) => output.trim()));

      const binary = yield* Effect.cached(
        Effect.all([which("skills"), which("node")]).pipe(
          Effect.map(([skills, node]) => ({
            path: skills,
            env: {
              PATH: [path.dirname(node), inheritedPath]
                .filter(Boolean)
                .join(path.delimiter),
            },
          })),
        ),
      );

      return yield* make(binary);
    }),
  );

  /** Run a known `skills` executable, such as a test fixture command. */
  static readonly layerWith = (binary: string) =>
    Layer.effect(SkillsCli, make(Effect.succeed({ path: binary })));
}
