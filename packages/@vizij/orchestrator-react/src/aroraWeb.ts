import { ModuleFacadeOrchestratorRuntime } from "./moduleFacade";
import type {
  AroraWebInitInput,
  AroraWebModuleArtifact,
  AroraWebModuleExports,
  AroraWebModuleRegistry,
  AroraWebModuleRegistryManifest,
  AroraWebOrchestratorModule,
  AroraWebPreloadModule,
  AroraWebPreloadModuleName,
  CreateOrchOptions,
  OrchestratorDebugInfo,
  OrchestratorFrame,
} from "./types";
import type {
  ModuleFacadeRequest,
  ModuleFacadeResponse,
  ModuleFacadeTransport,
} from "./moduleFacade";

const DEFAULT_ARORA_WEB_URL = "/arora-web/pkg/arora_web.js";
const DEFAULT_ARORA_WEB_WASM_URL = "/arora-web/pkg/arora_web_bg.wasm";
const DEFAULT_MODULE_REGISTRY_MANIFEST_URL = "/arora-web/modules/manifest.json";
const DEFAULT_VIZIJ_ORCHESTRATOR_WASM_URL =
  "/arora-web/modules/vizij-orchestrator/arora_vizij_orchestrator.wasm";
const DEFAULT_VIZIJ_ORCHESTRATOR_HEADER_URL =
  "/arora-web/modules/vizij-orchestrator/module.json";
const DEFAULT_VIZIJ_ORCHESTRATOR_COMPOSED_WASM_URL =
  "/arora-web/modules/vizij-orchestrator-composed/arora_vizij_orchestrator_composed.wasm";
const DEFAULT_VIZIJ_ORCHESTRATOR_COMPOSED_HEADER_URL =
  "/arora-web/modules/vizij-orchestrator-composed/module.json";
const DEFAULT_VIZIJ_ANIMATION_WASM_URL =
  "/arora-web/modules/vizij-animation/vizij_animation.wasm";
const DEFAULT_VIZIJ_ANIMATION_HEADER_URL =
  "/arora-web/modules/vizij-animation/module.json";
const DEFAULT_VIZIJ_NODE_GRAPH_WASM_URL =
  "/arora-web/modules/vizij-node-graph/vizij_node_graph.wasm";
const DEFAULT_VIZIJ_NODE_GRAPH_HEADER_URL =
  "/arora-web/modules/vizij-node-graph/module.json";

type AroraWebEngine = InstanceType<AroraWebModuleExports["Engine"]>;

type AroraHeaderExport = {
  type?: unknown;
  id?: unknown;
  name?: unknown;
  parameters?: unknown;
};

type AroraHeaderParameter = {
  id?: unknown;
  name?: unknown;
};

type AroraHeaderImport = {
  type?: unknown;
  module?: unknown;
  id?: unknown;
  name?: unknown;
};

type AroraWebModulePreset = {
  header?: object;
  headerJson?: string | object;
  headerUrl?: string | URL;
  wasmBytes?: Uint8Array | ArrayBuffer;
  wasmUrl?: string | URL;
};

type AroraWebDispatchBinding = {
  dispatchFunctionId: string;
  requestParamId: string;
};

type ResolvedAroraWebModule = AroraWebDispatchBinding & {
  header: object;
  headerJson: string;
  wasmBytes?: Uint8Array | ArrayBuffer;
  wasmUrl: string | URL;
};

type AroraWebDebugModuleInfo = {
  id: string | null;
  name: string | null;
  wasmUrl: string | null;
  engineModuleId: string | null;
};

type AroraWebDebugInstance = {
  backend: "aroraWeb";
  orchestratorModule: AroraWebOrchestratorModule;
  moduleRegistryUrl: string | null;
  selectedModule: AroraWebDebugModuleInfo;
  preloadedModules: AroraWebDebugModuleInfo[];
  dispatchCount: number;
  facadeCallCounts: Record<string, number>;
  lastFacadeCall: string | null;
  lastFacadeRequests: Record<string, string>;
  lastDispatchFunctionId: string | null;
  lastRequestParamId: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};

type AroraWebDebugState = {
  latestInstanceId: string | null;
  instances: Record<string, AroraWebDebugInstance>;
};

type GlobalWithAroraWebDebug = typeof globalThis & {
  __VIZIJ_MEMORY_INVESTIGATION__?: { enabled?: boolean };
  __VIZIJ_RUNTIME_DEBUG__?: boolean;
  __vizijAroraWebDebugState?: AroraWebDebugState;
};

const VIZIJ_ORCHESTRATOR_MODULE_ID = "144358c2-b7e0-414d-8755-56d7ac03f811";
const VIZIJ_ORCHESTRATOR_COMPOSED_MODULE_ID =
  "580d9cef-88be-4f1c-b649-f87032acd8fe";
