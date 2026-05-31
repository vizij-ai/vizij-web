#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const BUILD_INFO_VERSION = 1;
const BUILD_INFO_FILE = ".build-info.json";

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
    packageName: "vizij-orchestrator-composed",
    wasmFile: "arora_vizij_orchestrator_composed.wasm",
    publicName: "vizij-orchestrator-composed",
  },
];

const COMPATIBILITY_MODULE = {
  packageName: "vizij-orchestrator",
  wasmFile: "arora_vizij_orchestrator.wasm",
  publicName: "vizij-orchestrator",
};

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

function parseArgs(argv) {
  const options = {
    appRoot: ".",
    publicRoot: null,
    engineRoot: process.env.ARORA_ENGINE_PATH ?? null,
    ensure: false,
    includeCompatibility: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--ensure") {
      options.ensure = true;
      continue;
    }
    if (token === "--include-compatibility") {
      options.includeCompatibility = true;
      continue;
    }
    if (token === "--app-root") {
      options.appRoot = requireValue(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--public-root") {
      options.publicRoot = requireValue(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--engine-root") {
      options.engineRoot = requireValue(argv, index, token);
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      printUsage();
      process.exit(0);
    }
    console.error(`[prepare-arora-web] Unknown arg: ${token}`);
    printUsage();
    process.exit(2);
  }

  return options;
}

function requireValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`[prepare-arora-web] ${token} requires a value.`);
    process.exit(2);
  }
  return value;
}

function printUsage() {
  console.error(`Usage:
  node scripts/prepare-arora-web-assets.mjs [--app-root <path>] [--public-root <path>] [--engine-root <path>] [--ensure] [--include-compatibility]

Examples:
  pnpm --filter vizij-authoring prepare:arora-web
  ARORA_ENGINE_PATH=/path/to/engine pnpm --filter demo-vizij-player prepare:arora-web
  `);
}

function resolveFromCwd(value) {
  return path.resolve(process.cwd(), value);
}

function findWorkspaceRoot(start) {
  let current = start;
  while (true) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        `[prepare-arora-web] Could not find pnpm-workspace.yaml above ${start}`,
      );
    }
    current = parent;
  }
}

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

function collectSourceFiles(root, relativePath, files) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return;
  }
  const stat = fs.statSync(absolutePath);
  if (stat.isDirectory()) {
    const baseName = path.basename(relativePath);
    if ([".git", "pkg", "target"].includes(baseName)) {
      return;
    }
    fs.readdirSync(absolutePath)
      .sort((left, right) => left.localeCompare(right))
      .forEach((entry) =>
        collectSourceFiles(root, path.join(relativePath, entry), files),
      );
    return;
  }
  if (stat.isFile()) {
    files.push(relativePath);
  }
}

function computeSourceFingerprint(engineRoot, modules) {
  const files = [];
  ["Cargo.lock", "Cargo.toml", "crates", "modules"].forEach((relativePath) =>
    collectSourceFiles(engineRoot, relativePath, files),
  );

  const hash = crypto.createHash("sha256");
  hash.update(`build-info-version:${BUILD_INFO_VERSION}\n`);
  modules.forEach((moduleInfo) => {
    hash.update(
      `module:${moduleInfo.packageName}:${moduleInfo.wasmFile}:${moduleInfo.publicName}\n`,
    );
  });
  files.sort((left, right) => left.localeCompare(right));
  files.forEach((relativePath) => {
    hash.update(`file:${relativePath}\n`);
    hash.update(fs.readFileSync(path.join(engineRoot, relativePath)));
    hash.update("\n");
  });
  return hash.digest("hex");
}

function readBuildInfo(publicRoot) {
  const buildInfoPath = path.join(publicRoot, BUILD_INFO_FILE);
  if (!fs.existsSync(buildInfoPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(buildInfoPath, "utf8"));
  } catch {
    return null;
  }
}

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
  return header;
}

function moduleIdForHeader(header, moduleInfo) {
  if (typeof header?.id !== "string" || header.id.length === 0) {
    throw new Error(
      `[prepare-arora-web] ${moduleInfo.packageName} module.yaml does not declare a string id.`,
    );
  }
  return header.id;
}

function expectedOutputs(publicRoot, modules) {
  return [
    path.join(publicRoot, BUILD_INFO_FILE),
    path.join(publicRoot, "pkg", "arora_web.js"),
    path.join(publicRoot, "pkg", "arora_web_bg.wasm"),
    path.join(publicRoot, "modules", "manifest.json"),
    ...modules.flatMap((moduleInfo) => [
      path.join(publicRoot, "modules", moduleInfo.publicName, "module.json"),
      path.join(
        publicRoot,
        "modules",
        moduleInfo.publicName,
        moduleInfo.wasmFile,
      ),
    ]),
  ];
}

