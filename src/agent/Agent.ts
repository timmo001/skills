/**
 * The Code Mode surface. `skill-maintenance agent tools --json` describes
 * each tool, and `skill-maintenance agent call <tool>` runs one with its input
 * as JSON on stdin, so the OpenCode plugin in `opencode-plugin/` only needs
 * the binary, and its tools always match it. Each call runs this binary's own
 * command in the skills checkout and returns what it printed.
 */
import { basename } from "node:path";
import { Duration, Effect, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

/** Why a Code Mode call failed. */
export class AgentError extends Schema.TaggedError<AgentError>()("AgentError", {
  message: Schema.String,
}) {}

const JsonObject = Schema.Record(Schema.String, Schema.Json);

/** One tool as the plugin registers it. */
export const ManifestTool = Schema.Struct({
  name: Schema.String,
  argv: Schema.Array(Schema.String),
  description: Schema.String,
  access: Schema.Literals(["read", "write"]),
  alwaysAsk: Schema.Boolean,
  pinned: Schema.Boolean,
  timeoutMillis: Schema.Int,
  json: Schema.Boolean,
  stdin: Schema.Boolean,
  input: JsonObject,
  resource: Schema.optionalKey(Schema.String),
});

/** Every tool, and whether there's anything to call them on. */
export const Manifest = Schema.Struct({
  available: Schema.Boolean,
  tools: Schema.Array(ManifestTool),
});

/**
 * How a tool reports: `report` returns the exit code and output, for checks
 * whose exit code is the result; `json` decodes the printed report; `text`
 * fails on a non-zero exit and returns the output.
 */
type Output = "report" | "json" | "text";

interface AgentTool {
  readonly name: string;
  readonly description: string;
  readonly access: "read" | "write";
  readonly timeout: Duration.Duration;
  readonly resource: string | undefined;
  readonly output: Output;
  readonly input: Schema.Json;
  readonly decode: (
    text: string,
  ) => Effect.Effect<
    { readonly args: ReadonlyArray<string>; readonly directory?: string },
    AgentError
  >;
}

const isJsonObject = Schema.is(JsonObject);

const decodeJson = Schema.decodeUnknownSync(Schema.Json);

const jsonSchemaOf = (schema: Schema.Top) => {
  const document = Schema.toJsonSchemaDocument(schema, {
    onExcessProperty: "error",
  });

  return decodeJson(
    Object.keys(document.definitions).length === 0
      ? document.schema
      : { ...document.schema, $defs: document.definitions },
  );
};

const directory = Schema.optionalKey(
  Schema.String.check(Schema.isStartingWith("/")).annotate({
    description: "The skills repository checkout, when the session isn't in it",
  }),
);

const skill = Schema.String.annotate({ description: "A skill name" });

const flag = (name: string, value: boolean | undefined) =>
  value === true ? [`--${name}`] : [];

const option = (name: string, value: string | undefined) =>
  value === undefined ? [] : [`--${name}`, value];

const tool = <I extends { readonly directory?: string }, IE>(definition: {
  readonly name: string;
  readonly description: string;
  readonly access: "read" | "write";
  readonly timeout?: Duration.Input;
  readonly resource?: string;
  readonly output: Output;
  readonly input: Schema.Codec<I, IE>;
  readonly args: (input: I) => ReadonlyArray<string>;
}): AgentTool => {
  const decode = Schema.decodeUnknownEffect(
    Schema.fromJsonString(Schema.toCodecJson(definition.input)),
  );

  return {
    name: definition.name,
    description: definition.description,
    access: definition.access,
    timeout: Duration.fromInputUnsafe(definition.timeout ?? "5 minutes"),
    resource: definition.resource,
    output: definition.output,
    input: jsonSchemaOf(definition.input),
    decode: (text) =>
      decode(text.trim() === "" ? "{}" : text, {
        onExcessProperty: "error",
        errors: "all",
      }).pipe(
        Effect.map((input) => ({
          args: definition.args(input),
          ...(input.directory !== undefined && { directory: input.directory }),
        })),
        Effect.mapError(
          (error) =>
            new AgentError({ message: `Invalid input: ${error.message}` }),
        ),
      ),
  };
};

/** Every Code Mode tool, in the order the catalogue lists them. */
export const agentTools: ReadonlyArray<AgentTool> = [
  tool({
    name: "validate",
    description:
      "Validate every skill's frontmatter and the repository metadata.",
    access: "read",
    output: "report",
    input: Schema.Struct({ directory }),
    args: () => ["validate"],
  }),
  tool({
    name: "catalogue_check",
    description:
      "Check SKILLS.md matches the catalogue generated from skill frontmatter.",
    access: "read",
    output: "report",
    input: Schema.Struct({ directory }),
    args: () => ["catalogue", "--check"],
  }),
  tool({
    name: "catalogue",
    description: "Regenerate SKILLS.md from skill frontmatter.",
    access: "write",
    output: "text",
    input: Schema.Struct({ directory }),
    args: () => ["catalogue"],
  }),
  tool({
    name: "check",
    description:
      "Review adapted imports against their origins, for every skill or one.",
    access: "read",
    output: "report",
    input: Schema.Struct({
      directory,
      skill: Schema.optionalKey(skill),
      diffOrigin: Schema.optionalKey(Schema.Boolean).annotate({
        description: "Include complete upstream diffs",
      }),
    }),
    args: (input) => [
      "check",
      ...option("skill", input.skill),
      ...flag("diff-origin", input.diffOrigin),
    ],
  }),
  tool({
    name: "updates",
    description:
      "Report tracked upstream skills with updates, as the versioned machine report.",
    access: "read",
    output: "json",
    input: Schema.Struct({ directory, skill: Schema.optionalKey(skill) }),
    args: (input) => ["updates", "--json", ...option("skill", input.skill)],
  }),
  tool({
    name: "updates_apply",
    description:
      "Apply clean upstream updates and SHA-only refreshes, optionally committing them.",
    access: "write",
    output: "text",
    resource: "skill",
    input: Schema.Struct({
      directory,
      skill: Schema.optionalKey(skill),
      commit: Schema.optionalKey(Schema.Boolean),
    }),
    // Without --commit=false the command commits, so only commit when asked.
    args: (input) => [
      "updates",
      "--update",
      "--skip-review",
      ...option("skill", input.skill),
      ...(input.commit === true ? [] : ["--commit=false"]),
    ],
  }),
  tool({
    name: "skill_reviews",
    description:
      "Report skills whose tools have a release newer than the one they were reviewed against.",
    access: "read",
    output: "json",
    input: Schema.Struct({ directory }),
    args: () => ["skill-reviews", "--json"],
  }),
  tool({
    name: "skill_reviews_mark",
    description:
      "Mark a skill reviewed at its tools' latest releases in skills.yml.",
    access: "write",
    output: "text",
    resource: "skill",
    input: Schema.Struct({ directory, skill }),
    args: (input) => ["skill-reviews", "--reviewed", input.skill],
  }),
  tool({
    name: "import",
    description:
      "Fetch an imported skill's upstream and compare it with the local copy, without changing anything.",
    access: "read",
    output: "report",
    input: Schema.Struct({ directory, name: skill }),
    args: (input) => ["import", input.name],
  }),
  tool({
    name: "import_apply",
    description:
      "Apply a clean upstream snapshot of an imported skill, optionally setting the reviewed upstream SHA.",
    access: "write",
    output: "text",
    resource: "name",
    input: Schema.Struct({
      directory,
      name: skill,
      reviewedSha: Schema.optionalKey(Schema.String),
    }),
    args: (input) => [
      "import",
      input.name,
      "--apply",
      ...option("reviewed-sha", input.reviewedSha),
    ],
  }),
  tool({
    name: "consumers_sync",
    description:
      "Sync project skill copies into the repositories listed in consumers.yml, committing and pushing, or only report changes with dryRun.",
    access: "write",
    output: "text",
    timeout: "15 minutes",
    resource: "repository",
    input: Schema.Struct({
      directory,
      repository: Schema.optionalKey(Schema.String).annotate({
        description: "Only this owner/name repository",
      }),
      dryRun: Schema.optionalKey(Schema.Boolean),
    }),
    args: (input) => [
      "consumers",
      ...option("repository", input.repository),
      ...flag("dry-run", input.dryRun),
    ],
  }),
];

/** The tool names `agent call` accepts. */
export const toolNames = agentTools.map(({ name }) => name);

/** The Code Mode manifest. The tools need only the binary, so it's always available. */
export const manifest = () => ({
  available: true,
  tools: agentTools.map((entry) => ({
    name: entry.name,
    argv: ["agent", "call", entry.name],
    description: entry.description,
    access: entry.access,
    alwaysAsk: false,
    pinned: false,
    timeoutMillis: Duration.toMillis(entry.timeout),
    json: true,
    stdin: true,
    input: isJsonObject(entry.input) ? entry.input : {},
    // JSON.stringify leaves it out when unset.
    resource: entry.resource,
  })),
});

const tail = (text: string) => text.trim().split("\n").slice(-40).join("\n");

// The compiled binary runs itself; from source, bun runs this script again.
const self = (): readonly [string, ReadonlyArray<string>] =>
  basename(process.execPath) === "bun" && process.argv[1] !== undefined
    ? [process.execPath, [process.argv[1]]]
    : [process.execPath, []];

/**
 * Run one tool: this binary's own command for it, in the input's directory or
 * the current one, returning its result as JSON.
 */
export const call = Effect.fn("agentCall")(function* (
  name: string,
  text: string,
) {
  const entry = agentTools.find((candidate) => candidate.name === name);

  if (entry === undefined) {
    return yield* new AgentError({ message: `No tool ${name}` });
  }

  const { args, directory: cwd } = yield* entry.decode(text);
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const [command, prefix] = self();

  const run = yield* Effect.scoped(
    Effect.gen(function* () {
      const proc = yield* spawner.spawn(
        ChildProcess.make(command, [...prefix, ...args], {
          ...(cwd !== undefined && { cwd }),
          env: { NO_COLOR: "1" },
          extendEnv: true,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        }),
      );

      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          proc.stdout.pipe(Stream.decodeText(), Stream.mkString),
          proc.stderr.pipe(Stream.decodeText(), Stream.mkString),
          proc.exitCode,
        ],
        { concurrency: "unbounded" },
      );

      return { stdout, stderr, exitCode: Number(exitCode) };
    }),
  ).pipe(
    Effect.timeoutOrElse({
      duration: entry.timeout,
      orElse: () =>
        Effect.fail(new AgentError({ message: `${name} timed out` })),
    }),
    Effect.mapError((error) =>
      error instanceof AgentError
        ? error
        : new AgentError({
            message: `Could not run skill-maintenance: ${String(error)}`,
          }),
    ),
  );

  const output = [run.stdout.trim(), run.stderr.trim()]
    .filter((part) => part !== "")
    .join("\n");

  if (entry.output === "report") {
    return JSON.stringify(
      { ok: run.exitCode === 0, exitCode: run.exitCode, output },
      null,
      2,
    );
  }

  if (run.exitCode !== 0) {
    return yield* new AgentError({
      message: `skill-maintenance ${args.join(" ")} exited ${run.exitCode}\n${tail(output)}`,
    });
  }

  if (entry.output === "json") {
    return run.stdout.trim();
  }

  return JSON.stringify({ ok: true, output }, null, 2);
});