const VIZIJ_ANIMATION_MODULE_ID = "aa32e080-b002-428c-9994-6143aab3bf08";
const VIZIJ_NODE_GRAPH_MODULE_ID = "098bd478-8375-4f3a-b649-d64cb1284944";

const VIZIJ_ORCHESTRATOR_MODULE_REGISTRY_KEYS: Record<
  AroraWebOrchestratorModule,
  string
> = {
  compatibility: "vizij-orchestrator",
  composed: "vizij-orchestrator-composed",
};

const DEFAULT_ARORA_WEB_ORCHESTRATOR_MODULE: AroraWebOrchestratorModule =
  "composed";

let aroraWebDebugInstanceSequence = 0;

const VIZIJ_ORCHESTRATOR_MODULE_PRESETS: Record<
  AroraWebOrchestratorModule,
  AroraWebModulePreset
> = {
  compatibility: {
    headerUrl: DEFAULT_VIZIJ_ORCHESTRATOR_HEADER_URL,
    wasmUrl: DEFAULT_VIZIJ_ORCHESTRATOR_WASM_URL,
  },
  composed: {
    headerUrl: DEFAULT_VIZIJ_ORCHESTRATOR_COMPOSED_HEADER_URL,
    wasmUrl: DEFAULT_VIZIJ_ORCHESTRATOR_COMPOSED_WASM_URL,
  },
};

const VIZIJ_PRELOAD_MODULE_PRESETS: Record<
  AroraWebPreloadModuleName,
  AroraWebModulePreset
> = {
  "vizij-animation": {
    headerUrl: DEFAULT_VIZIJ_ANIMATION_HEADER_URL,
    wasmUrl: DEFAULT_VIZIJ_ANIMATION_WASM_URL,
  },
  "vizij-node-graph": {
    headerUrl: DEFAULT_VIZIJ_NODE_GRAPH_HEADER_URL,
    wasmUrl: DEFAULT_VIZIJ_NODE_GRAPH_WASM_URL,
  },
};

const DEFAULT_MODULE_REGISTRY: AroraWebModuleRegistry = {
  [VIZIJ_ORCHESTRATOR_MODULE_ID]: {
    headerUrl: DEFAULT_VIZIJ_ORCHESTRATOR_HEADER_URL,
    wasmUrl: DEFAULT_VIZIJ_ORCHESTRATOR_WASM_URL,
  },
  "vizij-orchestrator": {
    headerUrl: DEFAULT_VIZIJ_ORCHESTRATOR_HEADER_URL,
    wasmUrl: DEFAULT_VIZIJ_ORCHESTRATOR_WASM_URL,
  },
  [VIZIJ_ORCHESTRATOR_COMPOSED_MODULE_ID]: {
    headerUrl: DEFAULT_VIZIJ_ORCHESTRATOR_COMPOSED_HEADER_URL,
    wasmUrl: DEFAULT_VIZIJ_ORCHESTRATOR_COMPOSED_WASM_URL,
  },
  "vizij-orchestrator-composed": {
    headerUrl: DEFAULT_VIZIJ_ORCHESTRATOR_COMPOSED_HEADER_URL,
    wasmUrl: DEFAULT_VIZIJ_ORCHESTRATOR_COMPOSED_WASM_URL,
  },
  [VIZIJ_ANIMATION_MODULE_ID]: "vizij-animation",
  "vizij-animation": "vizij-animation",
  [VIZIJ_NODE_GRAPH_MODULE_ID]: "vizij-node-graph",
  "vizij-node-graph": "vizij-node-graph",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeConfig(input?: unknown): AroraWebInitInput {
  if (!isRecord(input)) {
    return {};
  }
  return input as AroraWebInitInput;
}

function selectedModulePreset(
  config: AroraWebInitInput,
  registry: AroraWebModuleRegistry,
): AroraWebModulePreset {
  const moduleName =
    config.orchestratorModule ?? DEFAULT_ARORA_WEB_ORCHESTRATOR_MODULE;
  const registryKey = VIZIJ_ORCHESTRATOR_MODULE_REGISTRY_KEYS[moduleName];
  const registryPreset = modulePresetFromInput(registry[registryKey]);
  const preset =
    registryPreset ?? VIZIJ_ORCHESTRATOR_MODULE_PRESETS[moduleName];
  if (!preset) {
    throw new Error(
      `Unsupported aroraWeb orchestratorModule: ${String(moduleName)}`,
    );
  }
  return preset;
}

async function loadAroraWebModule(
  config: AroraWebInitInput,
): Promise<AroraWebModuleExports> {
  if (config.aroraWeb) {
    return typeof config.aroraWeb === "function"
      ? await config.aroraWeb()
      : config.aroraWeb;
  }

  const moduleUrl = config.aroraWebUrl ?? DEFAULT_ARORA_WEB_URL;
  const response = await fetchImpl(config)(moduleUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to load arora-web module: ${response.status} ${response.statusText}`,
    );
  }
  const blobUrl = URL.createObjectURL(
    new Blob([await response.text()], { type: "text/javascript" }),
  );
  try {
    return (await import(/* @vite-ignore */ blobUrl)) as AroraWebModuleExports;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

async function initAroraWeb(
  module: AroraWebModuleExports,
  initInput: unknown,
): Promise<void> {
  const init = module.default ?? module.init;
  if (typeof init === "function") {
    await init(initInput);
  }
}

function fetchImpl(config: AroraWebInitInput): typeof fetch {
  if (config.fetch) {
    return config.fetch;
  }
  const candidate =
    typeof globalThis !== "undefined" ? globalThis.fetch : undefined;
  if (typeof candidate !== "function") {
    throw new Error(
      "aroraWeb backend needs fetch or explicit wasmBytes/headerJson inputs.",
    );
  }
  return candidate.bind(globalThis) as typeof fetch;
}

function defaultAroraWebInitInput(config: AroraWebInitInput): unknown {
  if (config.aroraWebInitInput !== undefined) {
    return config.aroraWebInitInput;
  }
  if (config.aroraWeb) {
    return undefined;
  }
  const moduleUrl = config.aroraWebUrl ?? DEFAULT_ARORA_WEB_URL;
  if (typeof URL === "undefined") {
    return { module_or_path: DEFAULT_ARORA_WEB_WASM_URL };
  }
  const baseUrl =
    typeof globalThis.location === "undefined"
      ? "http://localhost/"
      : globalThis.location.href;
  return {
    module_or_path: new URL(
      "arora_web_bg.wasm",
      new URL(moduleUrl, baseUrl),
    ).toString(),
  };
}

function parseHeaderJson(headerJson: string, source: string): object {
  try {
    const parsed = JSON.parse(headerJson);
    if (!isRecord(parsed)) {
      throw new Error("header root is not an object");
    }
    return parsed;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to parse aroraWeb module header from ${source}: ${detail}`,
    );
  }
}

