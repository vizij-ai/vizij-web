import * as orchestratorWasm from "@vizij/orchestrator-wasm";
import type {
  AnimationRegistrationConfig,
  CreateOrchOptions,
  GraphRegistrationInput,
  MergedGraphRegistrationConfig,
  OrchestratorFrame,
  ShapeJSON,
  ValueJSON,
} from "./types";

export type ModuleFacadeRequest<TArgs = unknown> = {
  call: string;
  runtimeHandle?: string;
  requestId?: string;
  args?: TArgs;
};

export type ModuleFacadeResponse<TResult = unknown> = {
  ok: boolean;
  result?: TResult;
  error?: string;
  version: number;
  requestId?: string;
};

export type ModuleFacadeTransport = {
  dispatch<TResult = unknown, TArgs = unknown>(
    request: ModuleFacadeRequest<TArgs>,
  ): ModuleFacadeResponse<TResult>;
  dispatchJson(requestJson: string): string;
};

type WasmModuleFacadeExports = {
  init?: (input?: unknown) => Promise<void>;
  createModuleFacade?: () => Promise<ModuleFacadeTransport>;
  module_facade_version?: () => number;
};

type ControllersResult = { graphs?: string[]; anims?: string[] };

function moduleFacadeExports(): WasmModuleFacadeExports {
  return orchestratorWasm as unknown as WasmModuleFacadeExports;
}

function assertOk<TResult>(
  response: ModuleFacadeResponse<TResult>,
  call: string,
): TResult {
  if (!response.ok) {
    throw new Error(
      response.error || `Vizij module facade call failed: ${call}`,
    );
  }
  return response.result as TResult;
}

function graphRegistrationArgs(cfg: GraphRegistrationInput): unknown {
  if (typeof cfg === "string") {
    return { spec: JSON.parse(cfg) };
  }
  return cfg;
}

/**
 * Runtime adapter backed by the shared Vizij module-facade JSON contract.
 */
export class ModuleFacadeOrchestratorRuntime {
  private readonly facade: ModuleFacadeTransport;
  private readonly versionResolver: () => number;
  protected runtimeHandle: string | undefined;

  constructor(facade: ModuleFacadeTransport, versionResolver = () => 1) {
    this.facade = facade;
    this.versionResolver = versionResolver;
  }

  static async create(
    opts?: CreateOrchOptions,
    initInput?: unknown,
  ): Promise<ModuleFacadeOrchestratorRuntime> {
    const api = moduleFacadeExports();
    if (typeof api.init === "function") {
      await api.init(initInput);
    }
    if (typeof api.createModuleFacade !== "function") {
      throw new Error(
        "@vizij/orchestrator-wasm does not expose createModuleFacade(). Rebuild/link the local orchestrator-wasm package from vizij-rs.",
      );
    }
    const facade = await api.createModuleFacade();
    return ModuleFacadeOrchestratorRuntime.createFromFacade(facade, opts, () =>
      Number(api.module_facade_version?.() ?? 1),
    );
  }

  static createFromFacade(
    facade: ModuleFacadeTransport,
    opts?: CreateOrchOptions,
    versionResolver = () => 1,
  ): ModuleFacadeOrchestratorRuntime {
    const runtime = new ModuleFacadeOrchestratorRuntime(
      facade,
      versionResolver,
    );
    runtime.createRuntime(opts);
    return runtime;
  }

  dispatch<TResult = unknown, TArgs = unknown>(
    request: ModuleFacadeRequest<TArgs>,
  ): ModuleFacadeResponse<TResult> {
    return this.facade.dispatch<TResult, TArgs>(request);
  }

  dispatchJson(requestJson: string): string {
    return this.facade.dispatchJson(requestJson);
  }

  facadeVersion(): number {
    return this.versionResolver();
  }

  registerGraph(cfg: GraphRegistrationInput): string {
    const result = this.call<{ graphId: string }>(
      "graph.register",
      graphRegistrationArgs(cfg),
    );
    return result.graphId;
  }

  registerMergedGraph(cfg: MergedGraphRegistrationConfig): string {
    const result = this.call<{ graphId: string }>("graph.merge", cfg);
    return result.graphId;
  }

  registerAnimation(cfg: AnimationRegistrationConfig): string {
    const result = this.call<{ animationId: string }>(
      "animation.register",
      cfg,
    );
    return result.animationId;
  }

  prebind(): void {
    // The facade contract currently uses canonical target paths directly.
  }

  setInput(path: string, value: ValueJSON, shape?: ShapeJSON): void {
    this.call("input.set", {
      path,
      value,
      ...(shape ? { shape } : {}),
    });
  }

  removeInput(path: string): boolean {
    const result = this.call<{ removed: boolean }>("input.remove", { path });
    return Boolean(result.removed);
  }

  step(dt: number): OrchestratorFrame {
    return this.call<OrchestratorFrame>("orchestrator.step", { dt });
  }

  listControllers(): { graphs: string[]; anims: string[] } {
    const result = this.call<ControllersResult>("controllers.list", {});
    return {
      graphs: Array.isArray(result.graphs) ? result.graphs : [],
      anims: Array.isArray(result.anims) ? result.anims : [],
    };
  }

  removeGraph(id: string): boolean {
    const result = this.call<{ removed: boolean }>("graph.remove", { id });
    return Boolean(result.removed);
  }

  removeAnimation(id: string): boolean {
    const result = this.call<{ removed: boolean }>("animation.remove", { id });
    return Boolean(result.removed);
  }

  async normalizeGraphSpec(spec: object | string): Promise<object> {
    return this.call<object>("graph.normalize", {
      spec: typeof spec === "string" ? JSON.parse(spec) : spec,
    });
  }

  protected createRuntime(opts?: CreateOrchOptions): void {
    const created = this.call<{ runtimeHandle?: string }>(
      "runtime.create",
      opts ?? {},
    );
    this.runtimeHandle = created.runtimeHandle;
  }

  protected call<TResult = unknown>(call: string, args: unknown): TResult {
    return assertOk<TResult>(
      this.facade.dispatch<TResult>({
        call,
        ...(this.runtimeHandle ? { runtimeHandle: this.runtimeHandle } : {}),
        args,
      }),
      call,
    );
  }
}
