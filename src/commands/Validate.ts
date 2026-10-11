import { Console, Effect, FileSystem, Path, Result, Schema } from "effect";
import {
  SKILLS_FILE,
  isExternal,
  readSkillsFile,
  renderSkillsFile,
  trackedSkillPath,
} from "../imports/metadata.js";
import { isProvenanceComment } from "../imports/snapshot.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import { checkSkillsCatalogue } from "./Catalogue.js";

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
    const parsed = parseFrontmatter(text);

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
    const description = (parsed.fields.get("description") ?? "").trim();

    if (!description) failures.push(`${entry}: missing description`);

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

  if (Result.isFailure(catalogResult))
    failures.push(`skills.sh.json: ${String(catalogResult.failure)}`);

  const catalogNames = Result.isSuccess(catalogResult)
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
  const skillsResult = yield* Effect.result(readSkillsFile(root));

  if (Result.isFailure(skillsResult))
    failures.push(`${SKILLS_FILE}: ${skillsResult.failure.message}`);
  else if (
    renderSkillsFile(skillsResult.success.file) !== skillsResult.success.text
  )
    failures.push(
      `${SKILLS_FILE}: not in canonical form; run skill-maintenance import <name> --metadata-only to rewrite it`,
    );

  const records = Result.isSuccess(skillsResult)
    ? Object.entries(skillsResult.success.file.skills)
    : [];

  for (const [name, entry] of records) {
    const metadata = entry.import;

    if (!metadata) {
      failures.push(`${SKILLS_FILE}: ${name} has no records`);
      continue;
    }

    if (isExternal(metadata)) {
      if (metadata.localEdits.length !== 0)
        failures.push(
          `${SKILLS_FILE}: ${name} external import must not declare local edits`,
        );

      for (const committed of [name, path.join("upstream", name)])
        if (yield* fs.exists(path.join(root, committed)))
          failures.push(
            `${SKILLS_FILE}: ${name} external import must not be committed at ${committed}/`,
          );
      continue;
    }

    if (metadata.localEdits.length === 0)
      failures.push(
        `${SKILLS_FILE}: ${name} adapted import must declare local edits, or be marked external`,
      );
    const tracked = trackedSkillPath(root, name, path);

    if (!(yield* fs.exists(tracked))) {
      failures.push(`${SKILLS_FILE}: missing skill directory: ${name}`);
      continue;
    }

    const fm = (yield* fs.readFileString(tracked)).split("---", 3)[1] ?? "";

    if (!fm.split("\n").includes(`license: ${metadata.license}`))
      failures.push(`${name}: license does not match ${SKILLS_FILE}`);
  }

  for (const name of skillNames) {
    const text = yield* fs.readFileString(path.join(root, name, "SKILL.md"));

    if ((text.split("---", 3)[1] ?? "").split("\n").some(isProvenanceComment))
      failures.push(
        `${name}: provenance comments belong in ${SKILLS_FILE}, not the frontmatter`,
      );
  }

  if (failures.length === 0) {
    yield* checkSkillsCatalogue(root).pipe(
      Effect.catchTag("CatalogueError", (error) =>
        Effect.sync(() => {
          failures.push(...error.failures);
        }),
      ),
    );
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
