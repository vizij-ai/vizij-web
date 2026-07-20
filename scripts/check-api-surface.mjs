#!/usr/bin/env node
/* eslint-env node */
/**
 * Public API surface guard for the core release trio.
 *
 * Compares each package's built `dist/index.d.ts` against the committed
 * snapshot in `api-snapshots/<unscoped-name>.d.ts`. A drift fails the check:
 * an intentional surface change must update the snapshot (`pnpm run
 * api:update`) in the same PR, alongside a changeset, so API changes are
 * explicit and reviewable.
 *
 * Usage:
 *   node scripts/check-api-surface.mjs           # check (CI)
 *   node scripts/check-api-surface.mjs --update  # regenerate snapshots
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PACKAGES = [
  "packages/@vizij/face-core",
  "packages/@vizij/runtime-react",
  "packages/@vizij/render",
];

const update = process.argv.includes("--update");
const snapshotDir = join(repoRoot, "api-snapshots");
let failed = false;

for (const pkgDir of PACKAGES) {
  const pkgJson = JSON.parse(
    readFileSync(join(repoRoot, pkgDir, "package.json"), "utf8"),
  );
  const unscoped = pkgJson.name.replace(/^@[^/]+\//, "");
  const builtPath = join(repoRoot, pkgDir, "dist", "index.d.ts");
  const snapshotPath = join(snapshotDir, `${unscoped}.d.ts`);

  if (!existsSync(builtPath)) {
    console.error(
      `[api-surface] ${pkgJson.name}: missing ${builtPath} — run \`pnpm run build:packages\` first.`,
    );
    failed = true;
    continue;
  }

  const built = readFileSync(builtPath, "utf8");

  if (update) {
    mkdirSync(snapshotDir, { recursive: true });
    writeFileSync(snapshotPath, built);
    console.log(`[api-surface] ${pkgJson.name}: snapshot updated.`);
    continue;
  }

  if (!existsSync(snapshotPath)) {
    console.error(
      `[api-surface] ${pkgJson.name}: no snapshot at ${snapshotPath}. Run \`pnpm run api:update\` and commit it.`,
    );
    failed = true;
    continue;
  }

  const snapshot = readFileSync(snapshotPath, "utf8");
  if (built !== snapshot) {
    failed = true;
    console.error(
      `[api-surface] ${pkgJson.name}: public API surface changed (dist/index.d.ts differs from api-snapshots/${unscoped}.d.ts).`,
    );
    const builtLines = built.split("\n");
    const snapLines = snapshot.split("\n");
    const max = Math.max(builtLines.length, snapLines.length);
    let shown = 0;
    for (let i = 0; i < max && shown < 20; i++) {
      if (builtLines[i] !== snapLines[i]) {
        console.error(`  line ${i + 1}:`);
        console.error(`    - ${snapLines[i] ?? "<end of snapshot>"}`);
        console.error(`    + ${builtLines[i] ?? "<end of built file>"}`);
        shown++;
      }
    }
    console.error(
      "  If this change is intentional, run `pnpm run api:update` and commit the snapshot alongside a changeset.",
    );
  } else {
    console.log(`[api-surface] ${pkgJson.name}: OK`);
  }
}

process.exit(failed ? 1 : 0);
