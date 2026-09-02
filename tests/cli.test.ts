import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { CommandExecutor } from "../src/services/CommandExecutor.js";

const layer = Layer.merge(
  NodeServices.layer,
  CommandExecutor.layer.pipe(Layer.provide(NodeServices.layer)),
);

describe("CLI specification", () => {
  for (const shell of ["bash", "fish", "zsh"] as const) {
    it.effect(
      `generates ${shell} completions from the nested command tree`,
      () =>
        Effect.gen(function* () {
          const executor = yield* CommandExecutor;
          const output = yield* executor.run(
            "./dist/skill-maintenance",
            ["--completions", shell],
            { cwd: process.cwd() },
          );
          expect(output).toContain("updates-agent");
          expect(output).toContain("github");
          expect(output).toContain("device");
          expect(output).toContain("skills-dir");
          expect(output).toContain("run-id");
          expect(output).toContain("metadata-only");
          expect(output).toContain("no-commit");
          expect(output).not.toContain("no-no-commit");
        }).pipe(Effect.provide(layer)),
    );
  }
});
