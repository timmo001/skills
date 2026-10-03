import { Effect, FileSystem } from "effect";
import { homedir } from "node:os";
import { join } from "node:path";

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
    if (yield* fs.exists(join(candidate, "imports.json"))) return candidate;
  }

  return cwd;
});
