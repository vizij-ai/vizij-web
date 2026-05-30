#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

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
    packageName: "vizij-animation",
    wasmFile: "vizij_animation.wasm",
    publicName: "vizij-animation",
  },
  {
    packageName: "vizij-node-graph",
    wasmFile: "vizij_node_graph.wasm",
    publicName: "vizij-node-graph",
  },
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

const PRIMITIVE_TYPE_IDS = new Map([
  ["unit", "00000000-0000-0000-0000-000000000000"],
  ["boolean", "00000000-0000-0000-0000-000000000001"],
  ["bool", "00000000-0000-0000-0000-000000000001"],
  ["i8", "00000000-0000-0000-0000-000000000002"],
  ["i16", "00000000-0000-0000-0000-000000000003"],
  ["i32", "00000000-0000-0000-0000-000000000004"],
  ["i64", "00000000-0000-0000-0000-000000000005"],
  ["u8", "00000000-0000-0000-0000-000000000006"],
  ["u16", "00000000-0000-0000-0000-000000000007"],
  ["u32", "00000000-0000-0000-0000-000000000008"],
  ["u64", "00000000-0000-0000-0000-000000000009"],
  ["f32", "00000000-0000-0000-0000-00000000000a"],
  ["f64", "00000000-0000-0000-0000-00000000000b"],
  ["str", "00000000-0000-0000-0000-00000000000c"],
  ["string", "00000000-0000-0000-0000-00000000000c"],
]);

function normalizeHeaderAliases(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeHeaderAliases);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      normalizeHeaderAliases(child),
    ]),
  );
  if (
    normalized.kind === "scalar" &&
    typeof normalized.id === "string" &&
    PRIMITIVE_TYPE_IDS.has(normalized.id)
  ) {
    normalized.id = PRIMITIVE_TYPE_IDS.get(normalized.id);
  }
  return normalized;
}

function writeModuleHeader(srcYaml, destJson) {
  fs.mkdirSync(path.dirname(destJson), { recursive: true });
  const header = normalizeHeaderAliases(
    parseYaml(fs.readFileSync(srcYaml, "utf8")),
  );
  fs.writeFileSync(destJson, `${JSON.stringify(header, null, 2)}\n`);
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
  writeModuleHeader(
    path.join(ENGINE_ROOT, "modules", moduleInfo.packageName, "module.yaml"),
    path.join(PUBLIC_ROOT, "modules", moduleInfo.publicName, "module.json"),
  );
}

console.log(`[prepare-arora-web] wrote assets to ${PUBLIC_ROOT}`);
