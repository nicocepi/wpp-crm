import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules", ".next"],
    // Los tests de integración contra Postgres solo corren si hay DB configurada.
    testTimeout: 15000,
  },
});
