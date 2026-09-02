import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import {
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  Path,
  Stream,
} from "effect";
import {
  buildUpdateReport,
  renderUpdateMarkdown,
  updates,
} from "../src/commands/Updates.js";
import {
  DeletedOriginError,
  latestPathSha,
  originExists,
  parseOrigin,
  UpstreamDecodeError,
  UpstreamStatusError,
  UpstreamTransportError,
} from "../src/imports/upstream.js";
import {
  CommandError,
  CommandExecutor,
  type CommandExecutorService,
} from "../src/services/CommandExecutor.js";
import {
  GitHub,
  GitHubError,
  type GitHubService,
} from "../src/services/GitHub.js";

const sha = (character: string) => character.repeat(40);
const originUrl = "https://github.com/org/repo/tree/main/example";

interface FixtureImportMetadata {
  origin: string;
  upstreamSha: string;
  license: string;
  localEdits: readonly string[];
  distribution?: "wholesale";
}

const githubLayer = (overrides: Partial<GitHubService> = {}) =>
  Layer.succeed(GitHub, {
    isAvailable: () => Effect.succeed(true),
    run: () => Effect.succeed(""),
    json: () => Effect.succeed({}),
    api: () => Effect.succeed(""),
    apiJson: () => Effect.succeed([{ sha: sha("b") }]),
    ...overrides,
  });

const commandLayer = (overrides: Partial<CommandExecutorService> = {}) =>
  Layer.succeed(CommandExecutor, {
    capture: () => Effect.succeed({ stdout: "", stderr: "", exitCode: 0 }),
    run: () => Effect.succeed(""),
    exitCode: () => Effect.succeed(0),
    inherit: () => Effect.succeed(0),
    stream: () => Stream.empty,
    ...overrides,
  });

