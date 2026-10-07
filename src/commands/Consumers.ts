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
import { GitHub, GitHubError } from "../services/GitHub.js";
import {
  type ImportsFile,
  isExternal,
  readImports,
} from "../imports/metadata.js";
import { originDirectory, parseOrigin } from "../imports/upstream.js";
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
      ref: Schema.optionalKey(Schema.String),
      computedHash: Schema.String,
    }),
  ),
});

type LockEntry = (typeof SkillsLock.Type)["skills"][string];

export class ConsumersError extends Schema.TaggedError<ConsumersError>()(
  "ConsumersError",
  { operation: Schema.String, message: Schema.String },
) {}

const consumersError = (operation: string) =>
  Effect.mapError(
    (cause: unknown) =>
      new ConsumersError({
        operation,
        message:
          cause instanceof GitHubError
            ? `${cause.command}: ${cause.stderr}`
            : cause instanceof Error
              ? cause.message
              : String(cause),
      }),
  );

/**
 * Where a shared skill is installed from: a skill committed in the source
 * repository, or an external import at its reviewed upstream commit.
 */
export type SkillOrigin =
  | { readonly kind: "committed"; readonly source: string }
  | {
      readonly kind: "external";
      readonly source: string;
      readonly ref: string;
      readonly path: string;
    };

/**
 * Resolve a skill name to its origin. External imports must keep their
 * upstream name and carry a licence that allows redistribution.
 */
const skillOrigin = Effect.fn("Consumers.skillOrigin")(function* (
  root: string,
  source: string,
  imports: ImportsFile,
  name: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const fail = (message: string) =>
    new ConsumersError({ operation: "consumers.validate", message });

  if (
    yield* fs
      .exists(path.join(root, name, "SKILL.md"))
      .pipe(consumersError("skill.read"))
  )
    return { kind: "committed", source } satisfies SkillOrigin;

  const metadata = imports.imports[name];

  if (!metadata || !isExternal(metadata))
    return yield* fail(
      `${name} is not a skill committed in this repository or an external import`,
    );

  if (metadata.license === "UNLICENSED")
    return yield* fail(`${name} is unlicensed, so it cannot be shared`);

  if (metadata.sourceName && metadata.sourceName !== name)
    return yield* fail(
      `${name} is published upstream as ${metadata.sourceName}, so it cannot be shared`,
    );

  const origin = yield* parseOrigin(metadata.origin).pipe(
    Effect.mapError(() => fail(`${name} has an invalid origin`)),
  );

  return {
    kind: "external",
    source: `${origin.owner}/${origin.repo}`,
    ref: metadata.upstreamSha,
    path: originDirectory(origin),
  } satisfies SkillOrigin;
});

/** How each listed skill in a consumer repository should change. */
export interface ConsumerPlan {
  readonly add: readonly string[];
  readonly update: readonly string[];
  readonly upToDate: readonly string[];
  readonly remove: readonly string[];
  /** Copies changed in the consumer since they were installed; never overwritten or removed. */
  readonly edited: readonly string[];
  /** Listed skills the consumer installed from another source or keeps itself; left alone. */
  readonly foreign: readonly string[];
}

/**
 * Compare the wanted skills with the consumer's lock. Only lock entries
 * installed from a skill's own origin are managed, so skills from other
 * sources, and unlocked skills the consumer keeps itself, are left alone.
 * `current` says whether a managed copy matches what the origin would
 * install now.
 */
export const planConsumer = (
  wanted: readonly string[],
  locked: Readonly<Record<string, LockEntry>>,
  present: ReadonlySet<string>,
  managed: (name: string, entry: LockEntry) => boolean,
  unedited: ReadonlySet<string>,
  current: (name: string, entry: LockEntry) => boolean,
): ConsumerPlan => {
  const owned = Object.entries(locked).filter(([name, entry]) =>
    managed(name, entry),
  );

  const ownedNames = owned.map(([name]) => name);

  const fresh = owned
    .filter(([name, entry]) => unedited.has(name) && current(name, entry))
    .map(([name]) => name);

  return {
    add: wanted.filter((name) => !(name in locked) && !present.has(name)),
    update: wanted.filter(
      (name) =>
        ownedNames.includes(name) &&
        unedited.has(name) &&
        !fresh.includes(name),
    ),
    upToDate: wanted.filter((name) => fresh.includes(name)),
    remove: ownedNames.filter(
      (name) => !wanted.includes(name) && unedited.has(name),
    ),
    edited: ownedNames.filter((name) => !unedited.has(name)),
    foreign: wanted.filter(
      (name) =>
        (name in locked || present.has(name)) && !ownedNames.includes(name),
    ),
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

/**
 * Read `consumers.yml` and check every listed skill resolves to a shareable
 * origin.
 */
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

  const imports = yield* readImports(root).pipe(consumersError("imports.read"));

  for (const [repository, { skills }] of Object.entries(config.repositories))
    for (const name of skills)
      yield* skillOrigin(root, config.source, imports, name).pipe(
        Effect.mapError(
          (error) =>
            new ConsumersError({
              operation: error.operation,
              message: `${repository}: ${error.message}`,
            }),
        ),
      );

  return config;
});

