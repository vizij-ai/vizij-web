import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageDir = fileURLToPath(new URL(".", import.meta.url));
const studioSupportSrc = resolve(packageDir, "../studio-support/src");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@vizij/studio-support",
        replacement: studioSupportSrc,
      },
      {
        find: /^@vizij\/studio-support\/(.*)$/,
        replacement: `${studioSupportSrc}/$1`,
      },
    ],
  },
});
