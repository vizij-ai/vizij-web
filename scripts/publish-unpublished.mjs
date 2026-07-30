#!/usr/bin/env node

// Publish every publishable @vizij/* package whose version is not yet on npm.
//
// The decision is per package, driven only by the registry — not by changesets:
// a version present on npm is skipped, a version absent (on an existing package)
// is published, and a package that does not exist on npm at all is reported as
// needing a one-time manual bootstrap (npm's trusted publishing cannot create a
// brand-new package name over OIDC — see the README). One package failing does
// not stop the others; the run fails only if a package that *could* have been
// published did not.
//
// Publishing uses the workspace's trusted-publishing setup: `npm publish` over
// OIDC (no token), with provenance. Internal `workspace:` dependency ranges are
// materialised to real versions for the duration of the publish and restored
// afterwards, reusing scripts/prepare-publish-manifests.mjs.

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyWorkspaceManifestUpdates,
  restoreWorkspaceManifests,
} from "./prepare-publish-manifests.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const PACKAGES_ROOT = path.resolve(REPO_ROOT, "packages/@vizij");

const DRY_RUN = process.argv.includes("--dry-run");

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

async function publishablePackages() {
  const entries = await fs.readdir(PACKAGES_ROOT, { withFileTypes: true });
  const pkgs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgPath = path.resolve(PACKAGES_ROOT, entry.name, "package.json");
    let json;
    try {
      json = JSON.parse(await fs.readFile(pkgPath, "utf8"));
    } catch {
      continue;
    }
    if (json.private === true || !json.name || !json.version) continue;
    pkgs.push({
      name: json.name,
      version: json.version,
      dir: path.dirname(pkgPath),
    });
  }
  return pkgs.sort((a, b) => a.name.localeCompare(b.name));
}

// "published" | "unpublished" | "absent" — the version, the package, or neither.
function registryStatus(name, version) {
  const atVersion = run("npm", ["view", `${name}@${version}`, "version"]);
  if (atVersion.status === 0 && atVersion.stdout.trim()) return "published";
  const anyVersion = run("npm", ["view", name, "version"]);
  return anyVersion.status === 0 ? "unpublished" : "absent";
}

async function main() {
  const pkgs = await publishablePackages();
  console.log(
    `${pkgs.length} publishable @vizij packages${DRY_RUN ? " (dry run)" : ""}.`,
  );

  const results = [];
  const toPublish = [];
  for (const pkg of pkgs) {
    const status = registryStatus(pkg.name, pkg.version);
    if (status === "published") {
      results.push({ pkg, outcome: "skip", note: "already on npm" });
    } else if (status === "absent") {
      results.push({
        pkg,
        outcome: "bootstrap",
        note: "not on npm; needs a one-time manual first publish",
      });
    } else {
      toPublish.push(pkg);
      results.push({ pkg, outcome: DRY_RUN ? "would-publish" : "pending" });
    }
  }

  for (const r of results) {
    const glyph = {
      skip: "=",
      bootstrap: "!",
      "would-publish": "+",
      pending: "+",
    }[r.outcome];
    console.log(
      `${glyph} ${r.pkg.name}@${r.pkg.version} — ${r.outcome}${r.note ? ` (${r.note})` : ""}`,
    );
  }

  if (!DRY_RUN && toPublish.length > 0) {
    const build = run("pnpm", ["run", "build:packages"], { stdio: "inherit" });
    if (build.status !== 0) {
      console.error("build:packages failed; not publishing.");
      process.exit(1);
    }
    await applyWorkspaceManifestUpdates();
    try {
      for (const r of results) {
        if (r.outcome !== "pending") continue;
        console.log(`Publishing ${r.pkg.name}@${r.pkg.version}…`);
        const pub = run(
          "npm",
          ["publish", "--access", "public", "--provenance", "--ignore-scripts"],
          { cwd: r.pkg.dir, stdio: "inherit" },
        );
        r.outcome = pub.status === 0 ? "published" : "failed";
        if (pub.status !== 0) {
          console.error(
            `Failed to publish ${r.pkg.name}@${r.pkg.version} (continuing).`,
          );
        }
      }
    } finally {
      await restoreWorkspaceManifests();
    }
  }

  const by = (o) => results.filter((r) => r.outcome === o);
  console.log("\n=== summary ===");
  console.log(
    `published ${by("published").length} · skipped ${by("skip").length} · ` +
      `bootstrap ${by("bootstrap").length} · failed ${by("failed").length}` +
      (DRY_RUN ? ` · would-publish ${by("would-publish").length}` : ""),
  );
  const bootstrap = by("bootstrap");
  if (bootstrap.length) {
    console.log(
      `\nNeed a one-time manual first publish (trusted publishing cannot create a new package over OIDC):\n` +
        bootstrap.map((r) => `  - ${r.pkg.name}@${r.pkg.version}`).join("\n") +
        `\nSee README → Publishing & Versioning → First publish of a new package.`,
    );
  }
  if (by("failed").length) {
    console.error(`\n${by("failed").length} package(s) failed to publish.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
