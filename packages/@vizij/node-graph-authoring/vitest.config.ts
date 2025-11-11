import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL(".", import.meta.url));
const utilsSrc = resolve(packageDir, "../utils/src");

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: [
      {
        find: "@vizij/utils",
        replacement: utilsSrc,
      },
      {
        find: /^@vizij\/utils\/(.*)$/,
        replacement: `${utilsSrc}/$1`,
      },
    ],
  },
});