const readLock = Effect.fn("Consumers.readLock")(function* (checkout: string) {
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

  return lock.skills;
});

/** Everything a sync needs to know about the shared skills on offer. */
interface Catalogue {
  readonly source: string;
  /** Published commit of the source repository that committed skills install from. */
  readonly commit: string;
  readonly origin: (name: string) => SkillOrigin | undefined;
  /** Folder hash of each committed skill at `commit`. */
  readonly hash: (name: string) => string | undefined;
}

/**
 * Resolve every skill that could be shared, with committed skills pinned to
 * the source checkout's `HEAD`. Installing `installs` needs that commit
 * published and their folders and `imports.json` unchanged; removing does not.
 */
const loadCatalogue = Effect.fn("Consumers.loadCatalogue")(function* (
  root: string,
  source: string,
  installs: readonly string[],
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const executor = yield* CommandExecutor;

  const git = (...args: string[]) =>
    executor.run("git", args, { cwd: root }).pipe(
      Effect.map((output) => output.trim()),
      consumersError("source.git"),
    );

  const commit = yield* git("rev-parse", "HEAD");

  const imports = yield* readImports(root).pipe(consumersError("imports.read"));

  const candidates = [
    ...(yield* fs.readDirectory(root).pipe(consumersError("source.read"))),
    ...Object.keys(imports.imports),
  ];

  const origins = new Map<string, SkillOrigin>();
  const hashes = new Map<string, string>();

  for (const name of new Set(candidates)) {
    const origin = yield* Effect.result(
      skillOrigin(root, source, imports, name),
    );

    if (Result.isFailure(origin)) continue;

    origins.set(name, origin.success);

    if (origin.success.kind === "committed")
      hashes.set(name, yield* skillFolderHash(path.join(root, name)));
  }

  if (installs.length > 0) {
    if (!(yield* git("branch", "--remotes", "--contains", commit)))
      return yield* new ConsumersError({
        operation: "source.commit",
        message: `${commit} is not pushed, so consumers cannot install from it`,
      });

    const changed = yield* git(
      "status",
      "--porcelain",
      "--",
      "imports.json",
      ...installs.filter((name) => hashes.has(name)),
    );

    if (changed)
      return yield* new ConsumersError({
        operation: "source.status",
        message: `Commit and push these first:\n${changed}`,
      });
  }

  return {
    source,
    commit,
    origin: (name) => origins.get(name),
    hash: (name) => hashes.get(name),
  } satisfies Catalogue;
});

const installUrl = (catalogue: Catalogue, name: string) => {
  const origin = catalogue.origin(name);

  return origin?.kind === "external"
    ? `https://github.com/${origin.source}/tree/${origin.ref}/${origin.path}`
    : `https://github.com/${catalogue.source}/tree/${catalogue.commit}/${name}`;
};

