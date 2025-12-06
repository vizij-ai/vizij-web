#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  applyWorkspaceManifestUpdates,
  restoreWorkspaceManifests,
} from "./prepare-publish-manifests.mjs";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Command "${command} ${args.join(" ")}" exited with ${code}`,
          ),
        );
      }
    });
    child.on("error", reject);
  });
}

async function main() {
  await applyWorkspaceManifestUpdates();
  try {
    await run("pnpm", ["run", "build:packages"]);
    await run("pnpm", ["exec", "changeset", "publish"]);
  } finally {
    await restoreWorkspaceManifests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
