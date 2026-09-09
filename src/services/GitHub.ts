import {
  Gh,
  type GhChunk,
  type GhError,
  type GhOptions,
} from "@timmo001/effect-gh";
import {
  Config,
  Context,
  Effect,
  Layer,
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
}

export interface GitHubRunOptions {
  /** Opt in only for known-idempotent reads. Mutations are never retried by default. */
  readonly readOnly?: boolean;
}

export interface GitHubService {
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
    "network is unreachable",
    "temporarily unavailable",
    "timeout",
    "tls handshake",
  ].some((pattern) => lower.includes(pattern));
};

const fromGhError = (command: string, error: GhError, stderr?: string) => {
  const detail =
    error._tag === "GhCommandError"
      ? (stderr ?? error.stderr).trim()
      : error._tag === "GhTimeoutError"
        ? `Command timed out after ${error.timeoutMs}ms`
        : String(error.cause);
  return new GitHubError({
    command,
    exitCode:
      error._tag === "GhCommandError"
        ? error.exitCode
        : error._tag === "GhDecodeError"
          ? 0
          : -1,
    stderr: detail,
    status: statusFromStderr(detail),
    retryable:
      error._tag === "GhTimeoutError" ||
      (error._tag !== "GhDecodeError" && isRetryable(detail)),
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
      const token = yield* Config.option(Config.redacted("GH_TOKEN"));
      const fallbackToken = yield* Config.option(
        Config.redacted("GITHUB_TOKEN"),
      );
      const retries = yield* Config.int(
        "SKILL_MAINTENANCE_GITHUB_RETRIES",
      ).pipe(
        Config.withDefault(2),
        Config.map((value) => Math.max(0, value)),
      );
      const env = token.pipe((value) =>
        value._tag === "Some"
          ? { GH_TOKEN: Redacted.value(value.value) }
          : fallbackToken._tag === "Some"
            ? { GH_TOKEN: Redacted.value(fallbackToken.value) }
            : undefined,
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
        function* (args: readonly string[], _options?: GitHubRunOptions) {
          // Keep full stderr for status and retry classification, beyond the SDK error tail.
          let stderr = "";
          return yield* gh.stream(args, env ? { env } : {}).pipe(
            Stream.tap((chunk) =>
              Effect.sync(() => {
                if (chunk._tag === "Stderr") stderr += chunk.text;
              }),
            ),
            Stream.runFold(
              () => "",
              (output, chunk) =>
                chunk._tag === "Stdout" ? output + chunk.text : output,
            ),
            Effect.mapError((error) =>
              fromGhError(`gh ${args.join(" ")}`, error, stderr),
            ),
          );
        },
        (effect, _args, options) =>
          effect.pipe(
            Effect.retry({
              schedule: Schedule.exponential("1 second"),
              times: options?.readOnly ? retries : 0,
              while: (error) => error.retryable,
            }),
          ),
      );
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
      return GitHub.of({ run, stream, json, api, apiJson, isAvailable });
    }),
  );
}
