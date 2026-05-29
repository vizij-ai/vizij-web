import { ModuleFacadeOrchestratorRuntime } from "./moduleFacade";
import type {
  AroraWebInitInput,
  AroraWebModuleExports,
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

const VIZIJ_ORCHESTRATOR_DISPATCH_FN_ID =
  "debf32e5-1650-48ac-af4a-da2da617aef7";
const VIZIJ_ORCHESTRATOR_REQUEST_PARAM_ID =
  "71b4a759-ded6-42a3-b59d-9716472ac045";

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
            id: "00000000-0000-0000-0000-00000000000c",
          },
          mutable: false,
          default_value: null,
        },
      ],
      ret: {
        kind: "scalar",
        id: "00000000-0000-0000-0000-00000000000c",
      },
    },
  ],
  imports: [],
  executable_mime: "",
};

type AroraWebEngine = InstanceType<AroraWebModuleExports["Engine"]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeConfig(input?: unknown): AroraWebInitInput {
  if (!isRecord(input)) {
    return {};
  }
  return input as AroraWebInitInput;
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

async function loadHeaderJson(config: AroraWebInitInput): Promise<string> {
  if (typeof config.headerJson === "string") {
    return config.headerJson;
  }
  if (config.headerJson) {
    return JSON.stringify(config.headerJson);
  }
  if (config.headerUrl) {
    const response = await fetchImpl(config)(config.headerUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to load aroraWeb module header: ${response.status} ${response.statusText}`,
      );
    }
    return await response.text();
  }
  return JSON.stringify(DEFAULT_VIZIJ_ORCHESTRATOR_HEADER);
}

function bytesFrom(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

async function loadWasmBytes(config: AroraWebInitInput): Promise<Uint8Array> {
  if (config.wasmBytes) {
    return bytesFrom(config.wasmBytes);
  }

  const response = await fetchImpl(config)(
    config.wasmUrl ?? DEFAULT_VIZIJ_ORCHESTRATOR_WASM_URL,
  );
  if (!response.ok) {
    throw new Error(
      `Failed to load vizij-orchestrator wasm: ${response.status} ${response.statusText}`,
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

  constructor(engine: AroraWebEngine, moduleId: string) {
    this.engine = engine;
    this.moduleId = moduleId;
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
      id: VIZIJ_ORCHESTRATOR_DISPATCH_FN_ID,
      args: [
        {
          id: VIZIJ_ORCHESTRATOR_REQUEST_PARAM_ID,
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

    const headerJson = await loadHeaderJson(config);
    const wasmBytes = await loadWasmBytes(config);
    if (typeof module.Engine !== "function") {
      throw new Error("arora-web module does not expose Engine.");
    }
    const engine = new module.Engine();
    const moduleId = loadModule(engine, headerJson, wasmBytes);

    const runtime = new AroraWebOrchestratorRuntime(
      new AroraWebModuleFacade(engine, moduleId),
    );
    runtime.createRuntime(opts);
    return runtime;
  }
}