const syncRepository = Effect.fn("Consumers.syncRepository")(function* (
  repository: string,
  wanted: readonly string[],
  options: {
    readonly catalogue: Catalogue;
    readonly dryRun: boolean;
  },
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const executor = yield* CommandExecutor;
  const github = yield* GitHub;
  const skillsCli = yield* SkillsCli;
  const { catalogue } = options;
  const checkout = path.join(yield* fs.makeTempDirectoryScoped(), "repo");

  const git = (...args: string[]) =>
    executor.run("git", args, { cwd: checkout });

  const skills = (...args: string[]) => skillsCli.run(args, { cwd: checkout });

  // A failed clone removes the directory it created, so retrying is safe.
  yield* github.run(
    ["repo", "clone", repository, checkout, "--", "--depth", "1"],
    { readOnly: true },
  );

  const branch = (yield* git("rev-parse", "--abbrev-ref", "HEAD")).trim();
  const locked = yield* readLock(checkout);
  const unedited = new Set<string>();

  for (const [name, entry] of Object.entries(locked)) {
    const directory = path.join(checkout, ".agents", "skills", name);

    if (
      (yield* fs.exists(directory)) &&
      (yield* skillFolderHash(directory)) === entry.computedHash
    )
      unedited.add(name);
  }

  const skillsDirectory = path.join(checkout, ".agents", "skills");

  const present = new Set(
    (yield* fs.exists(skillsDirectory))
      ? yield* fs.readDirectory(skillsDirectory)
      : [],
  );

  const plan = planConsumer(
    wanted,
    locked,
    present,
    (name, entry) =>
      entry.source === catalogue.source ||
      entry.source === catalogue.origin(name)?.source,
    unedited,
    (name, entry) => {
      const origin = catalogue.origin(name);

      return origin?.kind === "external"
        ? entry.ref === origin.ref
        : entry.computedHash === catalogue.hash(name);
    },
  );

  // Updates reinstall from scratch, which also clears links to agents that
  // are no longer installed to.
  if (plan.remove.length + plan.update.length > 0)
    yield* skills("remove", ...plan.remove, ...plan.update, "-y");

  for (const name of [...plan.add, ...plan.update])
    yield* skills(
      "add",
      installUrl(catalogue, name),
      "--skill",
      name,
      "--agent",
      "universal",
      "--copy",
      "-y",
    );

  const changed = (yield* git(
    "status",
    "--porcelain",
    "--untracked-files=all",
  )).trim();

  const summary = (
    [
      ["Added", plan.add],
      ["Updated", plan.update],
      ["Removed", plan.remove],
      ["Skipped, up to date", plan.upToDate],
      ["Skipped, edited in the repository", plan.edited],
      ["Skipped, not installed from here", plan.foreign],
    ] as const
  ).flatMap(([label, names]) =>
    names.length > 0 ? [`${label}: ${names.join(", ")}`] : [],
  );

  if (!changed) {
    yield* Console.log(`${repository}: up to date (${summary.join("; ")})`);

    return "up to date";
  }

  if (options.dryRun) {
    yield* Console.log(
      `${repository}: would push to ${branch}\n${changed}\n${summary.join("\n")}`,
    );

    return "would push";
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

  return "pushed";
});

const sync = Effect.fn("Consumers.sync")(function* (
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

  const catalogue = yield* loadCatalogue(
    root,
    config.source,
    repositories.flatMap(([, { skills }]) => skills),
  );

  const failed: string[] = [];
  const outcomes = new Map<string, string[]>();

  for (const [repository, { skills: wanted }] of repositories) {
    const result = yield* Effect.result(
      Effect.scoped(
        syncRepository(repository, wanted, {
          catalogue,
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
    } else
      outcomes.set(result.success, [
        ...(outcomes.get(result.success) ?? []),
        repository,
      ]);
  }

  const pushed = outcomes.get("pushed") ?? [];

  yield* Console.log(
    `[RESULT] ${
      [
        ...(pushed.length > 0 ? [`pushed ${pushed.join(", ")}`] : []),
        ...[...outcomes].flatMap(([outcome, names]) =>
          outcome === "pushed" ? [] : [`${names.length} ${outcome}`],
        ),
        ...(failed.length > 0 ? [`failed ${failed.join(", ")}`] : []),
      ].join(", ") || "no repositories listed"
    }`,
  );

  if (failed.length > 0)
    return yield* new ConsumersError({
      operation: "consumers.sync",
      message: `Failed to sync: ${failed.join(", ")}`,
    });
});

/**
 * Bring every repository listed in `consumers.yml` in line with its list:
 * add newly listed skills, update and remove unedited copies, and push one
 * commit to the default branch. Each repository is cloned into a temporary
 * directory, so local checkouts are never touched.
 */
export const syncConsumers = (
  root: string,
  options: {
    readonly repository?: string | undefined;
    readonly dryRun: boolean;
  },
) =>
  sync(root, options).pipe(
    // Per-repository failures are already in the result line.
    Effect.tapError((error) =>
      error.operation === "consumers.sync"
        ? Effect.void
        : Console.log(`[RESULT] Failed: ${error.message}`),
    ),
  );

const RepositoryInfo = Schema.Struct({
  full_name: Schema.String,
  owner: Schema.Struct({ login: Schema.String }),
  private: Schema.Boolean,
  archived: Schema.Boolean,
});

const editError = (message: string) =>
  new ConsumersError({ operation: "consumers.edit", message });

/** Fail unless `repository` is a public, unarchived repository owned by the source's owner. */
const checkEligible = Effect.fn("Consumers.checkEligible")(function* (
  source: string,
  repository: string,
) {
  const github = yield* GitHub;
  const owner = source.split("/")[0];

  if (repository === source)
    return yield* editError(`${repository} is the skills source`);

  const info = yield* github
    .apiJson(`repos/${repository}`)
    .pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(RepositoryInfo)),
      consumersError("repository.read"),
    );

  if (info.full_name !== repository)
    return yield* editError(`${repository} has moved to ${info.full_name}`);

  if (info.owner.login !== owner)
    return yield* editError(`${repository} is not owned by ${owner}`);

  if (info.private || info.archived)
    return yield* editError(`${repository} must be public and not archived`);
});

/** Load `consumers.yml` for an edit, with the target repository resolved. */
/**
 * Load `consumers.yml` for an edit, with the target repository resolved.
 * The edit is pushed, so the skills checkout must not hold other unpushed
 * commits.
 */
const startEdit = Effect.fn("Consumers.startEdit")(function* (
  root: string,
  repository: string | undefined,
) {
  const executor = yield* CommandExecutor;
  const github = yield* GitHub;
  const config = yield* readConsumers(root);

  const git = (...args: string[]) =>
    executor.run("git", args, { cwd: root }).pipe(
      Effect.map((output) => output.trim()),
      consumersError("source.git"),
    );

  const target =
    repository ??
    (yield* github
      .run(
        ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
        { readOnly: true },
      )
      .pipe(
        Effect.map((output) => output.trim()),
        consumersError("repository.detect"),
      ));

  if (yield* git("status", "--porcelain", "--", CONSUMERS_FILE))
    return yield* editError(`${CONSUMERS_FILE} has uncommitted changes`);

  yield* git("fetch", "--quiet");

  const unpushed = yield* git("log", "--oneline", "@{upstream}..HEAD");

  if (unpushed)
    return yield* editError(
      `The skills checkout has unpushed commits; push or drop them first:\n${unpushed}`,
    );

  return { config, target, existing: config.repositories[target]?.skills };
});

/**
 * Write `repositories` to `consumers.yml`, keeping its header comments, then
 * validate, commit and push it. An invalid edit is reverted.
 */
const commitConsumers = Effect.fn("Consumers.commit")(function* (
  root: string,
  config: ConsumersFile,
  repositories: ConsumersFile["repositories"],
  message: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const executor = yield* CommandExecutor;
  const file = path.join(root, CONSUMERS_FILE);

  const source = yield* fs
    .readFileString(file)
    .pipe(consumersError("consumers.read"));

  const header = source.slice(0, source.search(/^source:/m)).trimEnd();

  yield* fs
    .writeFileString(
      file,
      [
        ...(header ? [header] : []),
        `source: ${config.source}`,
        ...(Object.keys(repositories).length === 0
          ? ["repositories: {}"]
          : [
              "repositories:",
              ...Object.entries(repositories).flatMap(([repository, entry]) => [
                `  ${repository}:`,
                "    skills:",
                ...entry.skills.map((name) => `      - ${name}`),
              ]),
            ]),
        "",
      ].join("\n"),
    )
    .pipe(consumersError("consumers.write"));

  const valid = yield* Effect.result(readConsumers(root));

  if (Result.isFailure(valid)) {
    yield* fs
      .writeFileString(file, source)
      .pipe(consumersError("consumers.restore"));

    return yield* valid.failure;
  }

  const code = yield* executor.inherit(
    "dot",
    ["git-commit", "--message", message, "--path", CONSUMERS_FILE, "--push"],
    { cwd: root },
  );

  if (code === 0) return;

  // A failed commit leaves the edit behind, which would block the next edit.
  // A failed push has already committed it, so there is nothing to restore.
  const uncommitted = yield* executor
    .run("git", ["status", "--porcelain", "--", CONSUMERS_FILE], { cwd: root })
    .pipe(consumersError("source.git"));

  if (uncommitted.trim())
    yield* fs
      .writeFileString(file, source)
      .pipe(consumersError("consumers.restore"));

  return yield* editError(
    uncommitted.trim()
      ? `Commit failed, so ${CONSUMERS_FILE} was restored`
      : `Committed, but the push failed; push ${root} before the next edit`,
  );
});

/**
 * A commit subject naming every skill, or counting them when the names would
 * make it too long.
 */
const editSubject = (
  verb: string,
  names: readonly string[],
  target: string,
) => {
  const full = `${verb} ${names.join(", ")} with ${target}`;

  return full.length <= 72
    ? full
    : `${verb} ${names.length} skills with ${target}`;
};

/** Sync one repository after its entry changed; the timer retries a failure. */
const syncNow = Effect.fn("Consumers.syncNow")(function* (
  repository: string,
  wanted: readonly string[],
  catalogue: Catalogue,
) {
  const result = yield* Effect.result(
    Effect.scoped(
      syncRepository(repository, wanted, { catalogue, dryRun: false }),
    ),
  );

  if (Result.isFailure(result)) {
    const error = result.failure;

    return yield* editError(
      `${repository}: saved, but the sync failed and the timer will retry: ${"stderr" in error ? `${error.command}: ${error.stderr}` : error.message}`,
    );
  }
});

/**
 * Share `skills` with a consumer repository: add them to its `consumers.yml`
 * entry, creating the entry if needed, commit and push that, then install
 * them in the repository straight away. Without `repository`, use the GitHub
 * repository of the working directory.
 */
export const addConsumerSkills = Effect.fn("Consumers.addSkills")(function* (
  root: string,
  repository: string | undefined,
  skills: readonly string[],
) {
  const { config, target, existing } = yield* startEdit(root, repository);

  if (existing === undefined) yield* checkEligible(config.source, target);

  const added = [...new Set(skills)].filter(
    (name) => !existing?.includes(name),
  );

  if (added.length === 0)
    return yield* editError(`${target} already has ${skills.join(", ")}`);

  const wanted = [...(existing ?? []), ...added].sort();
  const catalogue = yield* loadCatalogue(root, config.source, wanted);

  yield* commitConsumers(
    root,
    config,
    { ...config.repositories, [target]: { skills: wanted } },
    editSubject("Share", added, target),
  );

  yield* syncNow(target, wanted, catalogue);
});

/**
 * Stop sharing `skills` with a consumer repository, or every skill with
 * `all`: update its entry, commit and push that, and remove the copies from
 * the repository straight away. Dropping the last skill removes the entry,
 * after the copies are gone, since the sync no longer visits it.
 */
export const removeConsumerSkills = Effect.fn("Consumers.removeSkills")(
  function* (
    root: string,
    repository: string | undefined,
    skills: readonly string[],
    all: boolean,
  ) {
    if (all === skills.length > 0)
      return yield* editError("Pass either skill names or --all");

    const { config, target, existing } = yield* startEdit(root, repository);

    if (existing === undefined)
      return yield* editError(`${target} is not listed in ${CONSUMERS_FILE}`);

    const missing = skills.filter((name) => !existing.includes(name));

    if (missing.length > 0)
      return yield* editError(`${target} does not have ${missing.join(", ")}`);

    const removed = all
      ? existing
      : existing.filter((name) => skills.includes(name));

    const remaining = existing.filter((name) => !removed.includes(name));
    const catalogue = yield* loadCatalogue(root, config.source, remaining);

    if (remaining.length > 0) {
      yield* commitConsumers(
        root,
        config,
        { ...config.repositories, [target]: { skills: remaining } },
        editSubject("Stop sharing", removed, target),
      );

      yield* syncNow(target, remaining, catalogue);

      return;
    }

    yield* syncNow(target, [], catalogue);

    yield* commitConsumers(
      root,
      config,
      Object.fromEntries(
        Object.entries(config.repositories).filter(([name]) => name !== target),
      ),
      `Stop sharing skills with ${target}`,
    );
    yield* Console.log(`${target}: removed from ${CONSUMERS_FILE}`);
  },
);
