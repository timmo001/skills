import { Effect, Schema } from "effect";
import { CommandExecutor } from "../services/CommandExecutor.js";

// OpenCode 2.0.3: session.create and Session.Info use this ordered ruleset.
export const SessionPermissionRule = Schema.Struct({
  action: Schema.NonEmptyString,
  resource: Schema.NonEmptyString,
  effect: Schema.Literals(["allow", "deny", "ask"]),
});

const Rules = Schema.Array(SessionPermissionRule);

export const SkillUpdatesPermissions = Rules.check(
  Schema.isMinLength(1),
  Schema.makeFilter((rules) => rules.every((rule) => rule.effect !== "ask")),
);

export class SkillUpdatesPermissionsError extends Schema.TaggedError<SkillUpdatesPermissionsError>()(
  "SkillUpdatesPermissionsError",
  { message: Schema.String },
) {}

const Agents = Schema.Array(
  Schema.Struct({ id: Schema.String, permissions: Rules }),
);

const Session = Schema.Struct({
  data: Schema.Struct({
    id: Schema.String.check(Schema.isPattern(/^ses_[a-zA-Z0-9]+$/)),
    permissions: Rules,
    location: Schema.Struct({ directory: Schema.String }),
  }),
});

export const skillUpdatesSessionPermissions = (
  job: typeof Rules.Type,
  agent: typeof Rules.Type,
): typeof Rules.Type => [
  { action: "*", resource: "*", effect: "deny" },
  ...job,
  // Session rules override agent rules. Reapply explicit denials last.
  ...agent.filter((rule) => rule.effect === "deny"),
];

export const createSkillUpdatesSession = Effect.fn(
  "UpdatesAgent.createSession",
)(function* (config: {
  readonly opencodeCommand: string;
  readonly opencodeArgs?: readonly string[];
  readonly opencodeAgent: string;
  readonly opencodePermissions: typeof Rules.Type;
  readonly repositories: readonly string[];
}) {
  const executor = yield* CommandExecutor;
  const cwd = config.repositories[0];

  if (!cwd)
    return yield* new SkillUpdatesPermissionsError({
      message: "A session location is required",
    });

  const invoke = (args: readonly string[]) =>
    executor.run(
      config.opencodeCommand,
      [...(config.opencodeArgs ?? []), ...args],
      {
        cwd,
      },
    );

  // debug agents resolves global, project and agent policy without prompting.
  const agents = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(Agents),
  )(yield* invoke(["debug", "agents"]));

  const agent = agents.find(({ id }) => id === config.opencodeAgent);

  if (!agent)
    return yield* new SkillUpdatesPermissionsError({
      message: `Cannot resolve permissions for agent ${config.opencodeAgent}`,
    });

  const permissions = skillUpdatesSessionPermissions(
    config.opencodePermissions,
    agent.permissions,
  );

  const created = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(Session),
  )(
    yield* invoke([
      "api",
      "--standalone",
      "post",
      "/api/session",
      "--data",
      JSON.stringify({
        title: "Scheduled skill updates",
        agent: config.opencodeAgent,
        location: { directory: cwd },
        permissions,
      }),
    ]),
  );

  // A second standalone process must see the same durable policy before run.
  const stored = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(Session),
  )(
    yield* invoke([
      "api",
      "--standalone",
      "get",
      `/api/session/${created.data.id}`,
    ]),
  );

  if (
    stored.data.id !== created.data.id ||
    stored.data.location.directory !== cwd ||
    JSON.stringify(created.data.permissions) !== JSON.stringify(permissions) ||
    JSON.stringify(stored.data.permissions) !== JSON.stringify(permissions)
  )
    return yield* new SkillUpdatesPermissionsError({
      message:
        "OpenCode did not retain the requested session location and permissions",
    });

  return stored.data.id;
});
