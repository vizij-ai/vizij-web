import { ModuleFacadeOrchestratorRuntime } from "./moduleFacade";
import type {
  AroraWebInitInput,
  AroraWebModuleExports,
  AroraWebOrchestratorModule,
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
const DEFAULT_VIZIJ_ORCHESTRATOR_COMPOSED_WASM_URL =
  "/arora-web/modules/vizij-orchestrator-composed/arora_vizij_orchestrator_composed.wasm";

const VIZIJ_ORCHESTRATOR_DISPATCH_FN_ID =
  "debf32e5-1650-48ac-af4a-da2da617aef7";
const VIZIJ_ORCHESTRATOR_REQUEST_PARAM_ID =
  "71b4a759-ded6-42a3-b59d-9716472ac045";
const VIZIJ_ORCHESTRATOR_COMPOSED_DISPATCH_FN_ID =
  "90725b7e-a4d9-4a3f-99af-8e227612bed7";
const VIZIJ_ORCHESTRATOR_COMPOSED_REQUEST_PARAM_ID =
  "323d47be-3b30-46ff-882f-bc7f7ffacd57";
const ARORA_STRING_TYPE_ID = "00000000-0000-0000-0000-00000000000c";

const DEFAULT_VIZIJ_ORCHESTRATOR_HEADER = {
  id: "144358c2-b7e0-414d-8755-56d7ac03f811",
  name: "vizij-orchestrator",
  author: "",
  description: null,
  license: "",
  version: { major: 0, minor: 0, patch: 0 },
  executor: { name: "wasm", min_version: null, max_version: null },
  exports: [
    {
      type: "function",
      id: VIZIJ_ORCHESTRATOR_DISPATCH_FN_ID,
      name: "dispatch_json",
      parameters: [
        {
          id: VIZIJ_ORCHESTRATOR_REQUEST_PARAM_ID,
          name: "request_json",
          type: {
            kind: "scalar",
            id: ARORA_STRING_TYPE_ID,
          },
          mutable: false,
          default_value: null,
        },
      ],
      ret: {
        kind: "scalar",
        id: ARORA_STRING_TYPE_ID,
      },
    },
  ],
  imports: [],
  executable_mime: "",
};

const DEFAULT_VIZIJ_ORCHESTRATOR_COMPOSED_HEADER = {
  id: "580d9cef-88be-4f1c-b649-f87032acd8fe",
  name: "vizij-orchestrator-composed",
  author: "",
  description: null,
  license: "",
  version: { major: 0, minor: 0, patch: 0 },
  executor: { name: "wasm", min_version: null, max_version: null },
  exports: [
    {
      type: "function",
      id: VIZIJ_ORCHESTRATOR_COMPOSED_DISPATCH_FN_ID,
      name: "dispatch_json",
      parameters: [
        {
          id: VIZIJ_ORCHESTRATOR_COMPOSED_REQUEST_PARAM_ID,
          name: "request_json",
          type: {
            kind: "scalar",
            id: ARORA_STRING_TYPE_ID,
          },
          mutable: false,
          default_value: null,
        },
      ],
      ret: {
        kind: "scalar",
        id: ARORA_STRING_TYPE_ID,
      },
    },
  ],
  imports: [],
  executable_mime: "",
};

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

type AroraWebModulePreset = {
  header: object;
  wasmUrl: string;
};

type AroraWebDispatchBinding = {
  dispatchFunctionId: string;
  requestParamId: string;
};

type ResolvedAroraWebModule = AroraWebDispatchBinding & {
  headerJson: string;
  wasmUrl: string | URL;
};

const VIZIJ_ORCHESTRATOR_MODULE_PRESETS: Record<
  AroraWebOrchestratorModule,
  AroraWebModulePreset
> = {
  compatibility: {
    header: DEFAULT_VIZIJ_ORCHESTRATOR_HEADER,
    wasmUrl: DEFAULT_VIZIJ_ORCHESTRATOR_WASM_URL,
  },
  composed: {
    header: DEFAULT_VIZIJ_ORCHESTRATOR_COMPOSED_HEADER,
    wasmUrl: DEFAULT_VIZIJ_ORCHESTRATOR_COMPOSED_WASM_URL,
  },
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
  if (!config.headerUrl) {
    return preset.header;
  }
  return null;
}

async function loadHeaderObject(
  config: AroraWebInitInput,
  preset: AroraWebModulePreset,
): Promise<object> {
  const header = loadHeaderObjectFromInput(config, preset);
  if (header) {
    return header;
  }
  if (config.headerUrl) {
    const response = await fetchImpl(config)(config.headerUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to load aroraWeb module header: ${response.status} ${response.statusText}`,
      );
    }
    return parseHeaderJson(await response.text(), String(config.headerUrl));
  }
  return preset.header;
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
    headerJson: JSON.stringify(header),
    wasmUrl: config.wasmUrl ?? preset.wasmUrl,
  };
}

function bytesFrom(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

async function loadWasmBytes(
  config: AroraWebInitInput,
  wasmUrl: string | URL,
): Promise<Uint8Array> {
  if (config.wasmBytes) {
    return bytesFrom(config.wasmBytes);
  }

  const response = await fetchImpl(config)(wasmUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to load aroraWeb orchestrator wasm: ${response.status} ${response.statusText}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
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
    const wasmBytes = await loadWasmBytes(config, selectedModule.wasmUrl);
    if (typeof module.Engine !== "function") {
      throw new Error("arora-web module does not expose Engine.");
    }
    const engine = new module.Engine();
    const moduleId = loadModule(engine, selectedModule.headerJson, wasmBytes);

    const runtime = new AroraWebOrchestratorRuntime(
      new AroraWebModuleFacade(engine, moduleId, selectedModule),
    );
    runtime.createRuntime(opts);
    return runtime;
  }
}