function loadHeaderObjectFromInput(
  config: AroraWebInitInput,
  preset: AroraWebModulePreset,
): object | null {
  if (typeof config.headerJson === "string") {
    return parseHeaderJson(config.headerJson, "headerJson");
  }
  if (config.headerJson) {
    return config.headerJson;
  }
  const presetHeaderJson = preset.headerJson;
  if (!config.headerUrl && typeof presetHeaderJson === "string") {
    return parseHeaderJson(presetHeaderJson, "module registry headerJson");
  }
  if (!config.headerUrl && isRecord(presetHeaderJson)) {
    return presetHeaderJson;
  }
  if (!config.headerUrl && preset.header) {
    return preset.header;
  }
  return null;
}

async function fetchHeaderObject(
  config: AroraWebInitInput,
  headerUrl: string | URL,
  label: string,
): Promise<object> {
  const response = await fetchImpl(config)(headerUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to load ${label}: ${response.status} ${response.statusText}`,
    );
  }
  return parseHeaderJson(await response.text(), String(headerUrl));
}

async function loadHeaderObject(
  config: AroraWebInitInput,
  preset: AroraWebModulePreset,
): Promise<object> {
  const header = loadHeaderObjectFromInput(config, preset);
  if (header) {
    return header;
  }
  const headerUrl = config.headerUrl ?? preset.headerUrl;
  if (headerUrl) {
    return fetchHeaderObject(config, headerUrl, "aroraWeb module header");
  }
  throw new Error("aroraWeb module needs a headerJson/headerUrl.");
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function aroraWebDebugGlobal(): GlobalWithAroraWebDebug {
  return globalThis as GlobalWithAroraWebDebug;
}

function isAroraWebDebugEnabled(): boolean {
  const globalObj = aroraWebDebugGlobal();
  return Boolean(
    globalObj.__VIZIJ_RUNTIME_DEBUG__ ||
      globalObj.__VIZIJ_MEMORY_INVESTIGATION__?.enabled,
  );
}

function updateAroraWebDebugState(
  instanceId: string,
  updater: (instance: AroraWebDebugInstance) => void,
): void {
  if (!isAroraWebDebugEnabled()) {
    return;
  }
  const globalObj = aroraWebDebugGlobal();
  if (!globalObj.__vizijAroraWebDebugState) {
    globalObj.__vizijAroraWebDebugState = {
      latestInstanceId: null,
      instances: {},
    };
  }
  const state = globalObj.__vizijAroraWebDebugState;
  const instance = state.instances[instanceId];
  if (!instance) {
    return;
  }
  updater(instance);
  instance.updatedAtMs = nowMs();
}

function setAroraWebDebugInstance(
  instanceId: string,
  instance: AroraWebDebugInstance,
): void {
  if (!isAroraWebDebugEnabled()) {
    return;
  }
  const globalObj = aroraWebDebugGlobal();
  if (!globalObj.__vizijAroraWebDebugState) {
    globalObj.__vizijAroraWebDebugState = {
      latestInstanceId: null,
      instances: {},
    };
  }
  globalObj.__vizijAroraWebDebugState.instances[instanceId] = instance;
  globalObj.__vizijAroraWebDebugState.latestInstanceId = instanceId;
}

function facadeCallFromRequestJson(requestJson: string): string | null {
  try {
    const request = JSON.parse(requestJson) as { call?: unknown };
    return stringField(request.call);
  } catch {
    return null;
  }
}

function moduleInfoFromHeader(
  header: object,
  wasmUrl: string | URL,
  engineModuleId: string | null,
): AroraWebDebugModuleInfo {
  return {
    id: stringField((header as { id?: unknown }).id),
    name: stringField((header as { name?: unknown }).name),
    wasmUrl: String(wasmUrl),
    engineModuleId,
  };
}

function supportsDeltaFrames(
  header: object,
  orchestratorModule: AroraWebOrchestratorModule,
): boolean {
  const id = stringField((header as { id?: unknown }).id);
  const name = stringField((header as { name?: unknown }).name);
  if (
    id === VIZIJ_ORCHESTRATOR_COMPOSED_MODULE_ID ||
    name === "vizij-orchestrator-composed"
  ) {
    return true;
  }
  if (orchestratorModule !== "composed") {
    return false;
  }
  const importedModuleIds = new Set(
    functionImports(header)
      .map((importValue) => stringField(importValue.module))
      .filter((moduleId): moduleId is string => Boolean(moduleId)),
  );
  return (
    importedModuleIds.has(VIZIJ_ANIMATION_MODULE_ID) ||
    importedModuleIds.has(VIZIJ_NODE_GRAPH_MODULE_ID)
  );
}

function isUnsupportedStepDeltaError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return (
    message.includes("orchestrator.stepDelta") &&
    /unsupported|unknown|unrecognized|not found|not implemented|no such|does not support/i.test(
      message,
    )
  );
}

function functionExports(header: object): AroraHeaderExport[] {
  const exportsValue = (header as { exports?: unknown }).exports;
  if (!Array.isArray(exportsValue)) {
    return [];
  }
  return exportsValue.filter(isRecord) as AroraHeaderExport[];
}

function parametersFor(exportValue: AroraHeaderExport): AroraHeaderParameter[] {
  if (!Array.isArray(exportValue.parameters)) {
    return [];
  }
  return exportValue.parameters.filter(isRecord) as AroraHeaderParameter[];
}

function functionImports(header: object): AroraHeaderImport[] {
  const importsValue = (header as { imports?: unknown }).imports;
  if (!Array.isArray(importsValue)) {
    return [];
  }
  return importsValue.filter(isRecord) as AroraHeaderImport[];
}

function preloadPreset(
  moduleInput: AroraWebPreloadModule,
): AroraWebModulePreset | null {
  const presetName =
    typeof moduleInput === "string" ? moduleInput : moduleInput.preset;
  if (!presetName) {
    return null;
  }
  const preset = VIZIJ_PRELOAD_MODULE_PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unsupported aroraWeb preload module: ${presetName}`);
  }
  return preset;
}

