import { describe, expect, it } from "@effect/vitest";
import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import {
  checkSkillsCatalogue,
  renderSkillsCatalogue,
  writeSkillsCatalogue,
} from "../src/commands/Catalogue.js";
import { parseFrontmatter } from "../src/lib/frontmatter.js";

describe("frontmatter", () => {
  it("parses single-line and folded descriptions", () => {
    const single = parseFrontmatter(
      "---\nname: demo\ndescription: One line description.\n---\n",
    );
    expect(single.failures).toEqual([]);
    expect(single.fields.get("description")).toBe("One line description.");

    const folded = parseFrontmatter(
      [
        "---",
        "name: demo",
        "description: >-",
        "  Create or revise a rule.",
        "  Use when promoting a preference.",
        "---",
        "",
      ].join("\n"),
    );
    expect(folded.failures).toEqual([]);
    expect(folded.fields.get("description")).toBe(
      "Create or revise a rule. Use when promoting a preference.",
    );
  });
});

it.effect("renders and drift-checks the skills catalogue", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({
      prefix: "skill-catalogue-test-",
    });
    yield* fs.makeDirectory(path.join(root, "alpha"));
    yield* fs.writeFileString(
      path.join(root, "alpha", "SKILL.md"),
      "---\nname: alpha\ndescription: First skill.\n---\n",
    );
    yield* fs.makeDirectory(path.join(root, "beta"));
    yield* fs.writeFileString(
      path.join(root, "beta", "SKILL.md"),
      "---\nname: beta\ndescription: >-\n  Second skill.\n  With a fold.\n---\n",
    );
    yield* fs.writeFileString(
      path.join(root, "skills.sh.json"),
      JSON.stringify({
        groupings: [
          {
            title: "Portable",
            description: "General skills.",
            skills: ["alpha", "beta"],
          },
        ],
      }),
    );
    const rendered = yield* renderSkillsCatalogue(root);
    expect(rendered).toContain("# Skills catalogue");
    expect(rendered).toContain("## Portable");
    expect(rendered).toContain("[`alpha`](./alpha/)");
    expect(rendered).toContain("First skill.");
    expect(rendered).toContain("Second skill. With a fold.");
    expect(rendered).toContain("**2**");

    const missing = yield* Effect.result(checkSkillsCatalogue(root));
    expect(missing._tag).toBe("Failure");

    yield* writeSkillsCatalogue(root);
    yield* checkSkillsCatalogue(root);

    yield* fs.writeFileString(
      path.join(root, "SKILLS.md"),
      `${rendered}\nextra\n`,
    );
    const stale = yield* Effect.result(checkSkillsCatalogue(root));
    expect(stale._tag).toBe("Failure");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
