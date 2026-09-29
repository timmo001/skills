import {
  Api,
  Gh,
  GhChunk,
  type GhError,
  type GhOptions,
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
  },
) {}

export interface GitHubApiOptions {
  readonly jq?: string | undefined;
  readonly method?: "POST" | "PATCH";
  readonly body?: Schema.Json;
}

export interface GitHubRunOptions {
  /** Opt in only for known-idempotent reads. Mutations are never retried by default. */
  readonly readOnly?: boolean;
  readonly timeout?: GhOptions["timeout"];
}

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
  readonly run: (
    args: readonly string[],
    options?: GitHubRunOptions,
  ) => Effect.Effect<string, GitHubError>;
  readonly stream: (
    args: readonly string[],
    options?: Pick<GhOptions, "cwd" | "timeout">,
  ) => Stream.Stream<GhChunk, GitHubError>;
  readonly json: (
    args: readonly string[],
    options?: GitHubRunOptions,
  ) => Effect.Effect<unknown, GitHubError>;
  readonly api: (
    endpoint: string,
    options?: GitHubApiOptions,
  ) => Effect.Effect<string, GitHubError>;
  readonly apiJson: (
    endpoint: string,
    options?: GitHubApiOptions,
  ) => Effect.Effect<unknown, GitHubError>;
}

const statusFromStderr = (stderr: string) => {
  const match = stderr.match(/(?:HTTP|status(?: code)?)\s*(\d{3})/i);

  return match?.[1] ? Number(match[1]) : null;
};

const isRetryable = (stderr: string) => {
  const lower = stderr.toLowerCase();

  return [
    "rate limit",
    "secondary rate",
    "http 5",
    "502",
    "503",
    "504",
    "connection reset",
    "could not resolve host",
    "error connecting to",
    "no such host",
    "network is unreachable",
    "temporarily unavailable",
    "timeout",
    "tls handshake",
  ].some((pattern) => lower.includes(pattern));
};

const isNetworkFailure = (error: GitHubError) =>
  error.status === null &&
  /connection reset|could not resolve host|error connecting to|no such host|temporary failure in name resolution|network is unreachable|no route to host|failed to connect|connection timed out|timed out after|tls handshake/i.test(
    error.stderr,
  );

const fromGhError = (command: string, error: GhError, stderr?: string) => {
  const details = Match.value(error).pipe(
    Match.tags({
      GhCommandError: (error) => {
        const detail = (stderr ?? error.stderr).trim();

        return {
          exitCode: error.exitCode,
          stderr: detail,
          retryable: isRetryable(detail),
        };
      },
      GhTimeoutError: (error) => ({
        exitCode: -1,
        stderr: `Command timed out after ${error.timeoutMs}ms`,
        retryable: true,
      }),
      GhDecodeError: (error) => ({
        exitCode: 0,
        stderr: String(error.cause),
        retryable: false,
      }),
      GhPlatformError: (error) => {
        const detail = String(error.cause);

        return { exitCode: -1, stderr: detail, retryable: isRetryable(detail) };
      },
    }),
    Match.exhaustive,
  );

  return new GitHubError({
    command,
    ...details,
    status: statusFromStderr(details.stderr),
  });
};

const decodeJson = (command: string, output: string) =>
  Effect.try({
    try: () => JSON.parse(output),
    catch: (cause) =>
      new GitHubError({
        command,
        exitCode: 0,
        stderr: String(cause),
        status: null,
        retryable: false,
      }),
  });

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

      const stream: GitHubService["stream"] = (args, options) =>
        gh
          .stream(args, { ...options, ...(env && { env }) })
          .pipe(
            Stream.mapError((error) =>
              fromGhError(`gh ${args.join(" ")}`, error),
            ),
          );

      const run = Effect.fn("GitHub.run")(
        function* (args: readonly string[], options?: GitHubRunOptions) {
          // Keep full stderr for status and retry classification, beyond the SDK error tail.
          let stderr = "";

          return yield* gh
            .stream(args, {
              ...(env && { env }),
              ...(options?.timeout !== undefined && {
                timeout: options.timeout,
              }),
            })
            .pipe(
              Stream.tap((chunk) =>
                Effect.sync(() => {
                  if (GhChunk.guards.Stderr(chunk)) stderr += chunk.text;
                }),
              ),
              Stream.runFold(
                () => "",
                (output, chunk) =>
                  GhChunk.guards.Stdout(chunk) ? output + chunk.text : output,
              ),
              Effect.mapError((error) =>
                fromGhError(`gh ${args.join(" ")}`, error, stderr),
              ),
            );
        },
        (effect, _args, options) =>
          options?.readOnly
            ? effect.pipe(
                Effect.retry({
                  schedule: Schedule.exponential("1 second"),
                  times: retries,
                  while: (error) => error.retryable,
                }),
              )
            : effect,
      );

      const waitForNetwork = Effect.fn("GitHub.waitForNetwork")(function* () {
        yield* run(["api", "rate_limit", "--method", "GET"], {
          timeout: "2 seconds",
        }).pipe(
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

      const json = Effect.fn("GitHub.json")(function* (
        args: readonly string[],
        options?: GitHubRunOptions,
      ) {
        return yield* decodeJson(
          `gh ${args.join(" ")}`,
          yield* run(args, options),
        );
      });

      const api = Effect.fn("GitHub.api")(function* (
        endpoint: string,
        options?: GitHubApiOptions,
      ) {
        if (options?.method)
          return (yield* Api.raw({
            endpoint,
            method: options.method,
            ...(options.body !== undefined && { body: options.body }),
            ...(env && { options: { env } }),
          }).pipe(
            Effect.provideService(Gh, gh),
            Effect.mapError((error) =>
              fromGhError(`gh api ${endpoint}`, error),
            ),
          )).stdout.trim();

        return (yield* run(
          [
            "api",
            endpoint,
            "--method",
            "GET",
            ...(options?.jq ? ["--jq", options.jq] : []),
          ],
          { readOnly: true },
        )).trim();
      });

      const apiJson = Effect.fn("GitHub.apiJson")(function* (
        endpoint: string,
        options?: GitHubApiOptions,
      ) {
        return yield* decodeJson(
          `gh api ${endpoint}`,
          yield* api(endpoint, options),
        );
      });

      const isAvailable = Effect.fn("GitHub.isAvailable")(function* () {
        return yield* gh.execute(["--version"]).pipe(
          Effect.as(true),
          Effect.catchTag("GhCommandError", () => Effect.succeed(false)),
          Effect.mapError((error) => fromGhError("gh --version", error)),
        );
      });

      return GitHub.of({
        run,
        stream,
        json,
        api,
        apiJson,
        isAvailable,
        waitForNetwork,
      });
    }),
  );
}