function modulePresetFromInput(
  moduleInput: AroraWebPreloadModule | undefined,
): AroraWebModulePreset | null {
  if (!moduleInput) {
    return null;
  }
  if (typeof moduleInput === "string") {
    return preloadPreset(moduleInput);
  }
  const preset = preloadPreset(moduleInput);
  return {
    ...(preset ?? {}),
    ...moduleInput,
  };
}

function isAbsoluteUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function rootRelativeDirname(value: string): string | null {
  if (!value.startsWith("/")) {
    return null;
  }
  const index = value.lastIndexOf("/");
  return index >= 0 ? value.slice(0, index + 1) : "/";
}

function joinRootRelativeUrl(baseUrl: string, relativeUrl: string): string {
  return `${ensureTrailingSlash(baseUrl)}${relativeUrl}`;
}

function browserBaseUrl(): string {
  return typeof globalThis.location === "undefined"
    ? "http://localhost/"
    : globalThis.location.href;
}

function resolveManifestRelativeUrl(
  value: string | URL | undefined,
  manifestUrl: string | URL,
  manifestBaseUrl?: string | URL,
): string | URL | undefined {
  if (!value || value instanceof URL) {
    return value;
  }
  if (value.startsWith("/") || isAbsoluteUrl(value)) {
    return value;
  }

  if (manifestBaseUrl) {
    const baseUrl = String(manifestBaseUrl);
    if (baseUrl.startsWith("/")) {
      return joinRootRelativeUrl(baseUrl, value);
    }
    if (isAbsoluteUrl(baseUrl)) {
      return new URL(value, ensureTrailingSlash(baseUrl)).toString();
    }
  }

  const manifestUrlText = String(manifestUrl);
  const rootRelativeBase = rootRelativeDirname(manifestUrlText);
  if (rootRelativeBase) {
    return joinRootRelativeUrl(rootRelativeBase, value);
  }
  return new URL(value, new URL(manifestUrlText, browserBaseUrl())).toString();
}

