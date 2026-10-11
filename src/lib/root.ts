import { Effect, FileSystem } from "effect";
import { homedir } from "node:os";
import { join } from "node:path";
import { SKILLS_FILE } from "../imports/metadata.js";

/** Find the skills checkout: the working directory, `~/repos/skills`, or the legacy dotfiles path. */
export const resolveSkillsRoot = Effect.fn("resolveSkillsRoot")(function* (
  cwd = process.cwd(),
  home = homedir(),
) {
  const fs = yield* FileSystem.FileSystem;

  const candidates = [
    cwd,
    join(home, "repos", "skills"),
    join(home, ".config", "dotfiles", "agents", ".agents", "skills"),
  ];

  for (const candidate of candidates) {
    if (yield* fs.exists(join(candidate, SKILLS_FILE))) return candidate;
  }

  return cwd;
});
