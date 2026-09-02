import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Stream } from "effect";
import { importSkill } from "../src/commands/Import.js";
import {
  check,
  CheckError,
  skillReimportCommand,
} from "../src/commands/Check.js";
import { getImport, writeReviewedSha } from "../src/imports/metadata.js";
import {
  applyClean,
  directoriesMatch,
  directoryChanges,
  materialiseMetadata,
} from "../src/imports/snapshot.js";
import { CommandExecutor } from "../src/services/CommandExecutor.js";

const metadata = {
  origin: "https://github.com/org/repo/tree/main/example",
  upstreamSha: "a".repeat(40),
  license: "MIT",
  localEdits: [],
  distribution: "wholesale" as const,
};

interface FixtureImportMetadata {
  origin: string;
  upstreamSha: string;
  license: string;
  localEdits: readonly string[];
  distribution?: string;
}

const snapshotExecutorLayer = (content: string) =>
  Layer.effect(
    CommandExecutor,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      return CommandExecutor.of({
        capture: () => Effect.succeed({ stdout: "", stderr: "", exitCode: 0 }),
        run: (command, args, options) =>
          Effect.gen(function* () {
            if (command === "git" && args.includes("--format=%H"))
              return "b".repeat(40);
            if (command === "mise") {
              const sourceName = args[args.indexOf("--skill") + 1];
              if (!options?.cwd || !sourceName)
                return yield* Effect.die("invalid skills add fixture");
              const generated = path.join(
                options.cwd,
                ".agents",
                "skills",
                sourceName,
              );
              yield* fs.makeDirectory(generated, { recursive: true });
              yield* fs.writeFileString(
                path.join(generated, "SKILL.md"),
                content,
              );
            }
            return "";
          }).pipe(Effect.orDie),
        exitCode: () => Effect.succeed(0),
        inherit: () => Effect.succeed(0),
        stream: () => Stream.empty,
      });
    }),
  );

const importedMetadata = (
  localEdits: readonly string[],
  distribution?: string,
) => {
  const example: FixtureImportMetadata = {
    origin: metadata.origin,
    upstreamSha: metadata.upstreamSha,
    license: metadata.license,
    localEdits,
  };
  if (distribution) example.distribution = distribution;
  return JSON.stringify({
    version: 1,
    imports: { example },
  });
};

