#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";
import console from "node:console";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptsDir, "..");
const vitestBin = resolve(packageRoot, "node_modules", ".bin", "vitest");

const result = spawnSync(
  vitestBin,
  ["run", "--passWithNoTests", "--testTimeout", "5000"],
  {
    stdio: "inherit",
    cwd: packageRoot,
    env: { ...process.env },
  },
);

if (result.error) {
  console.error("[utils:test] Vitest did not start:", result.error.message);
}
process.exit(result.status ?? 1);
