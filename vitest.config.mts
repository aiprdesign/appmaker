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
    // Database tests hash passwords, set up the schema and call local servers: shared CI
    // machines can take longer than the 5-second default.
    testTimeout: process.env.TEST_DATABASE_URL ? 20_000 : 5_000,
  },
});
