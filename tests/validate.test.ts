import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";
import { validate } from "../src/commands/Validate.js";

it.effect("validation accumulates repository failures", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({
      prefix: "skill-validate-test-",
    });
    yield* fs.makeDirectory(path.join(root, "wrong"));
    yield* fs.writeFileString(
      path.join(root, "wrong", "SKILL.md"),
      "---\nname: other\nunknown: true\n---\n[broken](missing.md)\n",
    );
    yield* fs.writeFileString(
      path.join(root, "skills.sh.json"),
      '{"groupings":[]}',
    );
    yield* fs.writeFileString(path.join(root, "PORTABILITY.md"), "");
    yield* fs.writeFileString(
      path.join(root, "imports.json"),
      '{"version":1,"imports":{}}',
    );
    const exit = yield* Effect.exit(validate(root));
    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure")
      expect(String(exit.cause)).toContain("ValidationError");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect(
  "accumulates malformed catalogue and imports JSON as typed failures",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "skill-validate-json-test-",
      });
      yield* fs.writeFileString(path.join(root, "skills.sh.json"), "{");
      yield* fs.writeFileString(path.join(root, "imports.json"), "[");
      yield* fs.writeFileString(path.join(root, "PORTABILITY.md"), "");
      const failure = yield* Effect.flip(validate(root));
      if (failure._tag === "ValidationError")
        expect(failure.failures).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/^skills\.sh\.json:/),
            expect.stringMatching(/^imports\.json:/),
          ]),
        );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