const snapshotLayer = (skillContent: string) =>
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
              return sha("b");
            if (command === "mise") {
              const sourceName = args[args.indexOf("--skill") + 1];
              if (!options?.cwd || !sourceName)
                return yield* Effect.die("invalid skills fixture");
              const directory = path.join(
                options.cwd,
                ".agents",
                "skills",
                sourceName,
              );
              yield* fs.makeDirectory(directory, { recursive: true });
              yield* fs.writeFileString(
                path.join(directory, "SKILL.md"),
                skillContent,
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

const makeRepository = Effect.fn("Test.makeRepository")(function* (
  body: string,
  localEdits: readonly string[] = [],
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({
    prefix: "skill-updates-test-",
  });
  const importMetadata: FixtureImportMetadata = {
    origin: originUrl,
    upstreamSha: sha("a"),
    license: "MIT",
    localEdits,
  };
  if (localEdits.length === 0) importMetadata.distribution = "wholesale";
  yield* fs.writeFileString(
    path.join(root, "imports.json"),
    JSON.stringify({
      version: 1,
      imports: {
        example: importMetadata,
      },
    }),
  );
  yield* fs.makeDirectory(path.join(root, "example"));
  yield* fs.writeFileString(
    path.join(root, "example", "SKILL.md"),
    `---\nname: example\ndescription: Example\nlicense: MIT\n# origin: ${originUrl}\n# upstream-sha: ${sha("a")}${localEdits.length > 0 ? `\n# local-edits:\n${localEdits.map((edit) => `#   - ${edit}`).join("\n")}` : ""}\n---\n${body}\n`,
  );
  return root;
});

describe("command and GitHub services", () => {
  it.effect("preserves subprocess exit code and stderr", () =>
    Effect.gen(function* () {
      const executor = yield* CommandExecutor;
      const failure = yield* Effect.flip(
        executor.run("sh", ["-c", "printf output; printf problem >&2; exit 7"]),
      );
      expect(failure).toMatchObject({
        command: "sh -c printf output; printf problem >&2; exit 7",
        exitCode: 7,
        stderr: "problem",
      });
    }).pipe(
      Effect.provide(
        CommandExecutor.layer.pipe(Layer.provide(NodeServices.layer)),
      ),
    ),
  );

  it.effect("fails streamed commands after emitting their output", () =>
    Effect.gen(function* () {
      const executor = yield* CommandExecutor;
      const lines: string[] = [];
      const failure = yield* Effect.flip(
        executor
          .stream("sh", ["-c", "printf 'first\\nproblem\\n'; exit 9"])
          .pipe(
            Stream.runForEach((line) =>
              Effect.sync(() => {
                lines.push(line);
              }),
            ),
          ),
      );
      expect(lines).toEqual(["first", "problem"]);
      expect(failure).toMatchObject({
        exitCode: 9,
        stderr: "first\nproblem",
      });
    }).pipe(
      Effect.provide(
        CommandExecutor.layer.pipe(Layer.provide(NodeServices.layer)),
      ),
    ),
  );

  it.effect("provides raw and decoded GitHub seams with typed failures", () =>
    Effect.gen(function* () {
      const github = yield* GitHub;
      expect(yield* github.run(["api", "example"])).toBe('{"ok":true}');
      expect(yield* github.json(["api", "example"])).toEqual({ ok: true });
      const malformed = yield* Effect.flip(github.json(["api", "malformed"]));
      expect(malformed).toMatchObject({ exitCode: 0, status: null });
      const failed = yield* Effect.flip(github.api("missing"));
      expect(failed).toMatchObject({ exitCode: 1, status: 404 });
    }).pipe(
      Effect.provide(
        GitHub.layer.pipe(
          Layer.provide(
            commandLayer({
              run: (_command, args) =>
                args.includes("missing")
                  ? Effect.fail(
                      new CommandError({
                        command: "gh api missing",
                        exitCode: 1,
                        stderr: "HTTP 404: Not Found",
                      }),
                    )
                  : Effect.succeed(
                      args.includes("malformed") ? "not json" : '{"ok":true}',
                    ),
            }),
          ),
        ),
      ),
    ),
  );

  it.effect(
    "passes configured GitHub tokens without exposing redacted text",
    () =>
      Effect.gen(function* () {
        const github = yield* GitHub;
        expect(yield* github.run(["api", "example"])).toBe("ok");
      }).pipe(
        Effect.provide(
          GitHub.layer.pipe(
            Layer.provide(
              commandLayer({
                run: (_command, _args, options) =>
                  Effect.sync(() => {
                    expect(options?.env?.GH_TOKEN).toBe("secret-token");
                    return "ok";
                  }),
              }),
            ),
          ),
        ),
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({ GH_TOKEN: "secret-token" }),
          ),
        ),
      ),
  );
});

describe("upstream status", () => {
  it.effect("parses tree and repository-root SKILL.md origins", () =>
    Effect.gen(function* () {
      expect(yield* parseOrigin(originUrl)).toMatchObject({
        path: "example",
        type: "directory",
      });
      expect(
        yield* parseOrigin("https://github.com/org/repo/blob/main/SKILL.md"),
      ).toMatchObject({ path: "SKILL.md", type: "file" });
      expect(
        (yield* Effect.exit(
          parseOrigin("https://github.com/org/repo/blob/main/README.md"),
        ))._tag,
      ).toBe("Failure");
    }),
  );

  it.effect(
    "returns a typed decode failure for malformed commit responses",
    () =>
      Effect.gen(function* () {
        const origin = yield* parseOrigin(originUrl);
        expect(yield* Effect.flip(latestPathSha(origin))).toBeInstanceOf(
          UpstreamDecodeError,
        );
      }).pipe(
        Effect.provide(githubLayer({ apiJson: () => Effect.succeed({}) })),
      ),
  );

  it.effect("distinguishes deleted, status, and transport failures", () =>
    Effect.gen(function* () {
      const origin = yield* parseOrigin(originUrl);
      const deleted = yield* Effect.flip(originExists(origin)).pipe(
        Effect.provide(
          githubLayer({
            api: () =>
              Effect.fail(
                new GitHubError({
                  command: "gh api contents",
                  exitCode: 1,
                  stderr: "HTTP 404",
                  status: 404,
                  retryable: false,
                }),
              ),
          }),
        ),
      );
      expect(deleted).toBeInstanceOf(DeletedOriginError);
      const status = yield* Effect.flip(latestPathSha(origin)).pipe(
        Effect.provide(
          githubLayer({
            apiJson: () =>
              Effect.fail(
                new GitHubError({
                  command: "gh api commits",
                  exitCode: 1,
                  stderr: "HTTP 403",
                  status: 403,
                  retryable: false,
                }),
              ),
          }),
        ),
      );
      expect(status).toBeInstanceOf(UpstreamStatusError);
      const transport = yield* Effect.flip(latestPathSha(origin)).pipe(
        Effect.provide(
          githubLayer({
            apiJson: () =>
              Effect.fail(
                new GitHubError({
                  command: "gh api commits",
                  exitCode: -1,
                  stderr: "network is unreachable",
                  status: null,
                  retryable: true,
                }),
              ),
          }),
        ),
      );
      expect(transport).toBeInstanceOf(UpstreamTransportError);
    }),
  );
});

