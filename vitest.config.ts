import path from "node:path";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const testDb = env.TEST_DATABASE_URL;
  if (!testDb) throw new Error("TEST_DATABASE_URL is required to run tests (it will be wiped)");
  return {
    test: {
      env: { ...env, DATABASE_URL: testDb, NODE_ENV: "test" },
      globalSetup: "./tests/global-setup.ts",
      fileParallelism: false,
      testTimeout: 60_000,
      hookTimeout: 120_000,
      include: ["tests/**/*.test.ts"],
    },
    resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/server-only-stub.ts") } },
  };
});
