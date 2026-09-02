import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { resolveSkillsRoot } from "../src/cli/spec.js";
import { CommandExecutor } from "../src/services/CommandExecutor.js";

const layer = Layer.merge(
  NodeServices.layer,
  CommandExecutor.layer.pipe(Layer.provide(NodeServices.layer)),
);

describe("CLI specification", () => {
  it("finds the writable or pinned checkout outside the repository", () => {
    const writable = "/home/example/repos/skills";
    expect(
      resolveSkillsRoot("/tmp", "/home/example", (path) =>
        path.startsWith(writable),
      ),
    ).toBe(writable);
    const pinned = "/home/example/.config/dotfiles/agents/.agents/skills";
    expect(
      resolveSkillsRoot("/tmp", "/home/example", (path) =>
        path.startsWith(pinned),
      ),
    ).toBe(pinned);
  });

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

  it.effect("reports domain failures without compiled stack traces", () =>
    Effect.gen(function* () {
      const executor = yield* CommandExecutor;
      const result = yield* executor.capture(
        "./dist/skill-maintenance",
        ["check", "--skill", "definitely-not-a-skill"],
        { cwd: process.cwd() },
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        "Imported skill not found: definitely-not-a-skill",
      );
      expect(result.stderr).not.toContain("/$bunfs/");
      expect(result.stderr).not.toContain(" at ");
    }).pipe(Effect.provide(layer)),
  );

  it.effect("requires the device config during CLI parsing", () =>
    Effect.gen(function* () {
      const executor = yield* CommandExecutor;
      const result = yield* executor.capture(
        "./dist/skill-maintenance",
        ["updates-agent", "device"],
        { cwd: process.cwd() },
      );
      expect(result.exitCode).toBe(1);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "Missing required flag: --config",
      );
      expect(result.stderr).not.toContain("/$bunfs/");
    }).pipe(Effect.provide(layer)),
  );
});
