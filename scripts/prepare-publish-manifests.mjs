#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const PACKAGES_ROOT = path.resolve(REPO_ROOT, "packages/@vizij");
const BACKUP_ROOT = path.resolve(REPO_ROOT, ".release-tmp/workspace-backups");
const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

async function listPackageJsonPaths() {
  let entries = [];
  try {
    entries = await fs.readdir(PACKAGES_ROOT, { withFileTypes: true });
  } catch (error) {
    console.error(`Unable to read packages directory: ${PACKAGES_ROOT}`);
    throw error;
  }
  const paths = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgPath = path.resolve(PACKAGES_ROOT, entry.name, "package.json");
    try {
      await fs.access(pkgPath);
      paths.push(pkgPath);
    } catch {
      continue;
    }
  }
  return paths;
}

function materializeRange(range, depName, versions) {
  if (typeof range !== "string" || !range.startsWith("workspace:")) {
    return null;
  }
  const spec = range.slice("workspace:".length);
  const version = versions.get(depName);
  if (spec === "" || spec === "*") {
    if (!version) {
      throw new Error(
        `Cannot resolve version for ${depName} referenced as workspace:*`,
      );
    }
    return version;
  }
  if (spec === "^" || spec === "~") {
    if (!version) {
      throw new Error(
        `Cannot resolve version for ${depName} referenced as workspace:${spec}`,
      );
    }
    return `${spec}${version}`;
  }
  return spec;
}

function rewriteManifest(pkgJson, versions) {
  let changed = false;
  for (const field of DEP_FIELDS) {
    const deps = pkgJson[field];
    if (!deps) continue;
    for (const [depName, depRange] of Object.entries(deps)) {
      const replacement = materializeRange(depRange, depName, versions);
      if (replacement && replacement !== depRange) {
        deps[depName] = replacement;
        changed = true;
      }
    }
  }
  return changed;
}

async function backupFile(absPath, contents) {
  const relPath = path.relative(REPO_ROOT, absPath);
  const backupPath = path.resolve(BACKUP_ROOT, relPath);
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  await fs.writeFile(backupPath, contents, "utf8");
}

async function applyWorkspaceManifestUpdates() {
  await fs.rm(BACKUP_ROOT, { recursive: true, force: true });
  await fs.mkdir(BACKUP_ROOT, { recursive: true });

  const packagePaths = await listPackageJsonPaths();
  const manifests = [];
  const versions = new Map();

  for (const pkgPath of packagePaths) {
    const raw = await fs.readFile(pkgPath, "utf8");
    const json = JSON.parse(raw);
    manifests.push({ path: pkgPath, json, raw });
    versions.set(json.name, json.version);
  }

  for (const manifest of manifests) {
    await backupFile(manifest.path, manifest.raw);
    const updated = rewriteManifest(manifest.json, versions);
    if (updated) {
      await fs.writeFile(
        manifest.path,
        `${JSON.stringify(manifest.json, null, 2)}\n`,
        "utf8",
      );
    }
  }
}

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

async function restoreWorkspaceManifests() {
  try {
    await fs.access(BACKUP_ROOT);
  } catch {
    return;
  }
  const backupFiles = await collectFiles(BACKUP_ROOT);
  for (const backupFile of backupFiles) {
    const rel = path.relative(BACKUP_ROOT, backupFile);
    const dest = path.resolve(REPO_ROOT, rel);
    const contents = await fs.readFile(backupFile, "utf8");
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, contents, "utf8");
  }
  await fs.rm(BACKUP_ROOT, { recursive: true, force: true });
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (invokedDirectly) {
  const mode = process.argv[2];
  if (mode === "apply") {
    await applyWorkspaceManifestUpdates();
  } else if (mode === "restore") {
    await restoreWorkspaceManifests();
  } else {
    console.error("Usage: node prepare-publish-manifests.mjs <apply|restore>");
    process.exit(1);
  }
}

export { applyWorkspaceManifestUpdates, restoreWorkspaceManifests };
