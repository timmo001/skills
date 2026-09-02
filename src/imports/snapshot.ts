import { Effect, FileSystem, Path, Schema } from "effect";
import { CommandError, CommandExecutor } from "../services/CommandExecutor.js";
import {
  type ImportMetadata,
  trackedSkillPath,
  writeReviewedSha,
} from "./metadata.js";
import { parseOrigin } from "./upstream.js";

export class SnapshotError extends Schema.TaggedError<SnapshotError>()(
  "SnapshotError",
  { operation: Schema.String, message: Schema.String },
) {}

const GitSha = Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/));

const snapshotError = (operation: string) =>
  Effect.mapError(
    (cause: unknown) =>
      new SnapshotError({
        operation,
        message:
          cause instanceof CommandError
            ? `${cause.command} exited with code ${cause.exitCode}: ${cause.stderr}`
            : String(cause),
      }),
  );

const withoutProvenance = (lines: readonly string[]) => {
  const kept: string[] = [];
  let inLocalEdits = false;
  for (const line of lines) {
    if (line === "# local-edits:") {
      inLocalEdits = true;
      continue;
    }
    if (inLocalEdits && line.startsWith("#   - ")) continue;
    inLocalEdits = false;
    if (line.startsWith("# origin:") || line.startsWith("# upstream-sha:"))
      continue;
    kept.push(line);
  }
  return kept;
};

export const materialiseMetadata = Effect.fn("Snapshot.materialiseMetadata")(
  function* (file: string, name: string, metadata: ImportMetadata) {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs
      .readFileString(file)
      .pipe(snapshotError("metadata.read"));
    const lines = text.split(/\r?\n/);
    if (lines[0] !== "---") {
      return yield* new SnapshotError({
        operation: "metadata.frontmatter",
        message: `${file}: missing frontmatter`,
      });
    }
    const end = lines.indexOf("---", 1);
    if (end < 0) {
      return yield* new SnapshotError({
        operation: "metadata.frontmatter",
        message: `${file}: missing closing frontmatter`,
      });
    }
    const fields = withoutProvenance(lines.slice(1, end)).filter(
      (line) => !line.startsWith("name:") && !line.startsWith("license:"),
    );
    const overlay = ["---", `name: ${name}`, ...fields];
    if (metadata.license) overlay.push(`license: ${metadata.license}`);
    overlay.push(
      `# origin: ${metadata.origin}`,
      `# upstream-sha: ${metadata.upstreamSha}`,
    );
    if (metadata.localEdits.length > 0) {
      overlay.push(
        "# local-edits:",
        ...metadata.localEdits.map((edit) => `#   - ${edit}`),
      );
    }
    const body = lines.slice(end + 1);
    while (body.at(-1) === "") body.pop();
    yield* fs
      .writeFileString(file, [...overlay, "---", ...body].join("\n") + "\n")
      .pipe(snapshotError("metadata.write"));
  },
);

const comparableSkill = (content: string) => {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") return content;
  const end = lines.indexOf("---", 1);
  if (end < 0) return content;
  return [
    "---",
    ...withoutProvenance(lines.slice(1, end)),
    ...lines.slice(end),
  ].join("\n");
};

const listFiles = Effect.fn("Snapshot.listFiles")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (!(yield* fs.exists(root))) return [];
  const entries = yield* fs
    .readDirectory(root, { recursive: true })
    .pipe(snapshotError("snapshot.list"));
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry);
    const info = yield* fs.stat(absolute).pipe(snapshotError("snapshot.stat"));
    if (info.type === "File") files.push(entry);
  }
  return files.sort();
});

export interface DirectoryChange {
  readonly path: string;
  readonly status: "modified" | "removed-upstream" | "added-upstream";
}

export const directoryChanges = Effect.fn("Snapshot.directoryChanges")(
  function* (local: string, upstream: string, localSkillFile = "SKILL.md") {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const localFiles = yield* listFiles(local);
    const upstreamFiles = yield* listFiles(upstream);
    const comparableLocal = new Map(
      localFiles.map((file) => [
        file === localSkillFile ? "SKILL.md" : file,
        file,
      ]),
    );
    const allFiles = [
      ...new Set([...comparableLocal.keys(), ...upstreamFiles]),
    ].sort();
    const changes: DirectoryChange[] = [];
    for (const file of allFiles) {
      const localFile = comparableLocal.get(file);
      if (!localFile) {
        changes.push({ path: file, status: "added-upstream" });
        continue;
      }
      if (!upstreamFiles.includes(file)) {
        changes.push({ path: file, status: "removed-upstream" });
        continue;
      }
      const localBytes = yield* fs.readFile(path.join(local, localFile));
      const upstreamBytes = yield* fs.readFile(path.join(upstream, file));
      if (file === "SKILL.md") {
        const decoder = new TextDecoder();
        if (
          comparableSkill(decoder.decode(localBytes)) !==
          comparableSkill(decoder.decode(upstreamBytes))
        )
          changes.push({ path: file, status: "modified" });
      } else if (
        localBytes.length !== upstreamBytes.length ||
        localBytes.some((byte, index) => byte !== upstreamBytes[index])
      )
        changes.push({ path: file, status: "modified" });
    }
    return changes;
  },
);

