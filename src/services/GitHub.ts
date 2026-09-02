import {
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  Redacted,
  Schema,
} from "effect";
import { CommandExecutor } from "./CommandExecutor.js";

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

export interface GitHubService {
  readonly isAvailable: () => Effect.Effect<boolean, GitHubError>;
  readonly run: (args: readonly string[]) => Effect.Effect<string, GitHubError>;
  readonly json: (
    args: readonly string[],
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

const fromCommandError = (error: import("./CommandExecutor.js").CommandError) =>
  new GitHubError({
    command: error.command,
    exitCode: error.exitCode,
    stderr: error.stderr,
    status: statusFromStderr(error.stderr),
    retryable: isRetryable(error.stderr),
  });

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
      const executor = yield* CommandExecutor;
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
      const runAttempt = Effect.fn("GitHub.runAttempt")(function* (
        args: readonly string[],
        attempt: number,
      ): Effect.fn.Return<string, GitHubError> {
        const result = yield* Effect.result(executor.run("gh", args, { env }));
        if (result._tag === "Success") return result.success;
        const failure = fromCommandError(result.failure);
        if (!failure.retryable || attempt >= retries) return yield* failure;
        yield* Effect.sleep(Duration.seconds(2 ** attempt));
        return yield* runAttempt(args, attempt + 1);
      });
      const run = Effect.fn("GitHub.run")(function* (args: readonly string[]) {
        return yield* runAttempt(args, 0);
      });
      const json = Effect.fn("GitHub.json")(function* (
        args: readonly string[],
      ) {
        return yield* decodeJson(`gh ${args.join(" ")}`, yield* run(args));
      });
      const api = Effect.fn("GitHub.api")(function* (
        endpoint: string,
        options?: GitHubApiOptions,
      ) {
        return (yield* run([
          "api",
          endpoint,
          ...(options?.jq ? ["--jq", options.jq] : []),
        ])).trim();
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
        return yield* executor.exitCode("gh", ["--version"]).pipe(
          Effect.map((code) => code === 0),
          Effect.mapError(fromCommandError),
        );
      });
      return GitHub.of({ run, json, api, apiJson, isAvailable });
    }),
  );
}
