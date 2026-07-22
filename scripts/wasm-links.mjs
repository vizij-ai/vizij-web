#!/usr/bin/env node
/**
 * Local link/unlink/status helper for the sibling vizij-rs npm packages.
 *
 * Why this exists:
 * - `vizij-rs` publishes `@vizij/*-wasm` + support packages from `vizij-rs/npm/@vizij/*`
 * - For local development we want to point `vizij-web` at those packages via `pnpm link --global`
 * - We want a single entrypoint to: link/unlink/select packages, and verify status after each action.
 *
 * Safety goals:
 * - Never implicitly commits anything.
 * - Warn if lockfile/manifest changes occur so you can discard them.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_VIZIJ_RS = path.resolve(REPO_ROOT, "..", "vizij-rs");

const ALL_PACKAGES = [
  "animation-module",
  "animation",
  "runtime",
  "node-graph-wasm",
  "value-json",
  "wasm-loader",
  "test-fixtures",
];

function printUsage(exitCode = 0) {
  const text = `
Usage:
  pnpm run wasm:status
  pnpm run wasm:link -- --pkgs "<csv|space-separated>" [--vizij-rs <path>]
  pnpm run wasm:unlink -- --pkgs "<csv|space-separated>" [--vizij-rs <path>]

Examples:
  pnpm run wasm:status
  pnpm run wasm:link -- --pkgs "node-graph-wasm runtime"
  WASM_PKGS="graph runtime" pnpm run wasm:link
  pnpm run wasm:unlink -- --pkgs "all"

Notes:
  - Packages are names without the scope. e.g. "node-graph-wasm" maps to "@vizij/node-graph-wasm".
  - By default, expects sibling repo at: ${DEFAULT_VIZIJ_RS}
  - Linking uses direct symlinks under vizij-web/node_modules/@vizij/* (no pnpm global linking).
  - This script always prints a status summary after link/unlink.
`.trim();
  // eslint-disable-next-line no-console
  console.log(text);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = {
    command: null,
    pkgsRaw: process.env.WASM_PKGS ?? "",
    vizijRs: process.env.VIZIJ_RS_PATH ?? DEFAULT_VIZIJ_RS,
    verifyClean: process.env.WASM_VERIFY_CLEAN ?? "1",
    install: process.env.WASM_RUN_INSTALL ?? "0",
  };

  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help" || token === "-h") printUsage(0);
    // pnpm sometimes forwards a literal "--" into node scripts; treat it as a separator.
    if (token === "--") continue;
    if (!token.startsWith("-")) {
      positional.push(token);
      continue;
    }
    if (token === "--pkgs") {
      args.pkgsRaw = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--vizij-rs") {
      args.vizijRs = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (token === "--no-verify-clean") {
      args.verifyClean = "0";
      continue;
    }
    if (token === "--install") {
      args.install = "1";
      continue;
    }

    // eslint-disable-next-line no-console
    console.error(`[wasm-links] Unknown arg: ${token}`);
    printUsage(2);
  }

  args.command = positional[0] ?? null;
  return args;
}

function normalizePackageToken(token) {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  if (t === "all" || t === "*") return "all";
  if (t === "graph") return "node-graph-wasm";
  if (t === "node-graph") return "node-graph-wasm";
  if (t === "fixtures") return "test-fixtures";
  return t;
}

function parsePackages(pkgsRaw) {
  if (!pkgsRaw) return [];
  const parts = pkgsRaw
    .split(/[,\s]+/g)
    .map((p) => normalizePackageToken(p))
    .filter(Boolean);

  if (parts.includes("all")) return [...ALL_PACKAGES];

  const unknown = parts.filter((p) => !ALL_PACKAGES.includes(p));
  if (unknown.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `[wasm-links] Unknown package(s): ${unknown.join(
        ", ",
      )}. Expected one of: ${ALL_PACKAGES.join(", ")}`,
    );
    process.exit(2);
  }

  // De-dupe while preserving order
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

function run(cmd, cmdArgs, { cwd = REPO_ROOT, allowFailure = false } = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    process.exit(result.status ?? 1);
  }
  return result.status ?? 0;
}

function getGitStatusPorcelain() {
  const result = spawnSync("git", ["status", "--porcelain=v1"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  if (result.status !== 0) return null;
  return result.stdout.trim().split("\n").filter(Boolean);
}

function assertVizijRsLayout(vizijRsPath) {
  const pkgDir = path.join(vizijRsPath, "npm", "@vizij");
  if (!fs.existsSync(vizijRsPath)) {
    // eslint-disable-next-line no-console
    console.error(`[wasm-links] vizij-rs path does not exist: ${vizijRsPath}`);
    process.exit(2);
  }
  if (!fs.existsSync(pkgDir)) {
    // eslint-disable-next-line no-console
    console.error(
      `[wasm-links] Could not find ${pkgDir}. Provide --vizij-rs <path> pointing to the vizij-rs repo root.`,
    );
    process.exit(2);
  }
  return pkgDir;
}

function resolveNodeModulesPackageDir(pkgName) {
  // pnpm may keep packages nested under the workspace that depends on them,
  // so `node_modules/@vizij/<pkg>` might not exist even though the package is installed.
  //
  // First, try the direct workspace root symlink (when present).
  const direct = path.join(REPO_ROOT, "node_modules", "@vizij", pkgName);
  if (fs.existsSync(direct)) {
    try {
      const stat = fs.lstatSync(direct);
      if (stat.isSymbolicLink()) return fs.realpathSync(direct);
      return direct;
    } catch {
      // fall through
    }
  }

  // Next, locate via pnpm's lock: `node_modules/.pnpm/@vizij+<pkg>@.../node_modules/@vizij/<pkg>`.
  const storeRoot = path.join(REPO_ROOT, "node_modules", ".pnpm");
  if (!fs.existsSync(storeRoot)) return null;

  const prefix = `@vizij+${pkgName}@`;
  const entries = fs
    .readdirSync(storeRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith(prefix))
    .map((d) => d.name)
    // Prefer a stable deterministic pick if multiple versions exist.
    .sort()
    .reverse();

  for (const entry of entries) {
    const candidate = path.join(
      storeRoot,
      entry,
      "node_modules",
      "@vizij",
      pkgName,
    );
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function statusForPackage(pkgName, vizijRsPath) {
  const nodeModulesResolved = resolveNodeModulesPackageDir(pkgName);
  const expectedLocalPrefix = path.join(vizijRsPath, "npm", "@vizij", pkgName);
  const expectedLocal = fs.existsSync(expectedLocalPrefix);

  if (!nodeModulesResolved) {
    return {
      pkgName,
      state: "missing",
      resolvedPath: null,
      isLocal: false,
      expectedLocalPath: expectedLocal ? expectedLocalPrefix : null,
    };
  }

  const isLocal =
    expectedLocal &&
    nodeModulesResolved.startsWith(path.resolve(expectedLocalPrefix));

  return {
    pkgName,
    state: isLocal ? "local" : "registry",
    resolvedPath: nodeModulesResolved,
    isLocal,
    expectedLocalPath: expectedLocalPrefix,
  };
}

function printStatus(pkgs, vizijRsPath) {
  const rows = pkgs.map((pkgName) => statusForPackage(pkgName, vizijRsPath));
  const pad = (s, n) => `${s}`.padEnd(n, " ");

  const header = `${pad("package", 22)} ${pad("status", 9)} resolved`;
  // eslint-disable-next-line no-console
  console.log(`\n[wasm-links] Link status (vizij-rs: ${vizijRsPath})`);
  // eslint-disable-next-line no-console
  console.log(header);
  // eslint-disable-next-line no-console
  console.log("-".repeat(header.length));
  for (const row of rows) {
    // eslint-disable-next-line no-console
    console.log(
      `${pad(row.pkgName, 22)} ${pad(row.state, 9)} ${row.resolvedPath ?? "-"}`,
    );
  }
  // eslint-disable-next-line no-console
  console.log("");
  return rows;
}

function ensureVizijScopeDir() {
  const scopeDir = path.join(REPO_ROOT, "node_modules", "@vizij");
  fs.mkdirSync(scopeDir, { recursive: true });
  return scopeDir;
}

function ensureNodeModulesInstalled() {
  if (!fs.existsSync(path.join(REPO_ROOT, "node_modules"))) {
    // eslint-disable-next-line no-console
    console.error(
      "[wasm-links] Missing node_modules/. Run `pnpm install` before linking.",
    );
    process.exit(2);
  }
}

function resolvePnpmStorePackageDir(pkgName) {
  const storeRoot = path.join(REPO_ROOT, "node_modules", ".pnpm");
  if (!fs.existsSync(storeRoot)) return null;

  const prefix = `@vizij+${pkgName}@`;
  const entries = fs
    .readdirSync(storeRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith(prefix))
    .map((d) => d.name)
    .sort()
    .reverse();

  for (const entry of entries) {
    const candidate = path.join(
      storeRoot,
      entry,
      "node_modules",
      "@vizij",
      pkgName,
    );
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function ensurePnpmStoreSymlink(scopeDir, pkgName) {
  const linkPath = path.join(scopeDir, pkgName);
  if (fs.existsSync(linkPath)) return;
  const storeDir = resolvePnpmStorePackageDir(pkgName);
  if (!storeDir) return;
  try {
    fs.symlinkSync(storeDir, linkPath, "junction");
  } catch {
    // ignore; it's just a convenience link
  }
}

function replaceSymlink(linkPath, targetPath) {
  try {
    const st = fs.lstatSync(linkPath);
    if (!st.isSymbolicLink()) {
      // eslint-disable-next-line no-console
      console.error(
        `[wasm-links] Refusing to overwrite non-symlink at ${linkPath}.`,
      );
      process.exit(2);
    }
    fs.unlinkSync(linkPath);
  } catch (err) {
    if (err && typeof err === "object" && err.code === "ENOENT") {
      // ok
    } else if (err) {
      throw err;
    }
  }

  fs.symlinkSync(targetPath, linkPath, "junction");
}

/**
 * Find all nested node_modules/@vizij/<pkgName> symlinks that pnpm created
 * inside workspace packages/apps (i.e. not under the root node_modules or .pnpm).
 */
