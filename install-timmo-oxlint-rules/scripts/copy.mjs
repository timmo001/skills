#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const [runner, ...copyArguments] = process.argv.slice(2);
const packageName = "@timmo001/oxlint-rules";
const commands = {
  bun: ["bunx", packageName, "copy", ...copyArguments],
  npm: [
    "npm",
    "exec",
    "--yes",
    `--package=${packageName}`,
    "--",
    "oxlint-rules",
    "copy",
    ...copyArguments,
  ],
  pnpm: ["pnpm", "dlx", packageName, "copy", ...copyArguments],
  yarn: ["yarn", "dlx", packageName, "copy", ...copyArguments],
};

const command = commands[runner];
if (!command) {
  console.error("Usage: copy.mjs <bun|npm|pnpm|yarn> <destination> [--force]");
  process.exit(1);
}

const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
