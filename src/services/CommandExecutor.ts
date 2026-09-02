import { Context, Effect, Layer, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

export class CommandError extends Schema.TaggedError<CommandError>()(
  "CommandError",
  {
    command: Schema.String,
    exitCode: Schema.Int,
    stderr: Schema.String,
  },
) {}

export interface CommandOptions {
  readonly cwd?: string | undefined;
  readonly env?: Readonly<Record<string, string>> | undefined;
}

export interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface CommandExecutorService {
  readonly capture: (
    command: string,
    args: readonly string[],
    options?: CommandOptions,
  ) => Effect.Effect<CommandResult, CommandError>;
  readonly run: (
    command: string,
    args: readonly string[],
    options?: CommandOptions,
  ) => Effect.Effect<string, CommandError>;
  readonly exitCode: (
    command: string,
    args: readonly string[],
    options?: CommandOptions,
  ) => Effect.Effect<number, CommandError>;
  readonly inherit: (
    command: string,
    args: readonly string[],
    options?: CommandOptions,
  ) => Effect.Effect<number, CommandError>;
  readonly stream: (
    command: string,
    args: readonly string[],
    options?: CommandOptions,
  ) => Stream.Stream<string, CommandError>;
}

const error = (command: string, cause: unknown) =>
  new CommandError({ command, exitCode: -1, stderr: String(cause) });

const collectText = (stream: Stream.Stream<Uint8Array, unknown>) =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runFold(
      () => "",
      (all, chunk) => all + chunk,
    ),
  );

export class CommandExecutor extends Context.Service<
  CommandExecutor,
  CommandExecutorService
>()("skill-maintenance/CommandExecutor") {
  static readonly layer = Layer.effect(
    CommandExecutor,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const make = (
        command: string,
        args: readonly string[],
        options?: CommandOptions,
      ) =>
        ChildProcess.make(command, args, {
          cwd: options?.cwd,
          env: options?.env,
          extendEnv: true,
        });
      const capture = Effect.fn("CommandExecutor.capture")(function* (
        command: string,
        args: readonly string[],
        options?: CommandOptions,
      ) {
        const label = `${command} ${args.join(" ")}`;
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* spawner.spawn(make(command, args, options));
            const [stdout, stderr, exitCode] = yield* Effect.all(
              [
                collectText(handle.stdout),
                collectText(handle.stderr),
                handle.exitCode,
              ],
              { concurrency: "unbounded" },
            );
            return {
              stdout,
              stderr: stderr.trim(),
              exitCode: Number(exitCode),
            };
          }).pipe(
            Effect.mapError((cause) =>
              cause instanceof CommandError ? cause : error(label, cause),
            ),
          ),
        );
      });
      const run = Effect.fn("CommandExecutor.run")(function* (
        command: string,
        args: readonly string[],
        options?: CommandOptions,
      ) {
        const result = yield* capture(command, args, options);
        if (result.exitCode !== 0) {
          return yield* new CommandError({
            command: `${command} ${args.join(" ")}`,
            exitCode: result.exitCode,
            stderr: result.stderr,
          });
        }
        return result.stdout;
      });
      const exitCode = Effect.fn("CommandExecutor.exitCode")(function* (
        command: string,
        args: readonly string[],
        options?: CommandOptions,
      ) {
        const code = yield* spawner
          .exitCode(make(command, args, options))
          .pipe(
            Effect.mapError((cause) =>
              error(`${command} ${args.join(" ")}`, cause),
            ),
          );
        return Number(code);
      });
      const inherit = Effect.fn("CommandExecutor.inherit")(function* (
        command: string,
        args: readonly string[],
        options?: CommandOptions,
      ) {
        const code = yield* spawner
          .exitCode(
            ChildProcess.make(command, args, {
              cwd: options?.cwd,
              env: options?.env,
              extendEnv: true,
              stdin: "inherit",
              stdout: "inherit",
              stderr: "inherit",
            }),
          )
          .pipe(
            Effect.mapError((cause) =>
              error(`${command} ${args.join(" ")}`, cause),
            ),
          );
        return Number(code);
      });
      const stream = (
        command: string,
        args: readonly string[],
        options?: CommandOptions,
      ) => {
        const label = `${command} ${args.join(" ")}`;
        return spawner.spawn(make(command, args, options)).pipe(
          Effect.mapError((cause) => error(label, cause)),
          Effect.map((handle) => {
            const output: string[] = [];
            const lines = handle.all.pipe(
              Stream.decodeText(),
              Stream.splitLines,
              Stream.tap((line) =>
                Effect.sync(() => {
                  output.push(line);
                }),
              ),
              Stream.mapError((cause) => error(label, cause)),
            );
            const completed = Stream.fromEffect(handle.exitCode).pipe(
              Stream.flatMap((exitCode) =>
                Number(exitCode) === 0
                  ? Stream.empty
                  : Stream.fail(
                      new CommandError({
                        command: label,
                        exitCode: Number(exitCode),
                        stderr: output.join("\n").trim(),
                      }),
                    ),
              ),
              Stream.mapError((cause) =>
                cause instanceof CommandError ? cause : error(label, cause),
              ),
            );
            return lines.pipe(Stream.concat(completed));
          }),
          Stream.unwrap,
        );
      };
      return CommandExecutor.of({ capture, run, exitCode, inherit, stream });
    }),
  );
}