function findNestedWorkspaceSymlinks(pkgName) {
  const results = [];
  const workspaceDirs = ["apps", "packages"];
  for (const dir of workspaceDirs) {
    const base = path.join(REPO_ROOT, dir);
    if (!fs.existsSync(base)) continue;
    // Walk two levels: dir/<pkg> and dir/<scope>/<pkg>
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(
        base,
        entry.name,
        "node_modules",
        "@vizij",
        pkgName,
      );
      try {
        const st = fs.lstatSync(candidate);
        if (st.isSymbolicLink()) results.push(candidate);
      } catch {
        // not present
      }
      // Also handle scoped packages like packages/@vizij/node-graph-react
      const scoped = path.join(base, entry.name);
      try {
        for (const sub of fs.readdirSync(scoped, { withFileTypes: true })) {
          if (!sub.isDirectory()) continue;
          const deepCandidate = path.join(
            scoped,
            sub.name,
            "node_modules",
            "@vizij",
            pkgName,
          );
          try {
            const st = fs.lstatSync(deepCandidate);
            if (st.isSymbolicLink()) results.push(deepCandidate);
          } catch {
            // not present
          }
        }
      } catch {
        // not a directory
      }
    }
  }
  return results;
}

function linkDirect(pkgsToLink, vizijRsPath) {
  ensureNodeModulesInstalled();
  const scopeDir = ensureVizijScopeDir();

  for (const pkgName of pkgsToLink) {
    const localPath = path.join(vizijRsPath, "npm", "@vizij", pkgName);
    if (!fs.existsSync(localPath)) {
      // eslint-disable-next-line no-console
      console.error(`[wasm-links] Missing local package: ${localPath}`);
      process.exit(2);
    }

    // Root-level link
    const linkPath = path.join(scopeDir, pkgName);
    ensurePnpmStoreSymlink(scopeDir, pkgName);
    // eslint-disable-next-line no-console
    console.log(`[wasm-links] Symlink ${linkPath} -> ${localPath}`);
    replaceSymlink(linkPath, localPath);

    // Nested workspace links that pnpm created per-package
    for (const nested of findNestedWorkspaceSymlinks(pkgName)) {
      // eslint-disable-next-line no-console
      console.log(`[wasm-links] Symlink (nested) ${nested} -> ${localPath}`);
      replaceSymlink(nested, localPath);
    }
  }
}

