import { createHash } from "node:crypto";
import {
  Console,
  Effect,
  FileSystem,
  Path,
  PlatformError,
  Result,
  Schema,
} from "effect";
import { Yaml } from "effect/encoding";
import { CommandExecutor } from "../services/CommandExecutor.js";
import { GitHub } from "../services/GitHub.js";
import { SkillsCli } from "../services/SkillsCli.js";

/** Lists the repositories that receive project copies of skills from this repository. */
export const CONSUMERS_FILE = "consumers.yml";

const LOCK_FILE = "skills-lock.json";

const COMMIT_SUBJECT = "Update shared skills";

const RepositoryName = Schema.String.check(
  Schema.isPattern(/^[\w.-]+\/[\w.-]+$/),
).annotate({ identifier: "RepositoryName" });

const SkillName = Schema.String.check(Schema.isPattern(/^[a-z0-9-]+$/));

export const ConsumersFile = Schema.Struct({
  source: RepositoryName,
  repositories: Schema.Record(
    RepositoryName,
    Schema.Struct({ skills: Schema.Array(SkillName) }),
  ),
});

export interface ConsumersFile extends Schema.Schema.Type<
  typeof ConsumersFile
> {}

const SkillsLock = Schema.Struct({
  skills: Schema.Record(
    Schema.String,
    Schema.Struct({
      source: Schema.String,
      computedHash: Schema.String,
    }),
  ),
});

export class ConsumersError extends Schema.TaggedError<ConsumersError>()(
  "ConsumersError",
  { operation: Schema.String, message: Schema.String },
) {}

