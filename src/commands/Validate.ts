import { Console, Effect, FileSystem, Path, Schema } from "effect";
import { readImports, trackedSkillPath } from "../imports/metadata.js";

export class ValidationError extends Schema.TaggedError<ValidationError>()(
  "ValidationError",
  { failures: Schema.Array(Schema.String) },
) {}

const allowedFields = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

const frontmatter = (text: string) => {
  const lines = text.split(/\r?\n/);
  const failures: string[] = [];
  if (lines[0] !== "---")
    return {
      fields: new Map<string, string>(),
      failures: ["missing opening frontmatter delimiter"],
    };
  const end = lines.indexOf("---", 1);
  if (end < 0)
    return {
      fields: new Map<string, string>(),
      failures: ["missing closing frontmatter delimiter"],
    };
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, end)) {
    if (!line || line.trimStart().startsWith("#") || /^\s/.test(line)) continue;
    const match = line.match(/^([a-z][a-z0-9-]*):(?:\s*(.*))?$/);
    if (!match)
      failures.push(
        `invalid top-level frontmatter line: ${JSON.stringify(line)}`,
      );
    else fields.set(match[1] ?? "", match[2] ?? "");
  }
  return { fields, failures };
};

export const validate = Effect.fn("Validate.run")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const failures: string[] = [];
  const entries = yield* fs.readDirectory(root);
  const skillNames: string[] = [];
  for (const entry of entries.sort()) {
    const entryInfo = yield* fs.stat(path.join(root, entry));
    if (entryInfo.type !== "Directory") continue;
    const file = path.join(root, entry, "SKILL.md");
    if (!(yield* fs.exists(file))) continue;
    skillNames.push(entry);
    const text = yield* fs.readFileString(file);
    const parsed = frontmatter(text);
    for (const failure of parsed.failures)
      failures.push(`${entry}: ${failure}`);
    const unknown = [...parsed.fields.keys()].filter(
      (key) => !allowedFields.has(key),
    );
    if (unknown.length > 0)
      failures.push(
        `${entry}: unsupported frontmatter fields: ${unknown.sort().join(", ")}`,
      );
    const name = (parsed.fields.get("name") ?? "").replace(/^['"]|['"]$/g, "");
    if (!name) failures.push(`${entry}: missing non-empty name`);
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
      failures.push(`${entry}: invalid skill name: ${JSON.stringify(name)}`);
    else if (name !== entry)
      failures.push(
        `${entry}: name ${JSON.stringify(name)} does not match directory ${JSON.stringify(entry)}`,
      );
    if (!parsed.fields.has("description"))
      failures.push(`${entry}: missing description`);
    for (const match of text.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = (match[1] ?? "").split("#", 1)[0] ?? "";
      if (!target || target.includes("://") || target.startsWith("mailto:"))
        continue;
      if (target.startsWith("/"))
        failures.push(
          `${entry}: absolute Markdown link is not portable: ${target}`,
        );
      else if (!(yield* fs.exists(path.resolve(root, entry, target))))
        failures.push(`${entry}: broken relative Markdown link: ${target}`);
    }
  }
  if (skillNames.length === 0) failures.push("no top-level skills found");
  if (!(yield* fs.exists(path.join(root, "LICENSE"))))
    failures.push("missing repository LICENSE");
  const Catalog = Schema.Struct({
    groupings: Schema.Array(
      Schema.Struct({ skills: Schema.Array(Schema.String) }),
    ),
  });
  const catalogResult = yield* Effect.result(
    fs.readFileString(path.join(root, "skills.sh.json")).pipe(
      Effect.flatMap((text) =>
        Effect.try({
          try: () => JSON.parse(text),
          catch: (cause) => cause,
        }),
      ),
      Effect.flatMap(Schema.decodeUnknownEffect(Catalog)),
    ),
  );
  if (catalogResult._tag === "Failure")
    failures.push(`skills.sh.json: ${String(catalogResult.failure)}`);
  const catalogNames =
    catalogResult._tag === "Success"
      ? catalogResult.success.groupings.flatMap(({ skills }) => skills)
      : [];
  if (new Set(catalogNames).size !== catalogNames.length)
    failures.push("skills.sh.json: a skill appears in more than one grouping");
  const missingCatalog = skillNames.filter(
    (name) => !catalogNames.includes(name),
  );
  const extraCatalog = catalogNames.filter(
    (name) => !skillNames.includes(name),
  );
  if (missingCatalog.length)
    failures.push(
      `skills.sh.json: missing skills: ${missingCatalog.sort().join(", ")}`,
    );
  if (extraCatalog.length)
    failures.push(
      `skills.sh.json: unknown skills: ${extraCatalog.sort().join(", ")}`,
    );
  const portability = yield* fs.readFileString(
    path.join(root, "PORTABILITY.md"),
  );
  const inventory = [...portability.matchAll(/^\| `([^`]+)` \|/gm)].map(
    (match) => match[1] ?? "",
  );
  if (new Set(inventory).size !== inventory.length)
    failures.push("PORTABILITY.md: a skill appears more than once");
  const missingInventory = skillNames.filter(
    (name) => !inventory.includes(name),
  );
  const extraInventory = inventory.filter((name) => !skillNames.includes(name));
  if (missingInventory.length)
    failures.push(
      `PORTABILITY.md: missing skills: ${missingInventory.sort().join(", ")}`,
    );
  if (extraInventory.length)
    failures.push(
      `PORTABILITY.md: unknown skills: ${extraInventory.sort().join(", ")}`,
    );
  const importsResult = yield* Effect.result(readImports(root));
  if (importsResult._tag === "Failure")
    failures.push(`imports.json: ${importsResult.failure.message}`);
  const imports =
    importsResult._tag === "Success"
      ? importsResult.success
      : { version: 1 as const, imports: {} };
  for (const [name, metadata] of Object.entries(imports.imports)) {
    if (
      (metadata.distribution === "wholesale" ||
        metadata.distribution === "official-source") &&
      metadata.localEdits.length !== 0
    )
      failures.push(
        `imports.json: ${name} ${metadata.distribution} import must not declare local edits`,
      );
    if (!metadata.distribution && metadata.localEdits.length === 0)
      failures.push(
        `imports.json: ${name} distributed import must declare local edits`,
      );
    const tracked = trackedSkillPath(root, name, metadata, path);
    if (!(yield* fs.exists(tracked)))
      failures.push(
        `imports.json: missing ${metadata.distribution === "official-source" ? "upstream snapshot" : "skill directory"}: ${name}`,
      );
    if (
      metadata.distribution === "official-source" &&
      (yield* fs.exists(path.join(root, "upstream", name, "SKILL.md")))
    )
      failures.push(`imports.json: ${name} upstream snapshot is discoverable`);
    if (!(yield* fs.exists(tracked))) continue;
    const text = yield* fs.readFileString(tracked);
    const fm = text.split("---", 3)[1] ?? "";
    for (const expected of [
      `# origin: ${metadata.origin}`,
      `# upstream-sha: ${metadata.upstreamSha}`,
      ...(metadata.license ? [`license: ${metadata.license}`] : []),
    ])
      if (!fm.split("\n").includes(expected))
        failures.push(
          `${name}: materialised metadata does not match imports.json`,
        );
    const edits = fm
      .split("\n")
      .filter((line) => line.startsWith("#   - "))
      .map((line) => line.slice(6));
    if (edits.join("\0") !== metadata.localEdits.join("\0"))
      failures.push(
        `${name}: materialised local edits do not match imports.json`,
      );
  }
  for (const name of skillNames) {
    const text = yield* fs.readFileString(path.join(root, name, "SKILL.md"));
    if (
      (text.split("---", 3)[1] ?? "")
        .split("\n")
        .some((line) => line.startsWith("# origin:")) &&
      !imports.imports[name]
    )
      failures.push(`imports.json: missing imports: ${name}`);
  }
  if (failures.length > 0) {
    yield* Console.error(
      `Validation failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`,
    );
    return yield* new ValidationError({ failures });
  }
  yield* Console.log(
    `Validated ${skillNames.length} skills and repository metadata.`,
  );
});