function unlinkDirect(pkgsToUnlink) {
  ensureNodeModulesInstalled();
  const scopeDir = ensureVizijScopeDir();

  for (const pkgName of pkgsToUnlink) {
    const storeTarget = resolvePnpmStorePackageDir(pkgName);

    // Root-level link
    const linkPath = path.join(scopeDir, pkgName);
    try {
      const st = fs.lstatSync(linkPath);
      if (!st.isSymbolicLink()) {
        // eslint-disable-next-line no-console
        console.warn(
          `[wasm-links] Skipping ${pkgName}: not a symlink at ${linkPath}`,
        );
      } else {
        // eslint-disable-next-line no-console
        console.log(`[wasm-links] Removing symlink ${linkPath}`);
        fs.unlinkSync(linkPath);
        ensurePnpmStoreSymlink(scopeDir, pkgName);
      }
    } catch (err) {
      if (err && typeof err === "object" && err.code === "ENOENT") {
        // eslint-disable-next-line no-console
        console.warn(`[wasm-links] Skipping ${pkgName}: not present`);
      } else {
        throw err;
      }
    }

    // Restore nested workspace links back to the pnpm store
    for (const nested of findNestedWorkspaceSymlinks(pkgName)) {
      if (!storeTarget) {
        // eslint-disable-next-line no-console
        console.warn(
          `[wasm-links] No pnpm store target to restore for ${nested}`,
        );
        continue;
      }
      // eslint-disable-next-line no-console
      console.log(
        `[wasm-links] Restoring (nested) ${nested} -> ${storeTarget}`,
      );
      replaceSymlink(nested, storeTarget);
    }
  }
}