function manifestEntryToArtifact(
  key: string,
  value: unknown,
  manifestUrl: string | URL,
  manifestBaseUrl?: string | URL,
): AroraWebModuleArtifact & { id?: string; name?: string } {
  if (!isRecord(value)) {
    throw new Error(`Invalid aroraWeb module registry entry for ${key}.`);
  }
  const id = stringField(value.id) ?? key;
  const name = stringField(value.name) ?? undefined;
  const preset = stringField(value.preset) ?? undefined;
  const headerUrl = resolveManifestRelativeUrl(
    stringField(value.headerUrl) ?? undefined,
    manifestUrl,
    manifestBaseUrl,
  );
  const wasmUrl = resolveManifestRelativeUrl(
    stringField(value.wasmUrl) ?? undefined,
    manifestUrl,
    manifestBaseUrl,
  );
  const headerJson = value.headerJson;
  return {
    ...(preset ? { preset: preset as AroraWebPreloadModuleName } : {}),
    ...(typeof headerJson === "string" || isRecord(headerJson)
      ? { headerJson }
      : {}),
    ...(headerUrl ? { headerUrl } : {}),
    ...(wasmUrl ? { wasmUrl } : {}),
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
  };
}

function manifestModuleEntries(
  manifest: AroraWebModuleRegistryManifest,
): Array<[string, unknown]> {
  if (Array.isArray(manifest.modules)) {
    return manifest.modules.map((entry) => [entry.id, entry]);
  }
  if (isRecord(manifest.modules)) {
    return Object.entries(manifest.modules);
  }
  return [];
}

function moduleRegistryFromManifest(
  manifest: AroraWebModuleRegistryManifest,
  manifestUrl: string | URL,
): AroraWebModuleRegistry {
  const registry: AroraWebModuleRegistry = {};
  for (const [key, rawEntry] of manifestModuleEntries(manifest)) {
    const entry = manifestEntryToArtifact(
      key,
      rawEntry,
      manifestUrl,
      manifest.baseUrl,
    );
    registry[key] = entry;
    if (entry.id) {
      registry[entry.id] = entry;
    }
    if (entry.name) {
      registry[entry.name] = entry;
    }
  }

  if (isRecord(manifest.orchestrators)) {
    for (const [alias, moduleId] of Object.entries(manifest.orchestrators)) {
      if (typeof moduleId !== "string") {
        continue;
      }
      const moduleInput = registry[moduleId];
      if (moduleInput) {
        registry[alias] = moduleInput;
        const registryKey =
          VIZIJ_ORCHESTRATOR_MODULE_REGISTRY_KEYS[
            alias as AroraWebOrchestratorModule
          ];
        if (registryKey) {
          registry[registryKey] = moduleInput;
        }
      }
    }
  }

  return registry;
}

function parseModuleRegistryManifest(
  manifestJson: string,
  source: string,
): AroraWebModuleRegistryManifest {
  try {
    const parsed = JSON.parse(manifestJson);
    if (!isRecord(parsed)) {
      throw new Error("manifest root is not an object");
    }
    return parsed as AroraWebModuleRegistryManifest;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to parse aroraWeb module registry manifest from ${source}: ${detail}`,
    );
  }
}

function shouldLoadModuleRegistryManifest(config: AroraWebInitInput): boolean {
  if (config.moduleRegistryUrl === false) {
    return false;
  }
  if (config.moduleRegistryUrl !== undefined) {
    return true;
  }
  return (
    (config.headerJson === undefined && config.headerUrl === undefined) ||
    (config.wasmBytes === undefined && config.wasmUrl === undefined)
  );
}

async function fetchModuleRegistryManifest(
  config: AroraWebInitInput,
): Promise<AroraWebModuleRegistry> {
  if (!shouldLoadModuleRegistryManifest(config)) {
    return {};
  }
  const manifestUrl =
    config.moduleRegistryUrl ?? DEFAULT_MODULE_REGISTRY_MANIFEST_URL;
  if (manifestUrl === false) {
    return {};
  }
  const strict = config.moduleRegistryUrl !== undefined;
  let response: Response;
  try {
    response = await fetchImpl(config)(manifestUrl);
  } catch (err) {
    if (!strict) {
      return {};
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load aroraWeb module registry manifest: ${detail}`,
    );
  }
  if (!response.ok) {
    if (!strict && response.status === 404) {
      return {};
    }
    throw new Error(
      `Failed to load aroraWeb module registry manifest: ${response.status} ${response.statusText}`,
    );
  }
  const manifest = parseModuleRegistryManifest(
    await response.text(),
    String(manifestUrl),
  );
  return moduleRegistryFromManifest(manifest, manifestUrl);
}