export const directoriesMatch = Effect.fn("Snapshot.directoriesMatch")(
  function* (local: string, upstream: string) {
    return (yield* directoryChanges(local, upstream)).length === 0;
  },
);

export const withFetched = Effect.fn("Snapshot.withFetched")(function* <
  A,
  E,
  R,
>(
  root: string,
  name: string,
  metadata: ImportMetadata,
  use: (candidate: string, sha: string) => Effect.Effect<A, E, R>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const executor = yield* CommandExecutor;
  const origin = yield* parseOrigin(metadata.origin).pipe(
    Effect.mapError(
      () =>
        new SnapshotError({
          operation: "origin",
          message: `${name}: unsupported origin URL`,
        }),
    ),
  );
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const temp = yield* fs
        .makeTempDirectoryScoped({ prefix: `skill-import-${name}-` })
        .pipe(snapshotError("temp"));
      const checkout = path.join(temp, "source");
      yield* executor
        .run("git", [
          "clone",
          "--quiet",
          "--filter=blob:none",
          "--no-checkout",
          `https://github.com/${origin.owner}/${origin.repo}.git`,
          checkout,
        ])
        .pipe(snapshotError("git.clone"));
      yield* executor
        .run("git", ["-C", checkout, "sparse-checkout", "set", origin.path])
        .pipe(snapshotError("git.sparse-checkout"));
      yield* executor
        .run("git", ["-C", checkout, "checkout", "--quiet", origin.branch])
        .pipe(snapshotError("git.checkout"));
      const shaOutput = (yield* executor
        .run("git", [
          "-C",
          checkout,
          "log",
          "-1",
          "--format=%H",
          "--",
          origin.path,
        ])
        .pipe(snapshotError("git.log"))).trim();
      const sha = yield* Schema.decodeUnknownEffect(GitSha)(shaOutput).pipe(
        Effect.mapError(
          (cause) =>
            new SnapshotError({
              operation: "git.log.decode",
              message: String(cause),
            }),
        ),
      );
      yield* executor
        .run("git", ["-C", checkout, "checkout", "--quiet", sha])
        .pipe(snapshotError("git.checkout-sha"));
      yield* executor
        .run(
          "mise",
          [
            "exec",
            "npm:skills",
            "--",
            "skills",
            "add",
            path.join(checkout, origin.path),
            "--skill",
            metadata.sourceName ?? name,
            "--copy",
            "--yes",
            "--agent",
            "codex",
            "--metadata",
            '{"source":"skills-update-review"}',
          ],
          { cwd: temp, env: { GH_TOKEN: "", GITHUB_TOKEN: "" } },
        )
        .pipe(snapshotError("skills.add"));
      const generated = path.join(
        temp,
        ".agents",
        "skills",
        metadata.sourceName ?? name,
      );
      if (!(yield* fs.exists(generated))) {
        return yield* new SnapshotError({
          operation: "skills.add",
          message: `${name}: skills CLI did not materialise the snapshot`,
        });
      }
      const candidate = path.join(temp, name);
      yield* fs.copy(generated, candidate, { overwrite: true });
      yield* materialiseMetadata(path.join(candidate, "SKILL.md"), name, {
        ...metadata,
        upstreamSha: sha,
      });
      return yield* use(candidate, sha);
    }),
  );
});

export const applyClean = Effect.fn("Snapshot.applyClean")(function* (
  root: string,
  name: string,
  metadata: ImportMetadata,
  candidate: string,
  sha: string,
) {
  if (metadata.localEdits.length > 0) {
    return yield* new SnapshotError({
      operation: "snapshot.apply",
      message: `${name}: has local edits; review the generated snapshot before applying`,
    });
  }
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const tracked = trackedSkillPath(root, name, metadata, path);
  const target = path.dirname(tracked);
  if (yield* fs.exists(target)) yield* fs.remove(target, { recursive: true });
  yield* fs.copy(candidate, target, { overwrite: true });
  if (metadata.distribution === "official-source") {
    yield* fs.rename(path.join(target, "SKILL.md"), tracked);
  }
  yield* writeReviewedSha(root, name, sha);
});

export const comparison = Effect.fn("Snapshot.comparison")(function* (
  root: string,
  name: string,
  metadata: ImportMetadata,
  candidate: string,
) {
  const path = yield* Path.Path;
  const executor = yield* CommandExecutor;
  const target = path.dirname(trackedSkillPath(root, name, metadata, path));
  const result = yield* executor
    .capture("diff", ["--recursive", "--unified", target, candidate])
    .pipe(snapshotError("snapshot.diff"));
  if (result.exitCode > 1) {
    return yield* new SnapshotError({
      operation: "snapshot.diff",
      message: result.stderr || `diff exited with code ${result.exitCode}`,
    });
  }
  return result.stdout;
});
