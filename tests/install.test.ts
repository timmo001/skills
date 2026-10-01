import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Stream } from "effect";
import { install, MANIFEST_FILE } from "../src/commands/Install.js";
import { CommandExecutor } from "../src/services/CommandExecutor.js";

const sha = (character: string) => character.repeat(40);

const external = (name: string) => ({
  origin: `https://github.com/org/repo/tree/main/${name}`,
  upstreamSha: sha("a"),
  license: "MIT",
  localEdits: [],
  distribution: "external",
});

const fetchLayer = (fetched: string[]) =>
  Layer.effect(
    CommandExecutor,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      return CommandExecutor.of({
        capture: () => Effect.succeed({ stdout: "", stderr: "", exitCode: 0 }),
        run: (command, args, options) =>
          Effect.gen(function* () {
            const sourceName = args[args.indexOf("--skill") + 1];

            if (command !== "mise") return "";

            if (!options?.cwd || !sourceName)
              return yield* Effect.die("invalid install fixture");
            fetched.push(sourceName);

            const directory = path.join(
              options.cwd,
              ".agents",
              "skills",
              sourceName,
            );

            yield* fs.makeDirectory(directory, { recursive: true });
            yield* fs.writeFileString(
              path.join(directory, "SKILL.md"),
              `---\nname: ${sourceName}\ndescription: Example\n---\nBody\n`,
            );

            return "";
          }).pipe(Effect.orDie),
        exitCode: () => Effect.succeed(0),
        inherit: () => Effect.succeed(0),
        stream: () => Stream.empty,
      });
    }),
  );

describe("external skill install", () => {
  it.effect(
    "installs pinned copies, keeps linked skills and prunes removed imports",
    () => {
      const fetched: string[] = [];

      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "skill-install-root-",
        });

        const target = yield* fs.makeTempDirectoryScoped({
          prefix: "skill-install-target-",
        });

        const writeImports = (names: readonly string[]) =>
          fs.writeFileString(
            path.join(root, "imports.json"),
            JSON.stringify({
              version: 1,
              imports: Object.fromEntries(
                names.map((name) => [name, external(name)]),
              ),
            }),
          );

        yield* writeImports(["fresh", "linked", "stale"]);

        const local = path.join(root, "local-linked");
        yield* fs.makeDirectory(local);
        yield* fs.writeFileString(path.join(local, "SKILL.md"), "local\n");
        yield* fs.makeDirectory(path.join(target, "linked"));
        yield* fs.symlink(
          path.join(local, "SKILL.md"),
          path.join(target, "linked", "SKILL.md"),
        );
        yield* fs.makeDirectory(path.join(target, "stale"));
        yield* fs.writeFileString(
          path.join(target, "stale", "SKILL.md"),
          "old\n",
        );

        yield* install(root, target);
        expect(fetched.sort()).toEqual(["fresh", "stale"]);
        expect(
          yield* fs.readFileString(path.join(target, "fresh", "SKILL.md")),
        ).toContain(`# upstream-sha: ${sha("a")}`);
        expect(
          yield* fs.readFileString(path.join(target, "stale", "SKILL.md")),
        ).toContain("Body");
        expect(
          yield* fs.readFileString(path.join(target, "linked", "SKILL.md")),
        ).toBe("local\n");

        fetched.length = 0;
        yield* install(root, target);
        expect(fetched).toEqual([]);

        yield* writeImports(["linked"]);
        yield* install(root, target);
        expect(yield* fs.exists(path.join(target, "fresh"))).toBe(false);
        expect(yield* fs.exists(path.join(target, "stale"))).toBe(false);
        expect(yield* fs.exists(path.join(target, "linked", "SKILL.md"))).toBe(
          true,
        );
        expect(
          JSON.parse(
            yield* fs.readFileString(path.join(target, MANIFEST_FILE)),
          ),
        ).toEqual({});
      }).pipe(
        Effect.scoped,
        Effect.provide(fetchLayer(fetched)),
        Effect.provide(NodeServices.layer),
      );
    },
  );
});
