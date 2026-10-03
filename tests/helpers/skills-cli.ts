import { Layer } from "effect";
import type { CommandExecutor } from "../../src/services/CommandExecutor.js";
import { SkillsCli } from "../../src/services/SkillsCli.js";

/** Provide a fixture executor along with a `SkillsCli` that runs `skills` through it. */
export const withSkillsCli = <E, R>(
  executor: Layer.Layer<CommandExecutor, E, R>,
) => SkillsCli.layerWith("skills").pipe(Layer.provideMerge(executor));