const consumersError = (operation: string) =>
  Effect.mapError(
    (cause: unknown) =>
      new ConsumersError({
        operation,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  );

/** How each listed skill in a consumer repository should change. */
export interface ConsumerPlan {
  readonly add: readonly string[];
  readonly update: readonly string[];
  readonly remove: readonly string[];
  /** Copies changed in the consumer since they were installed; never overwritten or removed. */
  readonly edited: readonly string[];
}

/**
 * Compare the wanted skills with the consumer's lock. Only skills installed
 * from `source` are managed, so skills from other sources are left alone.
 */
export const planConsumer = (
  wanted: readonly string[],
  locked: Readonly<Record<string, string>>,
  unedited: ReadonlySet<string>,
): ConsumerPlan => {
  const installed = Object.keys(locked);

  return {
    add: wanted.filter((name) => !installed.includes(name)),
    update: wanted.filter(
      (name) => installed.includes(name) && unedited.has(name),
    ),
    remove: installed.filter(
      (name) => !wanted.includes(name) && unedited.has(name),
    ),
    edited: installed.filter((name) => !unedited.has(name)),
  };
};

/**
 * The skills CLI's folder hash: every file's relative path and contents,
 * sorted by path, skipping `.git`, `node_modules` and symlinks.
 */
export const skillFolderHash = Effect.fn("Consumers.skillFolderHash")(
  function* (directory: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const files: { relativePath: string; content: Uint8Array }[] = [];

    const collect = (
      current: string,
    ): Effect.Effect<void, PlatformError.PlatformError> =>
      Effect.gen(function* () {
        for (const name of yield* fs.readDirectory(current)) {
          const full = path.join(current, name);

          if (Result.isSuccess(yield* Effect.result(fs.readLink(full))))
            continue;

          const info = yield* fs.stat(full);

          if (info.type === "Directory") {
            if (name !== ".git" && name !== "node_modules")
              yield* collect(full);
          } else if (info.type === "File") {
            files.push({
              relativePath: path
                .relative(directory, full)
                .split("\\")
                .join("/"),
              content: yield* fs.readFile(full),
            });
          }
        }
      });

    yield* collect(directory).pipe(consumersError("skill.hash"));
    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    const hash = createHash("sha256");

    for (const file of files) {
      hash.update(file.relativePath);
      hash.update(file.content);
    }

    return hash.digest("hex");
  },
);

export const readConsumers = Effect.fn("Consumers.read")(function* (
  root: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const raw = yield* fs
    .readFileString(path.join(root, CONSUMERS_FILE))
    .pipe(consumersError("consumers.read"));

  const config = yield* Effect.try({
    try: () => Yaml.parse(raw),
    catch: (cause) =>
      new ConsumersError({
        operation: "consumers.yaml",
        message: String(cause),
      }),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ConsumersFile)),
    consumersError("consumers.decode"),
  );

  for (const [repository, { skills }] of Object.entries(config.repositories))
    for (const name of skills)
      if (!(yield* fs.exists(path.join(root, name, "SKILL.md"))))
        return yield* new ConsumersError({
          operation: "consumers.validate",
          message: `${repository}: ${name} is not a skill committed in this repository`,
        });

  return config;
});

const readLock = Effect.fn("Consumers.readLock")(function* (
  checkout: string,
  source: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(checkout, LOCK_FILE);

  if (!(yield* fs.exists(file))) return {};

  const lock = yield* fs.readFileString(file).pipe(
    Effect.flatMap((text) =>
      Effect.try({ try: () => JSON.parse(text), catch: String }),
    ),
    Effect.flatMap(Schema.decodeUnknownEffect(SkillsLock)),
    consumersError("lock.decode"),
  );

  return Object.fromEntries(
    Object.entries(lock.skills)
      .filter(([, entry]) => entry.source === source)
      .map(([name, entry]) => [name, entry.computedHash]),
  );
});

const syncRepository = Effect.fn("Consumers.syncRepository")(function* (
  repository: string,
  wanted: readonly string[],
  options: {
    readonly source: string;
    readonly dryRun: boolean;
  },
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const executor = yield* CommandExecutor;
  const github = yield* GitHub;
  const skillsCli = yield* SkillsCli;
  const checkout = path.join(yield* fs.makeTempDirectoryScoped(), "repo");

  const git = (...args: string[]) =>
    executor.run("git", args, { cwd: checkout });

  const skills = (...args: string[]) => skillsCli.run(args, { cwd: checkout });

  yield* github.run([
    "repo",
    "clone",
    repository,
    checkout,
    "--",
    "--depth",
    "1",
  ]);

  const branch = (yield* git("rev-parse", "--abbrev-ref", "HEAD")).trim();
  const locked = yield* readLock(checkout, options.source);
  const unedited = new Set<string>();

  for (const [name, hash] of Object.entries(locked)) {
    const directory = path.join(checkout, ".agents", "skills", name);

    if (
      (yield* fs.exists(directory)) &&
      (yield* skillFolderHash(directory)) === hash
    )
      unedited.add(name);
  }

  const plan = planConsumer(wanted, locked, unedited);

  if (plan.add.length > 0)
    yield* skills(
      "add",
      options.source,
      ...plan.add.flatMap((name) => ["--skill", name]),
      "--copy",
      "-y",
    );

  if (plan.update.length > 0)
    yield* skills("update", "-p", "-y", ...plan.update);

  if (plan.remove.length > 0) yield* skills("remove", ...plan.remove, "-y");

  const changed = (yield* git(
    "status",
    "--porcelain",
    "--untracked-files=all",
  )).trim();

  const changedPaths = changed.split("\n").map((line) => line.slice(3));

  const touched = (name: string) =>
    changedPaths.some((file) => file.startsWith(`.agents/skills/${name}/`));

  const summary = (
    [
      ["Added", plan.add],
      ["Updated", plan.update.filter(touched)],
      ["Removed", plan.remove],
      ["Skipped, up to date", plan.update.filter((name) => !touched(name))],
      ["Skipped, edited in the repository", plan.edited],
    ] as const
  ).flatMap(([label, names]) =>
    names.length > 0 ? [`${label}: ${names.join(", ")}`] : [],
  );

  if (!changed) {
    yield* Console.log(`${repository}: up to date (${summary.join("; ")})`);

    return;
  }

  if (options.dryRun) {
    yield* Console.log(
      `${repository}: would push to ${branch}\n${changed}\n${summary.join("\n")}`,
    );

    return;
  }

  yield* git("add", "-A");
  yield* git(
    "commit",
    "--quiet",
    "-m",
    COMMIT_SUBJECT,
    "-m",
    summary.join("\n"),
  );

  yield* git("push", "--quiet", "origin", `HEAD:${branch}`);
  yield* Console.log(
    `${repository}: pushed to ${branch} (${summary.join("; ")})`,
  );
});

/**
 * Bring every repository listed in `consumers.yml` in line with its list:
 * add newly listed skills, update and remove unedited copies, and push one
 * commit to the default branch. Each repository is cloned into a temporary
 * directory, so local checkouts are never touched.
 */
export const syncConsumers = Effect.fn("Consumers.sync")(function* (
  root: string,
  options: {
    readonly repository?: string | undefined;
    readonly dryRun: boolean;
  },
) {
  const config = yield* readConsumers(root);

  const repositories = Object.entries(config.repositories).filter(
    ([name]) => !options.repository || name === options.repository,
  );

  if (options.repository && repositories.length === 0)
    return yield* new ConsumersError({
      operation: "consumers.select",
      message: `${options.repository} is not listed in ${CONSUMERS_FILE}`,
    });

  const failed: string[] = [];

  for (const [repository, { skills: wanted }] of repositories) {
    const result = yield* Effect.result(
      Effect.scoped(
        syncRepository(repository, wanted, {
          source: config.source,
          dryRun: options.dryRun,
        }),
      ),
    );

    if (Result.isFailure(result)) {
      const error = result.failure;

      yield* Console.error(
        `${repository}: failed: ${"stderr" in error ? `${error.command}: ${error.stderr}` : error.message}`,
      );
      failed.push(repository);
    }
  }

  if (failed.length > 0)
    return yield* new ConsumersError({
      operation: "consumers.sync",
      message: `Failed to sync: ${failed.join(", ")}`,
    });
});
