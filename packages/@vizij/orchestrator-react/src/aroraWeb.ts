import { ModuleFacadeOrchestratorRuntime } from "./moduleFacade";
import type {
  AroraWebInitInput,
  AroraWebModuleExports,
  AroraWebModuleRegistry,
  AroraWebOrchestratorModule,
  AroraWebPreloadModule,
  AroraWebPreloadModuleName,
  CreateOrchOptions,
} from "./types";
import type {
  ModuleFacadeRequest,
  ModuleFacadeResponse,
  ModuleFacadeTransport,
} from "./moduleFacade";

const DEFAULT_ARORA_WEB_URL = "/arora-web/pkg/arora_web.js";
const DEFAULT_ARORA_WEB_WASM_URL = "/arora-web/pkg/arora_web_bg.wasm";
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
  headerUrl?: string | URL;
  wasmUrl: string | URL;
};

type AroraWebDispatchBinding = {
  dispatchFunctionId: string;
  requestParamId: string;
};

type ResolvedAroraWebModule = AroraWebDispatchBinding & {
  header: object;
  headerJson: string;
  wasmUrl: string | URL;
};

const VIZIJ_ANIMATION_MODULE_ID = "aa32e080-b002-428c-9994-6143aab3bf08";
const VIZIJ_NODE_GRAPH_MODULE_ID = "098bd478-8375-4f3a-b649-d64cb1284944";

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

function selectedModulePreset(config: AroraWebInitInput): AroraWebModulePreset {
  const moduleName = config.orchestratorModule ?? "compatibility";
  const preset = VIZIJ_ORCHESTRATOR_MODULE_PRESETS[moduleName];
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

function moduleRegistry(config: AroraWebInitInput): AroraWebModuleRegistry {
  return {
    ...DEFAULT_MODULE_REGISTRY,
    ...(config.moduleRegistry ?? {}),
  };
}

function defaultPreloadModulesForHeader(
  header: object,
  config: AroraWebInitInput,
): AroraWebPreloadModule[] {
  const registry = moduleRegistry(config);
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
): Promise<ResolvedAroraWebModule> {
  const preset = selectedModulePreset(config);
  const header = await loadHeaderObject(config, preset);
  const binding = resolveDispatchBinding(header, config);
  return {
    ...binding,
    header,
    headerJson: JSON.stringify(header),
    wasmUrl: config.wasmUrl ?? preset.wasmUrl,
  };
}

type ResolvedAroraWebPreloadModule = {
  headerJson: string;
  wasmUrl: string | URL;
  wasmBytes?: Uint8Array | ArrayBuffer;
};

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

async function loadPreloadHeaderObject(
  config: AroraWebInitInput,
  moduleInput: AroraWebPreloadModule,
  preset: AroraWebModulePreset | null,
): Promise<object> {
  if (typeof moduleInput === "string") {
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
): Promise<ResolvedAroraWebPreloadModule[]> {
  const modules = Array.isArray(config.preloadModules)
    ? config.preloadModules
    : defaultPreloadModulesForHeader(selectedHeader, config);
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
): Promise<void> {
  const modules = await resolvePreloadModules(config, selectedHeader);
  for (const moduleConfig of modules) {
    const wasmBytes = await loadWasmBytes(
      config,
      moduleConfig.wasmUrl,
      moduleConfig.wasmBytes,
      { useGlobalWasmBytes: false },
    );
    loadModule(engine, moduleConfig.headerJson, wasmBytes);
  }
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

  constructor(
    engine: AroraWebEngine,
    moduleId: string,
    binding: AroraWebDispatchBinding,
  ) {
    this.engine = engine;
    this.moduleId = moduleId;
    this.dispatchFunctionId = binding.dispatchFunctionId;
    this.requestParamId = binding.requestParamId;
  }

  dispatch<TResult = unknown, TArgs = unknown>(
    request: ModuleFacadeRequest<TArgs>,
  ): ModuleFacadeResponse<TResult> {
    return JSON.parse(
      this.dispatchJson(JSON.stringify(request)),
    ) as ModuleFacadeResponse<TResult>;
  }

  dispatchJson(requestJson: string): string {
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
  static async create(
    opts?: CreateOrchOptions,
    initInput?: unknown,
  ): Promise<AroraWebOrchestratorRuntime> {
    const config = normalizeConfig(initInput);
    const module = await loadAroraWebModule(config);
    await initAroraWeb(module, defaultAroraWebInitInput(config));

    const selectedModule = await resolveAroraWebModule(config);
    const wasmBytes = await loadWasmBytes(
      config,
      selectedModule.wasmUrl,
      undefined,
      {
        useGlobalWasmBytes: true,
      },
    );
    if (typeof module.Engine !== "function") {
      throw new Error("arora-web module does not expose Engine.");
    }
    const engine = new module.Engine();
    await preloadModules(engine, config, selectedModule.header);
    const moduleId = loadModule(engine, selectedModule.headerJson, wasmBytes);

    const runtime = new AroraWebOrchestratorRuntime(
      new AroraWebModuleFacade(engine, moduleId, selectedModule),
    );
    runtime.createRuntime(opts);
    return runtime;
  }
}
