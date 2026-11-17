import { defineConfig } from "vitest/config";

// The "@/..." import alias from tsconfig.json, so tests can load modules that
// use it (the planner's writing pipeline).
export default defineConfig({ resolve: { alias: { "@": process.cwd() } } });
