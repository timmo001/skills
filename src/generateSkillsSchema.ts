import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem } from "effect";
import {
  MetadataError,
  SKILLS_SCHEMA_FILE,
  renderSkillsSchema,
} from "./imports/metadata.js";

Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const schema = renderSkillsSchema();

  if (process.argv.includes("--check")) {
    if (
      !(yield* fs.exists(SKILLS_SCHEMA_FILE)) ||
      (yield* fs.readFileString(SKILLS_SCHEMA_FILE)) !== schema
    )
      return yield* new MetadataError({
        operation: "schema.check",
        message: `${SKILLS_SCHEMA_FILE} is stale; run mise run schema`,
      });
    yield* Console.log(`${SKILLS_SCHEMA_FILE} is current`);
  } else yield* fs.writeFileString(SKILLS_SCHEMA_FILE, schema);
}).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
