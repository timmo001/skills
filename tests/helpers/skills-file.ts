import { Effect, FileSystem, Path } from "effect";
import {
  type ImportMetadata,
  SKILLS_FILE,
  renderSkillsFile,
} from "../../src/imports/metadata.js";

/** Write a canonical `skills.yml` fixture holding these imports. */
export const writeImportsFixture = Effect.fn("Test.writeImportsFixture")(
  function* (root: string, imports: Readonly<Record<string, ImportMetadata>>) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    yield* fs.writeFileString(
      path.join(root, SKILLS_FILE),
      renderSkillsFile({
        skills: Object.fromEntries(
          Object.entries(imports).map(([name, metadata]) => [
            name,
            { import: metadata },
          ]),
        ),
      }),
    );
  },
);
