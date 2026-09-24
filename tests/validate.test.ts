import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path, Predicate } from "effect";
import { validate } from "../src/commands/Validate.js";

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

      if (Predicate.isTagged(failure, "ValidationError"))
        expect(failure.failures).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/^skills\.sh\.json:/),
            expect.stringMatching(/^imports\.json:/),
          ]),
        );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
