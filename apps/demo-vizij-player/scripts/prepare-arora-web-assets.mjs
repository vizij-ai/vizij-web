#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const APP_ROOT = path.resolve(import.meta.dirname, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "../..");
const DEFAULT_ENGINE_ROOT = path.resolve(
  REPO_ROOT,
  "..",
  "engine-vizij-backend-experiment",
);
const ENGINE_ROOT = path.resolve(
  process.env.ARORA_ENGINE_PATH ?? DEFAULT_ENGINE_ROOT,
);
const PUBLIC_ROOT = path.join(APP_ROOT, "public", "arora-web");
const VIZIJ_MODULES = [
  {
    packageName: "vizij-orchestrator",
    wasmFile: "arora_vizij_orchestrator.wasm",
    publicName: "vizij-orchestrator",
  },
  {
    packageName: "vizij-orchestrator-composed",
    wasmFile: "arora_vizij_orchestrator_composed.wasm",
    publicName: "vizij-orchestrator-composed",
  },
];

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

if (!fs.existsSync(path.join(ENGINE_ROOT, "crates", "arora-web"))) {
  console.error(
    `[prepare-arora-web] Could not find Arora engine checkout at ${ENGINE_ROOT}. Set ARORA_ENGINE_PATH=/path/to/engine.`,
  );
  process.exit(2);
}

console.log(`[prepare-arora-web] engine: ${ENGINE_ROOT}`);
console.log("[prepare-arora-web] building arora-web package");
run(
  "wasm-pack",
  ["build", "crates/arora-web", "--target", "web", "--dev"],
  ENGINE_ROOT,
);

for (const moduleInfo of VIZIJ_MODULES) {
  console.log(
    `[prepare-arora-web] building stripped ${moduleInfo.packageName} guest wasm`,
  );
  run(
    "cargo",
    [
      "+nightly",
      "rustc",
      "-p",
      moduleInfo.packageName,
      "--target",
      "wasm32-wasip1",
      "--release",
      "--",
      "-C",
      "strip=debuginfo",
    ],
    ENGINE_ROOT,
  );
}

copyFile(
  path.join(ENGINE_ROOT, "crates", "arora-web", "pkg", "arora_web.js"),
  path.join(PUBLIC_ROOT, "pkg", "arora_web.js"),
);
copyFile(
  path.join(ENGINE_ROOT, "crates", "arora-web", "pkg", "arora_web_bg.wasm"),
  path.join(PUBLIC_ROOT, "pkg", "arora_web_bg.wasm"),
);
for (const moduleInfo of VIZIJ_MODULES) {
  copyFile(
    path.join(
      ENGINE_ROOT,
      "target",
      "wasm32-wasip1",
      "release",
      moduleInfo.wasmFile,
    ),
    path.join(
      PUBLIC_ROOT,
      "modules",
      moduleInfo.publicName,
      moduleInfo.wasmFile,
    ),
  );
}

console.log(`[prepare-arora-web] wrote assets to ${PUBLIC_ROOT}`);