describe("import snapshots", () => {
  it.effect("materialises provenance without changing the body", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "skill-import-test-",
      });
      const file = path.join(root, "SKILL.md");
      yield* fs.writeFileString(
        file,
        "---\nname: upstream\ndescription: Example\n---\n\n# Body\n",
      );
      yield* materialiseMetadata(file, "example", metadata);
      const content = yield* fs.readFileString(file);
      expect(content).toContain("name: example");
      expect(content).toContain("license: MIT");
      expect(content).toContain(`# upstream-sha: ${"a".repeat(40)}`);
      expect(content.endsWith("\n# Body\n")).toBe(true);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("compares every file while ignoring only provenance comments", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "skill-compare-test-",
      });
      const local = path.join(root, "local");
      const upstream = path.join(root, "upstream");
      for (const dir of [local, upstream]) {
        yield* fs.makeDirectory(path.join(dir, "references"), {
          recursive: true,
        });
        yield* fs.writeFileString(
          path.join(dir, "references", "guide.md"),
          "same\n",
        );
      }
      yield* fs.writeFileString(
        path.join(local, "SKILL.md"),
        `---\nname: example\ndescription: Example\n# origin: old\n# upstream-sha: ${"a".repeat(40)}\n# local-edits:\n#   - adapted\n---\nBody\n#   - retained body comment\n`,
      );
      yield* fs.writeFileString(
        path.join(upstream, "SKILL.md"),
        `---\nname: example\ndescription: Example\n# origin: new\n# upstream-sha: ${"b".repeat(40)}\n---\nBody\n#   - retained body comment\n`,
      );
      expect(yield* directoriesMatch(local, upstream)).toBe(true);
      yield* fs.writeFileString(
        path.join(upstream, "references", "guide.md"),
        "changed\n",
      );
      expect(yield* directoriesMatch(local, upstream)).toBe(false);
      yield* fs.writeFileString(path.join(local, "local-only.md"), "local\n");
      yield* fs.writeFileString(path.join(upstream, "new.md"), "upstream\n");
      expect(yield* directoryChanges(local, upstream)).toEqual([
        { path: "local-only.md", status: "removed-upstream" },
        { path: "new.md", status: "added-upstream" },
        { path: "references/guide.md", status: "modified" },
      ]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("applies wholesale and official-source snapshots", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "skill-apply-test-",
      });
      const snapshot = path.join(root, "snapshot");
      yield* fs.makeDirectory(path.join(snapshot, "references"), {
        recursive: true,
      });
      yield* fs.writeFileString(path.join(snapshot, "SKILL.md"), "upstream\n");
      yield* fs.writeFileString(
        path.join(snapshot, "references", "added.md"),
        "added\n",
      );
      yield* fs.makeDirectory(path.join(root, "example"));
      yield* fs.writeFileString(
        path.join(root, "example", "removed.md"),
        "old\n",
      );
      yield* fs.writeFileString(
        path.join(root, "imports.json"),
        `{\n  "version": 1,\n  "imports": {\n    "example": { "origin": "${metadata.origin}", "upstreamSha": "${"b".repeat(40)}", "localEdits": [], "distribution": "wholesale" }\n  }\n}\n`,
      );
      yield* applyClean(root, "example", metadata, snapshot, "a".repeat(40));
      expect(
        yield* fs.readFileString(path.join(root, "example", "SKILL.md")),
      ).toBe("upstream\n");
      expect(yield* fs.exists(path.join(root, "example", "removed.md"))).toBe(
        false,
      );
      expect(
        yield* fs.readFileString(
          path.join(root, "example", "references", "added.md"),
        ),
      ).toBe("added\n");
      const official = {
        ...metadata,
        distribution: "official-source" as const,
      };
      yield* applyClean(root, "example", official, snapshot, "a".repeat(40));
      expect(
        yield* fs.exists(
          path.join(root, "upstream", "example", "UPSTREAM_SKILL.md"),
        ),
      ).toBe(true);
      expect(
        yield* fs.exists(path.join(root, "upstream", "example", "SKILL.md")),
      ).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses to apply adapted snapshots", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        applyClean(
          "/tmp",
          "example",
          {
            origin: metadata.origin,
            upstreamSha: metadata.upstreamSha,
            license: metadata.license,
            localEdits: ["adapted"],
          },
          "/tmp/snapshot",
          "a".repeat(40),
        ),
      );
      expect(exit._tag).toBe("Failure");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("updates only one reviewed SHA without reformatting metadata", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "skill-sha-test-",
      });
      const before = [
        "{",
        '  "version": 1,',
        '  "imports": {',
        `    "example": { "origin": "${metadata.origin}", "upstreamSha": "${"a".repeat(40)}", "license": "MIT", "localEdits": [], "distribution": "wholesale" },`,
        `    "other": { "origin": "https://github.com/org/repo/tree/main/other", "upstreamSha": "${"c".repeat(40)}", "license": "MIT", "localEdits": [], "distribution": "wholesale" }`,
        "  }",
        "}",
        "",
      ].join("\n");
      yield* fs.writeFileString(path.join(root, "imports.json"), before);
      yield* writeReviewedSha(root, "example", "b".repeat(40));
      expect(yield* fs.readFileString(path.join(root, "imports.json"))).toBe(
        before.replace("a".repeat(40), "b".repeat(40)),
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "accepts clean distributions and rejects undeclared adaptations",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "skill-metadata-test-",
        });
        const file = path.join(root, "imports.json");
        yield* fs.writeFileString(
          file,
          importedMetadata([], "official-source"),
        );
        expect((yield* getImport(root, "example")).distribution).toBe(
          "official-source",
        );
        yield* fs.writeFileString(file, importedMetadata([], "wholesale"));
        expect((yield* getImport(root, "example")).distribution).toBe(
          "wholesale",
        );
        yield* fs.writeFileString(file, importedMetadata([]));
        expect(
          (yield* Effect.flip(getImport(root, "example"))).message,
        ).toContain("must declare local edits");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("materialises metadata without fetching a snapshot", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "skill-metadata-only-test-",
      });
      yield* fs.writeFileString(
        path.join(root, "imports.json"),
        importedMetadata([], "wholesale"),
      );
      yield* fs.makeDirectory(path.join(root, "example"));
      yield* fs.writeFileString(
        path.join(root, "example", "SKILL.md"),
        "---\nname: example\ndescription: Example\n---\nBody\n",
      );
      yield* importSkill(root, "example", {
        apply: false,
        metadataOnly: true,
        reviewedSha: "b".repeat(40),
      });
      expect(
        yield* fs.readFileString(path.join(root, "example", "SKILL.md")),
      ).toContain(`# upstream-sha: ${"b".repeat(40)}`);
    }).pipe(
      Effect.scoped,
      Effect.provide(snapshotExecutorLayer("")),
      Effect.provide(NodeServices.layer),
    ),
  );

  it.effect("rejects an adapted import that exactly matches its source", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "skill-exact-match-test-",
      });
      yield* fs.writeFileString(
        path.join(root, "imports.json"),
        importedMetadata(["adapted"]),
      );
      yield* fs.makeDirectory(path.join(root, "example"));
      yield* fs.writeFileString(
        path.join(root, "example", "SKILL.md"),
        `---\nname: example\ndescription: Example\nlicense: MIT\n# origin: ${metadata.origin}\n# upstream-sha: ${metadata.upstreamSha}\n# local-edits:\n#   - adapted\n---\nBody\n`,
      );
      const result = yield* Effect.exit(
        importSkill(root, "example", {
          apply: false,
          metadataOnly: false,
        }),
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure")
        expect(String(result.cause)).toContain("exactly matches its source");
    }).pipe(
      Effect.scoped,
      Effect.provide(
        snapshotExecutorLayer(
          "---\nname: upstream\ndescription: Example\n---\nBody\n",
        ),
      ),
      Effect.provide(NodeServices.layer),
    ),
  );

  it.effect("renders the standard global reimport command", () =>
    Effect.sync(() => {
      expect(skillReimportCommand(metadata.origin)).toBe(
        `mise exec npm:skills -- skills add '${metadata.origin}' --global`,
      );
    }),
  );

  it.effect("fails check when an adapted import exactly matches upstream", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "skill-check-match-test-",
      });
      yield* fs.writeFileString(
        path.join(root, "imports.json"),
        importedMetadata(["adapted"]),
      );
      yield* fs.makeDirectory(path.join(root, "example"));
      yield* fs.writeFileString(
        path.join(root, "example", "SKILL.md"),
        `---\nname: example\ndescription: Example\nlicense: MIT\n# origin: ${metadata.origin}\n# upstream-sha: ${metadata.upstreamSha}\n# local-edits:\n#   - adapted\n---\nBody\n`,
      );
      const failure = yield* Effect.flip(
        check(root, {
          skill: "example",
          diffOrigin: false,
          openOpencode: false,
        }),
      );
      expect(failure).toBeInstanceOf(CheckError);
      expect(failure.message).toContain("exactly match upstream");
    }).pipe(
      Effect.scoped,
      Effect.provide(
        snapshotExecutorLayer(
          "---\nname: upstream\ndescription: Example\n---\nBody\n",
        ),
      ),
      Effect.provide(NodeServices.layer),
    ),
  );

  it.effect("fails check for an unknown skill selection", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "skill-check-unknown-test-",
      });
      yield* fs.writeFileString(
        path.join(root, "imports.json"),
        importedMetadata(["adapted"]),
      );
      const failure = yield* Effect.flip(
        check(root, {
          skill: "missing",
          diffOrigin: false,
          openOpencode: false,
        }),
      );
      expect(failure).toBeInstanceOf(CheckError);
      expect(failure.message).toBe("Imported skill not found: missing");
    }).pipe(
      Effect.scoped,
      Effect.provide(snapshotExecutorLayer("")),
      Effect.provide(NodeServices.layer),
    ),
  );

  it.effect("fails check for a non-adapted skill selection", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "skill-check-clean-test-",
      });
      yield* fs.writeFileString(
        path.join(root, "imports.json"),
        importedMetadata([], "wholesale"),
      );
      const failure = yield* Effect.flip(
        check(root, {
          skill: "example",
          diffOrigin: false,
          openOpencode: false,
        }),
      );
      expect(failure).toBeInstanceOf(CheckError);
      expect(failure.message).toBe("example: imported skill is not adapted");
    }).pipe(
      Effect.scoped,
      Effect.provide(snapshotExecutorLayer("")),
      Effect.provide(NodeServices.layer),
    ),
  );
});