async function moduleRegistry(
  config: AroraWebInitInput,
): Promise<AroraWebModuleRegistry> {
  const manifestRegistry = await fetchModuleRegistryManifest(config);
  return {
    ...DEFAULT_MODULE_REGISTRY,
    ...manifestRegistry,
    ...(config.moduleRegistry ?? {}),
  };
}

function defaultPreloadModulesForHeader(
  header: object,
  registry: AroraWebModuleRegistry,
): AroraWebPreloadModule[] {
  const modules: AroraWebPreloadModule[] = [];
  const seen = new Set<string>();
  for (const importValue of functionImports(header)) {
    const moduleId = stringField(importValue.module);
    const moduleInput = moduleId ? registry[moduleId] : undefined;
    if (!moduleId) {
      continue;
    }
    if (!moduleInput) {
      throw new Error(
        `No aroraWeb module registry entry for imported module ${moduleId}`,
      );
    }
    if (seen.has(moduleId)) {
      continue;
    }
    modules.push(moduleInput);
    seen.add(moduleId);
  }
  return modules;
}

function resolveDispatchBinding(
  header: object,
  config: AroraWebInitInput,
): AroraWebDispatchBinding {
  const dispatchExport =
    functionExports(header).find((exportValue) => {
      return (
        stringField(exportValue.name) === "dispatch_json" &&
        stringField(exportValue.id)
      );
    }) ??
    functionExports(header).find((exportValue) => {
      return (
        stringField(exportValue.type) === "function" &&
        stringField(exportValue.id)
      );
    });

  const dispatchFunctionId =
    config.dispatchFunctionId ?? stringField(dispatchExport?.id);
  if (!dispatchFunctionId) {
    throw new Error(
      'aroraWeb module header does not declare a "dispatch_json" function id.',
    );
  }

  const requestParam =
    dispatchExport &&
    (parametersFor(dispatchExport).find((param) => {
      return (
        stringField(param.name) === "request_json" && stringField(param.id)
      );
    }) ??
      parametersFor(dispatchExport).find((param) => stringField(param.id)));
  const requestParamId = config.requestParamId ?? stringField(requestParam?.id);
  if (!requestParamId) {
    throw new Error(
      'aroraWeb module header does not declare a "request_json" parameter id.',
    );
  }

  return { dispatchFunctionId, requestParamId };
}

async function resolveAroraWebModule(
  config: AroraWebInitInput,
  registry: AroraWebModuleRegistry,
): Promise<ResolvedAroraWebModule> {
  const preset = selectedModulePreset(config, registry);
  const header = await loadHeaderObject(config, preset);
  const binding = resolveDispatchBinding(header, config);
  const wasmUrl = config.wasmUrl ?? preset.wasmUrl;
  if (!wasmUrl) {
    throw new Error("aroraWeb module needs a wasmUrl or wasmBytes.");
  }
  return {
    ...binding,
    header,
    headerJson: JSON.stringify(header),
    ...(preset.wasmBytes ? { wasmBytes: preset.wasmBytes } : {}),
    wasmUrl,
  };
}

type ResolvedAroraWebPreloadModule = {
  header: object;
  headerJson: string;
  wasmUrl: string | URL;
  wasmBytes?: Uint8Array | ArrayBuffer;
};

async function loadPreloadHeaderObject(
  config: AroraWebInitInput,
  moduleInput: AroraWebPreloadModule,
  preset: AroraWebModulePreset | null,
): Promise<object> {
  if (typeof moduleInput === "string") {
    if (preset?.header) {
      return preset.header;
    }
    if (preset?.headerJson) {
      return typeof preset.headerJson === "string"
        ? parseHeaderJson(preset.headerJson, "preloadModules.headerJson")
        : preset.headerJson;
    }
    if (preset?.headerUrl) {
      return fetchHeaderObject(
        config,
        preset.headerUrl,
        "aroraWeb preload module header",
      );
    }
    throw new Error(
      "aroraWeb preload module needs a preset or explicit headerJson/headerUrl.",
    );
  }
  if (typeof moduleInput.headerJson === "string") {
    return parseHeaderJson(moduleInput.headerJson, "preloadModules.headerJson");
  }
  if (moduleInput.headerJson) {
    return moduleInput.headerJson;
  }
  if (moduleInput.headerUrl) {
    return fetchHeaderObject(
      config,
      moduleInput.headerUrl,
      "aroraWeb preload module header",
    );
  }
  if (preset?.headerJson) {
    return typeof preset.headerJson === "string"
      ? parseHeaderJson(preset.headerJson, "preloadModules.headerJson")
      : preset.headerJson;
  }
  if (preset?.header) {
    return preset.header;
  }
  if (preset?.headerUrl) {
    return fetchHeaderObject(
      config,
      preset.headerUrl,
      "aroraWeb preload module header",
    );
  }
  throw new Error(
    "aroraWeb preload module needs a preset or explicit headerJson/headerUrl.",
  );
}

