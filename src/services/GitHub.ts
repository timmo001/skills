import {
  Cli,
  Gh,
  Issue,
  RateLimit,
  Workflow,
  httpStatus,
  isTransient,
  type GhError,
  type GhOptions,
  type Interface as GhInterface,
} from "@timmo001/effect-gh";
import {
  Config,
  Context,
  Effect,
  Layer,
  Match,
  Option,
  Redacted,
  Schedule,
  Schema,
  Stream,
} from "effect";

export class GitHubError extends Schema.TaggedError<GitHubError>()(
  "GitHubError",
  {
    command: Schema.String,
    exitCode: Schema.Int,
    stderr: Schema.String,
    status: Schema.NullOr(Schema.Int),
    retryable: Schema.Boolean,
    /** The response did not match the operation's schema. */
    decode: Schema.optionalKey(Schema.Boolean),
  },
) {}

/** The network probe exhausted its bounded wait without reaching GitHub. */
export class NetworkUnavailableError extends Schema.TaggedError<NetworkUnavailableError>()(
  "NetworkUnavailableError",
  { message: Schema.String },
) {}

export interface GitHubService {
  readonly waitForNetwork: () => Effect.Effect<
    void,
    GitHubError | NetworkUnavailableError
  >;
  readonly isAvailable: () => Effect.Effect<boolean, GitHubError>;
  /**
   * Run a known-idempotent effect-gh read, retrying transient failures.
   * `label` names the operation in errors.
   */
  readonly read: <A, R>(
    label: string,
    operation: Effect.Effect<A, GhOperationError, R>,
  ) => Effect.Effect<A, GitHubError, Exclude<R, Gh>>;
  /** Run an effect-gh mutation. A failed mutation may have applied, so it is never retried. */
  readonly write: <A, R>(
    label: string,
    operation: Effect.Effect<A, GhOperationError, R>,
  ) => Effect.Effect<A, GitHubError, Exclude<R, Gh>>;
  /** Run an effect-gh stream, such as a run watch. Streams are never replayed. */
  readonly stream: <A, R>(
    label: string,
    operation: Stream.Stream<A, GhOperationError, R>,
  ) => Stream.Stream<A, GitHubError, Exclude<R, Gh>>;
}

/** Failures effect-gh operations can raise, including rejected inputs. */
export type GhOperationError =
  GhError | Issue.InvalidInput | Workflow.InvalidOptions;

const isNetworkFailure = (error: GitHubError) =>
  error.status === null &&
  /connection reset|could not resolve host|error connecting to|no such host|temporary failure in name resolution|network is unreachable|no route to host|failed to connect|connection timed out|timed out after|tls handshake/i.test(
    error.stderr,
  );

// Git transport drops that effect-gh's network pattern does not cover.
const isGitTransportDrop = (stderr: string) =>
  /closed by remote host|kex_exchange_identification|remote end hung up unexpectedly|early EOF/i.test(
    stderr,
  );

/** Map an effect-gh failure into the domain error. */
export const fromGhError = (
  command: string,
  error: GhOperationError,
): GitHubError =>
  error instanceof Issue.InvalidInput ||
  error instanceof Workflow.InvalidOptions
    ? new GitHubError({
        command,
        exitCode: 0,
        stderr: String(error.cause),
        status: null,
        retryable: false,
      })
    : fromCommandError(command, error);

const fromCommandError = (command: string, error: GhError) =>
  Match.value(error).pipe(
    Match.tags({
      GhCommandError: (error) =>
        new GitHubError({
          command,
          exitCode: error.exitCode,
          stderr: error.stderr.trim(),
          status: Option.getOrNull(httpStatus(error)),
          retryable: isTransient(error) || isGitTransportDrop(error.stderr),
        }),
      GhTimeoutError: (error) =>
        new GitHubError({
          command,
          exitCode: -1,
          stderr: `Command timed out after ${error.timeoutMs}ms`,
          status: null,
          retryable: isTransient(error),
        }),
      GhDecodeError: (error) =>
        new GitHubError({
          command,
          exitCode: 0,
          stderr: String(error.cause),
          status: null,
          retryable: false,
          decode: true,
        }),
      GhPlatformError: (error) =>
        new GitHubError({
          command,
          exitCode: -1,
          stderr: String(error.cause),
          status: null,
          retryable: false,
        }),
      GhOutputLimitError: (error) =>
        new GitHubError({
          command,
          exitCode: -1,
          stderr: `Command output passed ${error.limitBytes} bytes`,
          status: null,
          retryable: false,
        }),
    }),
    Match.exhaustive,
  );

