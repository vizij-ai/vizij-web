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
  AroraWebDebugModuleInfo,
  AroraWebModuleGraphDebugInfo,
  CreateOrchOptions,
  OrchestratorDebugInfo,
  OrchestratorFrame,
} from "./types";
import type {
  ModuleFacadeRequest,
  ModuleFacadeResponse,
  ModuleFacadeTransport,
} from "./moduleFacade";
import {
  DEFAULT_ARORA_WEB_MODULE_REGISTRY,
  DEFAULT_ARORA_WEB_MODULE_REGISTRY_URL,
  DEFAULT_ARORA_WEB_URL,
  DEFAULT_ARORA_WEB_WASM_URL,
  DEFAULT_ARORA_WEB_ORCHESTRATOR_MODULE,
  VIZIJ_ARORA_WEB_MODULE_IDS,
  VIZIJ_ARORA_WEB_ORCHESTRATOR_MODULE_PRESETS,
  VIZIJ_ARORA_WEB_PRELOAD_MODULE_PRESETS,
  VIZIJ_ARORA_WEB_MODULE_REGISTRY_KEYS,
} from "./aroraWebModules";

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

let aroraWebDebugInstanceSequence = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlainConfigRecord(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeConfig(input?: unknown): AroraWebInitInput {
  if (!isPlainConfigRecord(input)) {
    return input === undefined ? {} : { aroraWebInitInput: input };
  }
  return input as AroraWebInitInput;
}

function selectedModulePreset(
  config: AroraWebInitInput,
  registry: AroraWebModuleRegistry,
): AroraWebModulePreset {
  const moduleName =
    config.orchestratorModule ?? DEFAULT_ARORA_WEB_ORCHESTRATOR_MODULE;
  const registryKey = VIZIJ_ARORA_WEB_MODULE_REGISTRY_KEYS[moduleName];
  const registryPreset = modulePresetFromInput(registry[registryKey]);
  const preset =
    registryPreset ?? VIZIJ_ARORA_WEB_ORCHESTRATOR_MODULE_PRESETS[moduleName];
  if (!preset) {
    throw new Error(
      `Unsupported aroraWeb orchestratorModule: ${String(moduleName)}`,
    );
  }
  return preset;
}

async function loadAroraWebModule(
  config: AroraWebInitInput,
  manifest?: AroraWebModuleRegistryManifest,
  manifestUrl?: string | URL,
): Promise<AroraWebModuleExports> {
  if (config.aroraWeb) {
    return typeof config.aroraWeb === "function"
      ? await config.aroraWeb()
      : config.aroraWeb;
  }

  const moduleUrl =
    config.aroraWebUrl ??
    resolvedManifestEngineUrl(manifest, manifestUrl, "js") ??
    DEFAULT_ARORA_WEB_URL;
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

function defaultAroraWebInitInput(
  config: AroraWebInitInput,
  manifest?: AroraWebModuleRegistryManifest,
  manifestUrl?: string | URL,
): unknown {
  if (config.aroraWebInitInput !== undefined) {
    return config.aroraWebInitInput;
  }
  const manifestWasmUrl =
    !config.aroraWebUrl && manifestUrl
      ? resolvedManifestEngineUrl(manifest, manifestUrl, "wasm")
      : undefined;
  if (config.aroraWeb && !manifestWasmUrl) {
    return undefined;
  }
  if (manifestWasmUrl) {
    return { module_or_path: manifestWasmUrl };
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
    id === VIZIJ_ARORA_WEB_MODULE_IDS.orchestratorComposed ||
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
    importedModuleIds.has(VIZIJ_ARORA_WEB_MODULE_IDS.animation) ||
    importedModuleIds.has(VIZIJ_ARORA_WEB_MODULE_IDS.nodeGraph)
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
  const preset = VIZIJ_ARORA_WEB_PRELOAD_MODULE_PRESETS[presetName];
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

function resolvedManifestEngineUrl(
  manifest: AroraWebModuleRegistryManifest | undefined,
  manifestUrl: string | URL | undefined,
  key: "js" | "wasm",
): string | URL | undefined {
  if (!manifest || !manifestUrl) {
    return undefined;
  }
  return resolveManifestRelativeUrl(
    manifest.engine?.[key],
    manifestUrl,
    manifest.baseUrl,
  );
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
          VIZIJ_ARORA_WEB_MODULE_REGISTRY_KEYS[
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

type LoadedAroraWebModuleRegistry = {
  manifest?: AroraWebModuleRegistryManifest;
  manifestUrl?: string | URL;
  registry: AroraWebModuleRegistry;
};

async function fetchModuleRegistryManifest(
  config: AroraWebInitInput,
): Promise<LoadedAroraWebModuleRegistry> {
  if (!shouldLoadModuleRegistryManifest(config)) {
    return { registry: {} };
  }
  const manifestUrl =
    config.moduleRegistryUrl ?? DEFAULT_ARORA_WEB_MODULE_REGISTRY_URL;
  if (manifestUrl === false) {
    return { registry: {} };
  }
  const strict = config.moduleRegistryUrl !== undefined;
  let response: Response;
  try {
    response = await fetchImpl(config)(manifestUrl);
  } catch (err) {
    if (!strict) {
      return { registry: {} };
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load aroraWeb module registry manifest: ${detail}`,
    );
  }
  if (!response.ok) {
    if (!strict && response.status === 404) {
      return { registry: {} };
    }
    throw new Error(
      `Failed to load aroraWeb module registry manifest: ${response.status} ${response.statusText}`,
    );
  }
  const manifest = parseModuleRegistryManifest(
    await response.text(),
    String(manifestUrl),
  );
  return {
    manifest,
    manifestUrl,
    registry: moduleRegistryFromManifest(manifest, manifestUrl),
  };
}

async function moduleRegistry(
  config: AroraWebInitInput,
): Promise<LoadedAroraWebModuleRegistry> {
  const loaded = await fetchModuleRegistryManifest(config);
  return {
    manifest: loaded.manifest,
    manifestUrl: loaded.manifestUrl,
    registry: {
      ...DEFAULT_ARORA_WEB_MODULE_REGISTRY,
      ...loaded.registry,
      ...(config.moduleRegistry ?? {}),
    },
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

function functionExportIds(header: object): Set<string> {
  return new Set(
    functionExports(header)
      .map((exportValue) => stringField(exportValue.id))
      .filter((id): id is string => Boolean(id)),
  );
}

function validatePreloadModulesSatisfyImports(
  selectedHeader: object,
  modules: ResolvedAroraWebPreloadModule[],
): void {
  const modulesById = new Map<string, ResolvedAroraWebPreloadModule>();
  for (const moduleConfig of modules) {
    const moduleId = stringField((moduleConfig.header as { id?: unknown }).id);
    if (moduleId) {
      modulesById.set(moduleId, moduleConfig);
    }
  }

  for (const importValue of functionImports(selectedHeader)) {
    const moduleId = stringField(importValue.module);
    const functionId = stringField(importValue.id);
    if (!moduleId || !functionId) {
      continue;
    }
    const moduleConfig = modulesById.get(moduleId);
    if (!moduleConfig) {
      throw new Error(
        `Imported aroraWeb module ${moduleId} was not preloaded with a matching module header.`,
      );
    }
    if (!functionExportIds(moduleConfig.header).has(functionId)) {
      const importName = stringField(importValue.name);
      throw new Error(
        `Imported aroraWeb function ${importName ?? functionId} (${functionId}) is not exported by module ${moduleId}.`,
      );
    }
  }
}

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
  const explicitPreloadModules = Array.isArray(config.preloadModules);
  const modules: AroraWebPreloadModule[] = explicitPreloadModules
    ? (config.preloadModules ?? [])
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
  validatePreloadModulesSatisfyImports(selectedHeader, resolved);
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
  private readonly moduleGraph: AroraWebModuleGraphDebugInfo | null;
  private stepDeltaAvailable: boolean;
  private deltaFrameVersion: number | undefined;

  constructor(
    facade: ModuleFacadeTransport,
    options: {
      debugInstanceId?: string;
      moduleGraph?: AroraWebModuleGraphDebugInfo | null;
      useDeltaFrames?: boolean;
    } = {},
  ) {
    super(facade);
    this.useDeltaFrames = options.useDeltaFrames === true;
    this.stepDeltaAvailable = this.useDeltaFrames;
    this.debugInstanceId = options.debugInstanceId ?? "";
    this.moduleGraph = options.moduleGraph ?? null;
  }

  static async create(
    opts?: CreateOrchOptions,
    initInput?: unknown,
  ): Promise<AroraWebOrchestratorRuntime> {
    const config = normalizeConfig(initInput);
    const orchestratorModule =
      config.orchestratorModule ?? DEFAULT_ARORA_WEB_ORCHESTRATOR_MODULE;
    const loadedRegistry = await moduleRegistry(config);
    const module = await loadAroraWebModule(
      config,
      loadedRegistry.manifest,
      loadedRegistry.manifestUrl,
    );
    await initAroraWeb(
      module,
      defaultAroraWebInitInput(
        config,
        loadedRegistry.manifest,
        loadedRegistry.manifestUrl,
      ),
    );

    const registry = loadedRegistry.registry;
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
    const moduleGraph: AroraWebModuleGraphDebugInfo = {
      orchestratorModule,
      moduleRegistryUrl:
        config.moduleRegistryUrl === false
          ? null
          : String(
              config.moduleRegistryUrl ?? DEFAULT_ARORA_WEB_MODULE_REGISTRY_URL,
            ),
      manifestUrl: loadedRegistry.manifestUrl
        ? String(loadedRegistry.manifestUrl)
        : null,
      selectedModule: moduleInfoFromHeader(
        selectedModule.header,
        selectedModule.wasmUrl,
        moduleId,
      ),
      preloadedModules,
    };
    setAroraWebDebugInstance(debugInstanceId, {
      backend: "aroraWeb",
      orchestratorModule,
      moduleRegistryUrl: moduleGraph.moduleRegistryUrl,
      selectedModule: moduleGraph.selectedModule,
      preloadedModules: moduleGraph.preloadedModules,
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
        moduleGraph,
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
      aroraWebModuleGraph: this.moduleGraph,
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