async function resolvePreloadModules(
  config: AroraWebInitInput,
  selectedHeader: object,
  registry: AroraWebModuleRegistry,
): Promise<ResolvedAroraWebPreloadModule[]> {
  const modules = Array.isArray(config.preloadModules)
    ? config.preloadModules
    : defaultPreloadModulesForHeader(selectedHeader, registry);
  const resolved: ResolvedAroraWebPreloadModule[] = [];
  for (const moduleInput of modules) {
    const preset = preloadPreset(moduleInput);
    const header = await loadPreloadHeaderObject(config, moduleInput, preset);
    const moduleConfig =
      typeof moduleInput === "string" ? undefined : moduleInput;
    const wasmUrl = moduleConfig?.wasmUrl ?? preset?.wasmUrl;
    if (!wasmUrl) {
      throw new Error(
        "aroraWeb preload module needs a preset or explicit wasmUrl.",
      );
    }
    resolved.push({
      header,
      headerJson: JSON.stringify(header),
      wasmUrl,
      ...(moduleConfig?.wasmBytes ? { wasmBytes: moduleConfig.wasmBytes } : {}),
    });
  }
  return resolved;
}

function bytesFrom(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

async function loadWasmBytes(
  config: AroraWebInitInput,
  wasmUrl: string | URL,
  wasmBytes?: Uint8Array | ArrayBuffer,
  options: { useGlobalWasmBytes?: boolean } = {},
): Promise<Uint8Array> {
  const explicitBytes =
    wasmBytes ?? (options.useGlobalWasmBytes ? config.wasmBytes : undefined);
  if (explicitBytes) {
    return bytesFrom(explicitBytes);
  }

  const response = await fetchImpl(config)(wasmUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to load aroraWeb module wasm: ${response.status} ${response.statusText}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function preloadModules(
  engine: AroraWebEngine,
  config: AroraWebInitInput,
  selectedHeader: object,
  registry: AroraWebModuleRegistry,
): Promise<AroraWebDebugModuleInfo[]> {
  const modules = await resolvePreloadModules(config, selectedHeader, registry);
  const loadedModules: AroraWebDebugModuleInfo[] = [];
  for (const moduleConfig of modules) {
    const wasmBytes = await loadWasmBytes(
      config,
      moduleConfig.wasmUrl,
      moduleConfig.wasmBytes,
      { useGlobalWasmBytes: false },
    );
    const engineModuleId = loadModule(
      engine,
      moduleConfig.headerJson,
      wasmBytes,
    );
    loadedModules.push(
      moduleInfoFromHeader(
        moduleConfig.header,
        moduleConfig.wasmUrl,
        engineModuleId,
      ),
    );
  }
  return loadedModules;
}

function loadModule(
  engine: AroraWebEngine,
  headerJson: string,
  wasmBytes: Uint8Array,
): string {
  const load =
    typeof engine.loadModule === "function"
      ? engine.loadModule.bind(engine)
      : typeof engine.load_module === "function"
        ? engine.load_module.bind(engine)
        : null;
  if (!load) {
    throw new Error("arora-web Engine does not expose loadModule().");
  }
  return load(headerJson, wasmBytes);
}

class AroraWebModuleFacade implements ModuleFacadeTransport {
  private readonly engine: AroraWebEngine;
  private readonly moduleId: string;
  private readonly dispatchFunctionId: string;
  private readonly requestParamId: string;
  private readonly debugInstanceId: string;

  constructor(
    engine: AroraWebEngine,
    moduleId: string,
    binding: AroraWebDispatchBinding,
    debugInstanceId: string,
  ) {
    this.engine = engine;
    this.moduleId = moduleId;
    this.dispatchFunctionId = binding.dispatchFunctionId;
    this.requestParamId = binding.requestParamId;
    this.debugInstanceId = debugInstanceId;
  }

  dispatch<TResult = unknown, TArgs = unknown>(
    request: ModuleFacadeRequest<TArgs>,
  ): ModuleFacadeResponse<TResult> {
    return JSON.parse(
      this.dispatchJson(JSON.stringify(request)),
    ) as ModuleFacadeResponse<TResult>;
  }

  dispatchJson(requestJson: string): string {
    if (isAroraWebDebugEnabled()) {
      const facadeCall = facadeCallFromRequestJson(requestJson);
      updateAroraWebDebugState(this.debugInstanceId, (instance) => {
        instance.dispatchCount += 1;
        if (facadeCall) {
          instance.lastFacadeCall = facadeCall;
          instance.lastFacadeRequests[facadeCall] = requestJson;
          instance.facadeCallCounts[facadeCall] =
            (instance.facadeCallCounts[facadeCall] ?? 0) + 1;
        }
        instance.lastDispatchFunctionId = this.dispatchFunctionId;
        instance.lastRequestParamId = this.requestParamId;
      });
    }
    const callJson = JSON.stringify({
      module_id: this.moduleId,
      id: this.dispatchFunctionId,
      args: [
        {
          id: this.requestParamId,
          value: { str: requestJson },
        },
      ],
    });
    const result = JSON.parse(this.engine.call(callJson)) as {
      ret?: { str?: unknown };
    };
    const responseJson = result.ret?.str;
    if (typeof responseJson !== "string") {
      throw new Error("arora-web dispatch_json did not return a string ret.");
    }
    return responseJson;
  }
}

export class AroraWebOrchestratorRuntime extends ModuleFacadeOrchestratorRuntime {
  private readonly useDeltaFrames: boolean;
  private readonly debugInstanceId: string;
  private stepDeltaAvailable: boolean;
  private deltaFrameVersion: number | undefined;

  constructor(
    facade: ModuleFacadeTransport,
    options: { debugInstanceId?: string; useDeltaFrames?: boolean } = {},
  ) {
    super(facade);
    this.useDeltaFrames = options.useDeltaFrames === true;
    this.stepDeltaAvailable = this.useDeltaFrames;
    this.debugInstanceId = options.debugInstanceId ?? "";
  }

  static async create(
    opts?: CreateOrchOptions,
    initInput?: unknown,
  ): Promise<AroraWebOrchestratorRuntime> {
    const config = normalizeConfig(initInput);
    const orchestratorModule =
      config.orchestratorModule ?? DEFAULT_ARORA_WEB_ORCHESTRATOR_MODULE;
    const module = await loadAroraWebModule(config);
    await initAroraWeb(module, defaultAroraWebInitInput(config));

    const registry = await moduleRegistry(config);
    const selectedModule = await resolveAroraWebModule(config, registry);
    const wasmBytes = await loadWasmBytes(
      config,
      selectedModule.wasmUrl,
      selectedModule.wasmBytes,
      {
        useGlobalWasmBytes: true,
      },
    );
    if (typeof module.Engine !== "function") {
      throw new Error("arora-web module does not expose Engine.");
    }
    const engine = new module.Engine();
    const preloadedModules = await preloadModules(
      engine,
      config,
      selectedModule.header,
      registry,
    );
    const moduleId = loadModule(engine, selectedModule.headerJson, wasmBytes);
    const debugInstanceId = `arora-web:${aroraWebDebugInstanceSequence++}`;
    const timestamp = nowMs();
    setAroraWebDebugInstance(debugInstanceId, {
      backend: "aroraWeb",
      orchestratorModule,
      moduleRegistryUrl:
        config.moduleRegistryUrl === false
          ? null
          : String(
              config.moduleRegistryUrl ?? DEFAULT_MODULE_REGISTRY_MANIFEST_URL,
            ),
      selectedModule: moduleInfoFromHeader(
        selectedModule.header,
        selectedModule.wasmUrl,
        moduleId,
      ),
      preloadedModules,
      dispatchCount: 0,
      facadeCallCounts: {},
      lastFacadeCall: null,
      lastFacadeRequests: {},
      lastDispatchFunctionId: null,
      lastRequestParamId: null,
      createdAtMs: timestamp,
      updatedAtMs: timestamp,
    });

    const runtime = new AroraWebOrchestratorRuntime(
      new AroraWebModuleFacade(
        engine,
        moduleId,
        selectedModule,
        debugInstanceId,
      ),
      {
        debugInstanceId,
        useDeltaFrames: supportsDeltaFrames(
          selectedModule.header,
          orchestratorModule,
        ),
      },
    );
    runtime.createRuntime(opts);
    return runtime;
  }

  getDebugInfo(): OrchestratorDebugInfo {
    return {
      aroraWebInstanceId: this.debugInstanceId || null,
    };
  }

  step(dt: number): OrchestratorFrame {
    if (!this.useDeltaFrames || !this.stepDeltaAvailable) {
      return super.step(dt);
    }

    let frame: OrchestratorFrame;
    try {
      frame = this.call<OrchestratorFrame>("orchestrator.stepDelta", {
        dt,
        ...(this.deltaFrameVersion !== undefined
          ? { sinceVersion: this.deltaFrameVersion }
          : {}),
      });
    } catch (error) {
      if (!isUnsupportedStepDeltaError(error)) {
        throw error;
      }
      this.stepDeltaAvailable = false;
      this.deltaFrameVersion = undefined;
      return super.step(dt);
    }
    this.deltaFrameVersion =
      typeof frame.version === "number" && Number.isFinite(frame.version)
        ? frame.version
        : undefined;
    return frame;
  }
}
