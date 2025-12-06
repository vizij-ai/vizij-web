import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx,js,jsx}"],
    passWithNoTests: true,
  },
});
