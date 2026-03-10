#!/usr/bin/env node
/**
 * rebuild-nodes — one-shot command for after rebuilding WASM packages in vizij-rs.
 *
 * What it does:
 *   1. Re-links ALL @vizij/*-wasm packages (root + every nested workspace symlink)
 *      to the local vizij-rs build, overwriting stale pnpm store symlinks.
 *   2. Deletes all .vite dep-optimisation caches so Vite picks up the fresh WASMs.
 *
 * Usage:
 *   pnpm run rebuild-nodes
 *   pnpm run rebuild-nodes -- --vizij-rs /path/to/vizij-rs
 *
 * After running, restart your dev server.
 */
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_VIZIJ_RS = path.resolve(REPO_ROOT, "..", "vizij-rs");

// ── Parse --vizij-rs flag ──────────────────────────────────────────────────
let vizijRs = process.env.VIZIJ_RS_PATH ?? DEFAULT_VIZIJ_RS;
for (let i = 0; i < process.argv.length - 1; i++) {
  if (process.argv[i] === "--vizij-rs") {
    vizijRs = process.argv[i + 1];
  }
}

// ── 1. Validate vizij-rs layout ────────────────────────────────────────────
if (!fs.existsSync(vizijRs)) {
  console.error(`[rebuild-nodes] vizij-rs not found at: ${vizijRs}`);
  console.error(`[rebuild-nodes] Set VIZIJ_RS_PATH or pass --vizij-rs <path>`);
  process.exit(1);
}
const npmScope = path.join(vizijRs, "npm", "@vizij");
if (!fs.existsSync(npmScope)) {
  console.error(
    `[rebuild-nodes] Could not find ${npmScope}. Is vizij-rs built?`,
  );
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function replaceSymlink(linkPath, targetPath) {
  try {
    const st = fs.lstatSync(linkPath);
    if (!st.isSymbolicLink()) {
      console.warn(`[rebuild-nodes] Skipping non-symlink: ${linkPath}`);
      return;
    }
    fs.unlinkSync(linkPath);
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
  fs.symlinkSync(targetPath, linkPath, "junction");
}

function findSymlinksForPkg(pkgName) {
  const results = [];

  // Root-level
  const root = path.join(REPO_ROOT, "node_modules", "@vizij", pkgName);
  try {
    if (fs.lstatSync(root).isSymbolicLink()) results.push(root);
  } catch {
    /* not present */
  }

  // pnpm virtual store shared link
  const storeShared = path.join(
    REPO_ROOT,
    "node_modules",
    ".pnpm",
    "node_modules",
    "@vizij",
    pkgName,
  );
  try {
    if (fs.lstatSync(storeShared).isSymbolicLink()) results.push(storeShared);
  } catch {
    /* not present */
  }

  // Nested workspace links (apps/* and packages/*)
  for (const topDir of ["apps", "packages"]) {
    const base = path.join(REPO_ROOT, topDir);
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // Direct: apps/vizij-authoring/node_modules/@vizij/<pkg>
      const direct = path.join(
        base,
        entry.name,
        "node_modules",
        "@vizij",
        pkgName,
      );
      try {
        if (fs.lstatSync(direct).isSymbolicLink()) results.push(direct);
      } catch {
        /* not present */
      }
      // Scoped: packages/@vizij/node-graph-react/node_modules/@vizij/<pkg>
      const scoped = path.join(base, entry.name);
      try {
        for (const sub of fs.readdirSync(scoped, { withFileTypes: true })) {
          if (!sub.isDirectory()) continue;
          const deep = path.join(
            scoped,
            sub.name,
            "node_modules",
            "@vizij",
            pkgName,
          );
          try {
            if (fs.lstatSync(deep).isSymbolicLink()) results.push(deep);
          } catch {
            /* not present */
          }
        }
      } catch {
        /* not a directory */
      }
    }
  }

  return results;
}

// ── 2. Link all available packages ─────────────────────────────────────────
console.log("\n[rebuild-nodes] Step 1: Re-linking @vizij/* packages\n");

const availablePkgs = fs
  .readdirSync(npmScope, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

let linkedCount = 0;
for (const pkgName of availablePkgs) {
  const localPath = path.join(npmScope, pkgName);
  const symlinks = findSymlinksForPkg(pkgName);
  if (symlinks.length === 0) continue;
  for (const linkPath of symlinks) {
    console.log(`  ${path.relative(REPO_ROOT, linkPath)} -> (local)`);
    replaceSymlink(linkPath, localPath);
    linkedCount++;
  }
}

console.log(`\n  Total symlinks updated: ${linkedCount}`);

// ── 3. Clear all Vite caches ───────────────────────────────────────────────
console.log("\n[rebuild-nodes] Step 2: Clearing Vite caches\n");

function findViteCaches(dir, results = []) {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.name === ".vite") {
        results.push(fullPath);
      } else if (entry.name !== ".git") {
        findViteCaches(fullPath, results);
      }
    }
  } catch {
    /* permission error or not a dir */
  }
  return results;
}

const viteCaches = findViteCaches(REPO_ROOT);
for (const cacheDir of viteCaches) {
  console.log(`  Removing ${path.relative(REPO_ROOT, cacheDir)}`);
  fs.rmSync(cacheDir, { recursive: true, force: true });
}

if (viteCaches.length === 0) {
  console.log("  No .vite caches found.");
}

// ── Done ───────────────────────────────────────────────────────────────────
console.log(
  "\n[rebuild-nodes] Done. Restart your dev server to pick up the changes.\n",
);
