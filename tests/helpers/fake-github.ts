import {
  Gh,
  GhCommandError,
  GhDecodeError,
  type GhChunk,
  type GhOptions,
} from "@timmo001/effect-gh";
import { Effect, Predicate, Schema, Stream } from "effect";
import {
  GitHub,
  GitHubError,
  fromGhError,
  type GitHubService,
} from "../../src/services/GitHub.js";

/** A `gh api` request as the fake sees it. */
export interface FakeApiRequest {
  readonly method: string;
  readonly body?: Schema.Json;
}

/** Handlers for the gh commands the real effect-gh operations send. */
export interface FakeGitHubHandlers {
  /** Non-API commands; returns stdout. */
  readonly run?: (
    args: readonly string[],
  ) => Effect.Effect<string, GitHubError>;
  /** `gh api` requests read as text or with no body (`Api.text`, `Api.empty`). */
  readonly api?: (
    endpoint: string,
    request: FakeApiRequest,
  ) => Effect.Effect<string, GitHubError>;
  /** `gh api` requests decoded as JSON (`Api.json`); falls back to `api`. */
  readonly apiJson?: (
    endpoint: string,
    request: FakeApiRequest,
  ) => Effect.Effect<Schema.Json, GitHubError>;
  /** Streaming commands such as `gh run watch`. */
  readonly stream?: (
    args: readonly string[],
    options: GhOptions | undefined,
  ) => Stream.Stream<GhChunk, GitHubError>;
  readonly waitForNetwork?: GitHubService["waitForNetwork"];
  readonly isAvailable?: GitHubService["isAvailable"];
}

const toGhError = (error: GitHubError) =>
  new GhCommandError({
    executable: "gh",
    exitCode: error.exitCode,
    stdout: "",
    stdoutTruncated: false,
    stderr: error.stderr,
    stderrTruncated: false,
  });

const unexpected = (kind: string) => (args: readonly string[] | string) =>
  Effect.die(`Unexpected ${kind}: ${String(args)}`);

/**
 * A GitHub service that runs the real typed effect-gh operations against
 * handlers, so tests still see the exact argv each operation sends.
 */
export function fakeGitHub(handlers: FakeGitHubHandlers = {}): GitHubService {
  const respond = (
    args: readonly string[],
    options: GhOptions | undefined,
    json: boolean,
  ): Effect.Effect<string, GitHubError> => {
    if (args[0] !== "api") return (handlers.run ?? unexpected("gh"))(args);
    const endpoint = args.at(-1) ?? "";
    const method = args[args.indexOf("--method") + 1] ?? "GET";

    const body = Predicate.isString(options?.stdin)
      ? Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Json))(
          options.stdin,
        )
      : undefined;

    const request = { method, ...(body !== undefined && { body }) };

    if (handlers.apiJson && (json || !handlers.api))
      return handlers
        .apiJson(endpoint, request)
        .pipe(Effect.map((value) => JSON.stringify(value)));

    return (handlers.api ?? unexpected("gh api"))(endpoint, request);
  };

  const gh = Gh.of({
    execute: (args, options) =>
      respond(args, options, false).pipe(
        Effect.map((stdout) => ({ stdout, stderr: "", exitCode: 0 })),
        Effect.mapError(toGhError),
      ),
    json: (args, schema, options) =>
      respond(args, options, true).pipe(
        Effect.mapError(toGhError),
        Effect.flatMap((stdout) =>
          Schema.decodeEffect(Schema.fromJsonString(schema))(stdout).pipe(
            Effect.mapError((cause) => new GhDecodeError({ cause })),
          ),
        ),
      ),
    stream: (args, options) =>
      handlers.stream
        ? handlers.stream(args, options).pipe(Stream.mapError(toGhError))
        : Stream.die(`Unexpected gh stream: ${args.join(" ")}`),
    interactive: (args) =>
      Effect.die(`Unexpected interactive gh: ${args.join(" ")}`),
  });

  const write: GitHubService["write"] = (label, operation) =>
    operation.pipe(
      Effect.provideService(Gh, gh),
      Effect.mapError((error) => fromGhError(label, error)),
    );

  return GitHub.of({
    waitForNetwork: handlers.waitForNetwork ?? (() => Effect.void),
    isAvailable: handlers.isAvailable ?? (() => Effect.succeed(true)),
    read: write,
    write,
    stream: (label, operation) =>
      operation.pipe(
        Stream.provideService(Gh, gh),
        Stream.mapError((error) => fromGhError(label, error)),
      ),
  });
}