describe("versioned update reports", () => {
  it.effect("reports a deleted path even when its last SHA is unchanged", () =>
    Effect.gen(function* () {
      const root = yield* makeRepository("Old body");
      const report = yield* buildUpdateReport(root);
      expect(report.skills[0]).toMatchObject({
        state: "origin-gone",
        upstreamSha: null,
        reason: "upstream path no longer exists",
      });
    }).pipe(
      Effect.scoped,
      Effect.provide(
        githubLayer({
          api: () =>
            Effect.fail(
              new GitHubError({
                command: "gh api contents",
                exitCode: 1,
                stderr: "HTTP 404",
                status: 404,
                retryable: false,
              }),
            ),
          apiJson: () => Effect.succeed([{ sha: sha("a") }]),
        }),
      ),
      Effect.provide(commandLayer()),
      Effect.provide(NodeServices.layer),
    ),
  );

  it.effect(
    "reports an empty upstream commit history as a deleted origin",
    () =>
      Effect.gen(function* () {
        const root = yield* makeRepository("Old body");
        const report = yield* buildUpdateReport(root);
        expect(report.skills[0]).toMatchObject({
          name: "example",
          state: "origin-gone",
          reason: "upstream path no longer exists",
        });
      }).pipe(
        Effect.scoped,
        Effect.provide(githubLayer({ apiJson: () => Effect.succeed([]) })),
        Effect.provide(commandLayer()),
        Effect.provide(NodeServices.layer),
      ),
  );

  it.effect("serialises complete file changes for clean updates", () =>
    Effect.gen(function* () {
      const root = yield* makeRepository("Old body");
      const report = yield* buildUpdateReport(root);
      expect(report).toEqual({
        version: 1,
        skills: [
          {
            name: "example",
            directory: "example",
            state: "update-available",
            origin: originUrl,
            storedSha: sha("a"),
            upstreamSha: sha("b"),
            files: [{ path: "SKILL.md", status: "modified" }],
            localEdits: [],
          },
        ],
      });
    }).pipe(
      Effect.scoped,
      Effect.provide(
        snapshotLayer(
          "---\nname: upstream\ndescription: Example\n---\nNew body\n",
        ),
      ),
      Effect.provide(githubLayer()),
      Effect.provide(NodeServices.layer),
    ),
  );

  it.effect("continues after one snapshot comparison fails", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "skill-report-failure-test-",
      });
      const imported = (name: string) => ({
        origin: `https://github.com/org/repo/tree/main/${name}`,
        upstreamSha: sha("a"),
        license: "MIT",
        localEdits: [],
        distribution: "wholesale",
      });
      yield* fs.writeFileString(
        path.join(root, "imports.json"),
        JSON.stringify({
          version: 1,
          imports: {
            broken: imported("broken"),
            later: imported("later"),
          },
        }),
      );
      for (const name of ["broken", "later"]) {
        yield* fs.makeDirectory(path.join(root, name));
        yield* fs.writeFileString(
          path.join(root, name, "SKILL.md"),
          `---\nname: ${name}\ndescription: Example\n---\nOld body\n`,
        );
      }
      const executor = Layer.effect(
        CommandExecutor,
        Effect.gen(function* () {
          const fixtureFs = yield* FileSystem.FileSystem;
          const fixturePath = yield* Path.Path;
          return CommandExecutor.of({
            capture: () =>
              Effect.succeed({ stdout: "", stderr: "", exitCode: 0 }),
            run: (command, args, options) => {
              if (command === "git" && args.includes("--format=%H"))
                return Effect.succeed(sha("b"));
              if (command !== "mise") return Effect.succeed("");
              if (options?.cwd?.includes("skill-import-broken-"))
                return Effect.fail(
                  new CommandError({
                    command: "mise exec npm:skills",
                    exitCode: 1,
                    stderr: "snapshot failed",
                  }),
                );
              const sourceName = args[args.indexOf("--skill") + 1];
              const cwd = options?.cwd;
              if (!cwd || !sourceName)
                return Effect.die("invalid report fixture");
              return Effect.gen(function* () {
                const generated = fixturePath.join(
                  cwd,
                  ".agents",
                  "skills",
                  sourceName,
                );
                yield* fixtureFs.makeDirectory(generated, { recursive: true });
                yield* fixtureFs.writeFileString(
                  fixturePath.join(generated, "SKILL.md"),
                  "---\nname: upstream\ndescription: Example\n---\nNew body\n",
                );
                return "";
              }).pipe(Effect.orDie);
            },
            exitCode: () => Effect.succeed(0),
            inherit: () => Effect.succeed(0),
            stream: () => Stream.empty,
          });
        }),
      );
      const report = yield* buildUpdateReport(root).pipe(
        Effect.provide(executor),
      );
      expect(report.skills).toHaveLength(2);
      expect(report.skills[0]).toMatchObject({
        name: "broken",
        state: "error",
        reason: "mise exec npm:skills exited with code 1: snapshot failed",
      });
      expect(report.skills[1]).toMatchObject({
        name: "later",
        state: "update-available",
      });
    }).pipe(
      Effect.scoped,
      Effect.provide(githubLayer()),
      Effect.provide(NodeServices.layer),
    ),
  );

  it.effect(
    "marks adapted changes for review and renders report sections",
    () =>
      Effect.gen(function* () {
        const root = yield* makeRepository("Old body", ["Keep local wording"]);
        const report = yield* buildUpdateReport(root);
        expect(report.skills[0]?.state).toBe("manual-review");
        const markdown = renderUpdateMarkdown({
          version: 1,
          skills: [
            ...(report.skills[0] ? [report.skills[0]] : []),
            {
              name: "broken",
              directory: "broken",
              state: "error",
              origin: originUrl,
              storedSha: sha("a"),
              upstreamSha: null,
              files: [],
              localEdits: [],
              reason: "failed",
            },
          ],
        });
        expect(markdown).toContain("## Manual review\n\n- **example**");
        expect(markdown).toContain("**broken**: failed");
      }).pipe(
        Effect.scoped,
        Effect.provide(
          snapshotLayer(
            "---\nname: upstream\ndescription: Example\n---\nNew body\n",
          ),
        ),
        Effect.provide(githubLayer()),
        Effect.provide(NodeServices.layer),
      ),
  );

  it.effect("synchronises SHA-only changes without rewriting content", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* makeRepository("Same body");
      const skillPath = path.join(root, "example", "SKILL.md");
      const before = yield* fs.readFileString(skillPath);
      yield* updates(root, {
        check: false,
        update: true,
        json: false,
        noCommit: true,
        skipReview: true,
      });
      const after = yield* fs.readFileString(skillPath);
      expect(after).toBe(before.replaceAll(sha("a"), sha("b")));
      expect(
        yield* fs.readFileString(path.join(root, "imports.json")),
      ).toContain(sha("b"));
    }).pipe(
      Effect.scoped,
      Effect.provide(
        snapshotLayer(
          "---\nname: upstream\ndescription: Example\n---\nSame body\n",
        ),
      ),
      Effect.provide(githubLayer()),
      Effect.provide(NodeServices.layer),
    ),
  );
});