function maybeRunInstall(installFlag) {
  if (installFlag !== "1") return;
  // eslint-disable-next-line no-console
  console.log(
    "[wasm-links] pnpm install (requested via --install / WASM_RUN_INSTALL=1)",
  );
  run("pnpm", ["install"], { cwd: REPO_ROOT });
}

function warnIfDirty(verifyCleanFlag) {
  if (verifyCleanFlag !== "1") return;
  const lines = getGitStatusPorcelain();
  if (!lines) return;
  const relevant = lines.filter(
    (l) =>
      l.includes("pnpm-lock.yaml") ||
      l.includes("package.json") ||
      l.includes("pnpm-workspace.yaml"),
  );
  if (relevant.length === 0) return;

  // eslint-disable-next-line no-console
  console.warn("[wasm-links] WARNING: repo has changes after this operation:");
  for (const l of relevant) {
    // eslint-disable-next-line no-console
    console.warn(`  ${l}`);
  }
  // eslint-disable-next-line no-console
  console.warn(
    "[wasm-links] If these are only local-link artifacts, discard them before committing.",
  );
}

const args = parseArgs(process.argv.slice(2));
const pkgs = parsePackages(args.pkgsRaw);

if (!args.command) printUsage(2);

if (args.command === "status") {
  const vizijPkgDir = assertVizijRsLayout(args.vizijRs);
  // status doesn’t actually need vizijPkgDir beyond verifying path exists
  void vizijPkgDir;
  printStatus(ALL_PACKAGES, args.vizijRs);
  process.exit(0);
}

if (args.command === "relink") {
  // Re-apply nested symlinks for any package whose root link already points local.
  // Designed for use as a postinstall hook — pnpm install resets nested symlinks.
  if (!fs.existsSync(args.vizijRs)) {
    // vizij-rs not present (CI / other developer) – silently skip
    process.exit(0);
  }
  assertVizijRsLayout(args.vizijRs);
  const locallyLinked = ALL_PACKAGES.filter((pkgName) => {
    const rootLink = path.join(REPO_ROOT, "node_modules", "@vizij", pkgName);
    try {
      const st = fs.lstatSync(rootLink);
      if (!st.isSymbolicLink()) return false;
      const target = fs.readlinkSync(rootLink);
      const localPath = path.join(args.vizijRs, "npm", "@vizij", pkgName);
      return (
        path.resolve(target).toLowerCase() ===
        path.resolve(localPath).toLowerCase()
      );
    } catch {
      return false;
    }
  });
  if (locallyLinked.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      "[wasm-links] relink: no locally-linked packages detected, skipping.",
    );
    process.exit(0);
  }
  // eslint-disable-next-line no-console
  console.log(
    `[wasm-links] relink: restoring nested links for: ${locallyLinked.join(", ")}`,
  );
  linkDirect(locallyLinked, args.vizijRs);
  process.exit(0);
}

if (args.command === "link") {
  if (pkgs.length === 0) pkgs.push(...ALL_PACKAGES);
  assertVizijRsLayout(args.vizijRs);
  linkDirect(pkgs, args.vizijRs);
  maybeRunInstall(args.install);
  printStatus(pkgs, args.vizijRs);
  warnIfDirty(args.verifyClean);
  process.exit(0);
}

if (args.command === "unlink") {
  if (pkgs.length === 0) pkgs.push(...ALL_PACKAGES);
  assertVizijRsLayout(args.vizijRs);
  unlinkDirect(pkgs);
  maybeRunInstall(args.install);
  printStatus(pkgs, args.vizijRs);
  warnIfDirty(args.verifyClean);
  process.exit(0);
}

// eslint-disable-next-line no-console
console.error(`[wasm-links] Unknown command: ${args.command}`);
printUsage(2);
