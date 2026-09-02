#!/usr/bin/env bun
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { CliConfig, CliError, Command } from "effect/unstable/cli";
import { skillMaintenanceCommand } from "./cli/spec.js";
import { CommandExecutor } from "./services/CommandExecutor.js";
import { GitHub } from "./services/GitHub.js";

const commandExecutorLayer = CommandExecutor.layer.pipe(
  Layer.provide(NodeServices.layer),
);
const githubLayer = GitHub.layer.pipe(Layer.provide(commandExecutorLayer));
const applicationLayer = Layer.mergeAll(
  NodeServices.layer,
  commandExecutorLayer,
  githubLayer,
  CliConfig.layer(),
);

const program = Command.runWith(skillMaintenanceCommand, { version: "1.0.0" })(
  process.argv.slice(2),
).pipe(
  Effect.provide(applicationLayer),
  Effect.catch((error) =>
    Effect.sync(() => {
      if (!CliError.isCliError(error)) {
        console.error(error instanceof Error ? error.message : String(error));
      }
      process.exitCode = 1;
    }),
  ),
);

NodeRuntime.runMain(program, { disableErrorReporting: true });