const options = parseArgs(process.argv.slice(2));
const appRoot = resolveFromCwd(options.appRoot);
const repoRoot = findWorkspaceRoot(appRoot);
const engineRoot = path.resolve(
  options.engineRoot ??
    path.join(repoRoot, "..", "engine-vizij-backend-experiment"),
);
const publicRoot = options.publicRoot
  ? resolveFromCwd(options.publicRoot)
  : path.join(appRoot, "public", "arora-web");
const vizijModules = options.includeCompatibility
  ? [COMPATIBILITY_MODULE, ...VIZIJ_MODULES]
  : VIZIJ_MODULES;

const engineCheckoutExists = fs.existsSync(
  path.join(engineRoot, "crates", "arora-web"),
);

if (
  options.ensure &&
  expectedOutputs(publicRoot, vizijModules).every((file) => fs.existsSync(file))
) {
  if (!engineCheckoutExists) {
    console.log(
      `[prepare-arora-web] existing assets are present at ${publicRoot}; skipping freshness check because no engine checkout was found at ${engineRoot}`,
    );
    process.exit(0);
  }
  const sourceFingerprint = computeSourceFingerprint(engineRoot, vizijModules);
  const buildInfo = readBuildInfo(publicRoot);
  if (
    buildInfo?.version === BUILD_INFO_VERSION &&
    buildInfo?.sourceFingerprint === sourceFingerprint
  ) {
    console.log(
      `[prepare-arora-web] existing assets are fresh at ${publicRoot}`,
    );
    process.exit(0);
  }
  console.log("[prepare-arora-web] existing assets are stale; refreshing");
}

if (!engineCheckoutExists) {
  console.error(
    `[prepare-arora-web] Could not find Arora engine checkout at ${engineRoot}. Set ARORA_ENGINE_PATH=/path/to/engine or pass --engine-root.`,
  );
  process.exit(2);
}

const sourceFingerprint = computeSourceFingerprint(engineRoot, vizijModules);

console.log(`[prepare-arora-web] engine: ${engineRoot}`);
console.log(`[prepare-arora-web] public: ${publicRoot}`);
console.log("[prepare-arora-web] building arora-web package");
run(
  "wasm-pack",
  ["build", "crates/arora-web", "--target", "web", "--dev"],
  engineRoot,
);

for (const moduleInfo of vizijModules) {
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
    engineRoot,
  );
}

copyFile(
  path.join(engineRoot, "crates", "arora-web", "pkg", "arora_web.js"),
  path.join(publicRoot, "pkg", "arora_web.js"),
);
copyFile(
  path.join(engineRoot, "crates", "arora-web", "pkg", "arora_web_bg.wasm"),
  path.join(publicRoot, "pkg", "arora_web_bg.wasm"),
);

const moduleManifest = {
  schemaVersion: 1,
  baseUrl: "/arora-web",
  engine: {
    js: "pkg/arora_web.js",
    wasm: "pkg/arora_web_bg.wasm",
  },
  orchestrators: {},
  modules: {},
};

for (const moduleInfo of vizijModules) {
  copyFile(
    path.join(
      engineRoot,
      "target",
      "wasm32-wasip1",
      "release",
      moduleInfo.wasmFile,
    ),
    path.join(
      publicRoot,
      "modules",
      moduleInfo.publicName,
      moduleInfo.wasmFile,
    ),
  );
  const moduleHeader = writeModuleHeader(
    path.join(engineRoot, "modules", moduleInfo.packageName, "module.yaml"),
    path.join(publicRoot, "modules", moduleInfo.publicName, "module.json"),
  );
  const moduleId = moduleIdForHeader(moduleHeader, moduleInfo);
  moduleManifest.modules[moduleId] = {
    id: moduleId,
    name: moduleInfo.publicName,
    headerUrl: `modules/${moduleInfo.publicName}/module.json`,
    wasmUrl: `modules/${moduleInfo.publicName}/${moduleInfo.wasmFile}`,
  };
  if (moduleInfo.packageName === "vizij-orchestrator") {
    moduleManifest.orchestrators.compatibility = moduleId;
  }
  if (moduleInfo.packageName === "vizij-orchestrator-composed") {
    moduleManifest.orchestrators.composed = moduleId;
  }
}

fs.writeFileSync(
  path.join(publicRoot, "modules", "manifest.json"),
  `${JSON.stringify(moduleManifest, null, 2)}\n`,
);

fs.writeFileSync(
  path.join(publicRoot, BUILD_INFO_FILE),
  `${JSON.stringify(
    {
      version: BUILD_INFO_VERSION,
      sourceFingerprint,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);

console.log(`[prepare-arora-web] wrote assets to ${publicRoot}`);
