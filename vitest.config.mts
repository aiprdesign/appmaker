import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // Database tests share one PostgreSQL and flip site-wide switches, so
    // files run one at a time when a test database is configured.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