/** Merge an auth token into every gh call made through this service. */
const withEnv = (
  gh: GhInterface,
  env: Readonly<Record<string, string>> | undefined,
): GhInterface => {
  if (!env) return gh;

  const merge = <O extends GhOptions | undefined>(options: O) => ({
    ...options,
    env: { ...env, ...options?.env },
  });

  return {
    execute: (args, options) => gh.execute(args, merge(options)),
    json: (args, schema, options) => gh.json(args, schema, merge(options)),
    stream: (args, options) => gh.stream(args, merge(options)),
    interactive: (args, options) => gh.interactive(args, merge(options)),
  };
};

export class GitHub extends Context.Service<GitHub, GitHubService>()(
  "skill-maintenance/GitHub",
) {
  static readonly layer = Layer.effect(
    GitHub,
    Effect.gen(function* () {
      const gh = yield* Gh;
      const token = yield* Config.option(Config.Redacted("GH_TOKEN"));

      const fallbackToken = yield* Config.option(
        Config.Redacted("GITHUB_TOKEN"),
      );

      const retries = yield* Config.Int(
        "SKILL_MAINTENANCE_GITHUB_RETRIES",
      ).pipe(
        Config.withDefault(2),
        Config.map((value) => Math.max(0, value)),
      );

      const env = token.pipe(
        Option.orElse(() => fallbackToken),
        Option.map((value) => ({ GH_TOKEN: Redacted.value(value) })),
        Option.getOrUndefined,
      );

      const service = withEnv(gh, env);

      const write: GitHubService["write"] = (label, operation) =>
        operation.pipe(
          Effect.provideService(Gh, service),
          Effect.mapError((error) => fromGhError(label, error)),
        );

      const stream: GitHubService["stream"] = (label, operation) =>
        operation.pipe(
          Stream.provideService(Gh, service),
          Stream.mapError((error) => fromGhError(label, error)),
        );

      const read: GitHubService["read"] = (label, operation) =>
        write(label, operation).pipe(
          Effect.retry({
            schedule: Schedule.exponential("1 second"),
            times: retries,
            while: (error) => error.retryable,
          }),
        );

      const waitForNetwork = Effect.fn("GitHub.waitForNetwork")(function* () {
        yield* write(
          "gh api rate_limit",
          RateLimit.get("core", { timeout: "2 seconds" }),
        ).pipe(
          // Timer runs missed during suspend start at resume, before Wi-Fi
          // reconnects, so allow about a minute for the connection.
          Effect.retry({
            schedule: Schedule.min([
              Schedule.exponential("500 millis"),
              Schedule.spaced("5 seconds"),
            ]),
            times: 10,
            while: isNetworkFailure,
          }),
          Effect.mapError((error) =>
            isNetworkFailure(error)
              ? new NetworkUnavailableError({
                  message:
                    "[WARN] Network unavailable; skill updates deferred to a later run",
                })
              : error,
          ),
        );
      });

      const isAvailable = Effect.fn("GitHub.isAvailable")(function* () {
        return yield* Cli.version().pipe(
          Effect.provideService(Gh, service),
          Effect.as(true),
          Effect.catchTag("GhCommandError", () => Effect.succeed(false)),
          Effect.mapError((error) => fromGhError("gh --version", error)),
        );
      });

      return GitHub.of({ read, write, stream, isAvailable, waitForNetwork });
    }),
  );
}
