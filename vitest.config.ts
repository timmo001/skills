import { defineConfig } from "vitest/config";

export default defineConfig({
  ssr: {
    resolve: { conditions: ["bun", "import", "default"] },
  },
  test: {
    server: { deps: { inline: ["@timmo001/effect-gh"] } },
  },
});
