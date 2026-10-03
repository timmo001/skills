#!/usr/bin/env bun
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { layer as ghLayer } from "@timmo001/effect-gh";
import { Effect, Layer } from "effect";
import { CliConfig, CliError, Command } from "effect/cli";
import { skillMaintenanceCommand } from "./cli/spec.js";
import {
  SKILL_UPDATES_DEFERRED_EXIT_CODE,
  SkillUpdatesDeferredError,
} from "./commands/UpdatesAgent.js";
import { CommandExecutor } from "./services/CommandExecutor.js";
import {
  GitHub,
  GitHubError,
  NetworkUnavailableError,
} from "./services/GitHub.js";
import { SkillsCli } from "./services/SkillsCli.js";

const commandExecutorLayer = CommandExecutor.layer.pipe(
  Layer.provide(NodeServices.layer),
);

const githubLayer = GitHub.layer.pipe(
  Layer.provide(ghLayer()),
  Layer.provide(NodeServices.layer),
);

const skillsCliLayer = SkillsCli.layer.pipe(
  Layer.provide(commandExecutorLayer),
  Layer.provide(NodeServices.layer),
);

const applicationLayer = Layer.mergeAll(
  NodeServices.layer,
  commandExecutorLayer,
  githubLayer,
  skillsCliLayer,
  CliConfig.layer(),
);

const program = Command.runWith(skillMaintenanceCommand, { version: "1.0.0" })(
  process.argv.slice(2),
).pipe(
  Effect.provide(applicationLayer),
  Effect.catch((error) =>
    Effect.sync(() => {
      if (error instanceof NetworkUnavailableError) {
        console.warn(error.message);
      } else if (error instanceof GitHubError) {
        console.error(
          `${error.command} failed with exit code ${error.exitCode}: ${error.stderr}`,
        );
      } else if (!CliError.isCliError(error)) {
        console.error(
          error instanceof Error ? error.message || error.name : String(error),
        );
      }

      process.exitCode =
        error instanceof SkillUpdatesDeferredError ||
        error instanceof NetworkUnavailableError
          ? SKILL_UPDATES_DEFERRED_EXIT_CODE
          : 1;
    }),
  ),
);

NodeRuntime.runMain(program, { disableErrorReporting: true });
