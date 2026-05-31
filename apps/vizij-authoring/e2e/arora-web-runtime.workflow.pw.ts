import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bootAuthoring,
  ensureAnimationPanelVisible,
  ensureInspectorPanelVisible,
  ensureProgramPanelVisible,
  expectDownload,
  loadReferencePreset,
  loadMainPreset,
  openExportDialog,
  waitForMainFaceReady,
} from "./helpers";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const requiredAroraAssets = [
  "public/arora-web/pkg/arora_web.js",
  "public/arora-web/pkg/arora_web_bg.wasm",
  "public/arora-web/modules/manifest.json",
  "public/arora-web/modules/vizij-animation/module.json",
  "public/arora-web/modules/vizij-animation/vizij_animation.wasm",
  "public/arora-web/modules/vizij-node-graph/module.json",
  "public/arora-web/modules/vizij-node-graph/vizij_node_graph.wasm",
  "public/arora-web/modules/vizij-orchestrator-composed/module.json",
  "public/arora-web/modules/vizij-orchestrator-composed/arora_vizij_orchestrator_composed.wasm",
];

const MAIN_CANVAS_PIXEL_CHANGE_THRESHOLD = 0.001;
const MAIN_CANVAS_PIXEL_SAMPLE_SIZE = 64;

type CanvasPixelSnapshot = {
  width: number;
  height: number;
  data: number[];
};

test.skip(
  process.env.VIZIJ_E2E_ARORA !== "1",
  "Arora Web workflow requires prepared engine assets; run pnpm --filter vizij-authoring test:e2e:arora.",
);

function assertPreparedAroraAssets() {
  const missing = requiredAroraAssets.filter(
    (relativePath) => !fs.existsSync(path.join(appRoot, relativePath)),
  );
  if (missing.length > 0) {
    throw new Error(
      [
        "Missing prepared Arora web assets for vizij-authoring.",
        "Run:",
        "ARORA_ENGINE_PATH=/path/to/engine pnpm --filter vizij-authoring prepare:arora-web",
        "",
        "Missing:",
        ...missing.map((file) => `- ${file}`),
      ].join("\n"),
    );
  }
}

function trackPageErrors(page: Page): string[] {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });
  return consoleErrors;
}

function waitForAroraWebResponses(page: Page) {
  const waitForPath = (expectedPath: string) =>
    page.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return url.pathname === expectedPath && response.ok();
      },
      { timeout: 60_000 },
    );

  return Promise.all([
    waitForPath("/arora-web/pkg/arora_web.js"),
    waitForPath("/arora-web/pkg/arora_web_bg.wasm"),
    waitForPath("/arora-web/modules/manifest.json"),
    waitForPath("/arora-web/modules/vizij-animation/module.json"),
    waitForPath("/arora-web/modules/vizij-node-graph/module.json"),
    waitForPath("/arora-web/modules/vizij-orchestrator-composed/module.json"),
  ]);
}

async function waitForComposedRuntimeDiagnostics(
  page: Page,
  namespace: string,
  options: { requireControllers?: boolean; requireDeltaStep?: boolean } = {},
) {
  const handle = await page.waitForFunction(
    ({ runtimeNamespace, requireControllers, requireDeltaStep }) => {
      const memoryState = (window as any).__vizijMemoryDebugState;
      const runtimes = Object.values(memoryState?.runtimes ?? {}) as Array<
        Record<string, unknown>
      >;
      const runtime = runtimes.find(
        (entry) =>
          entry.namespace === runtimeNamespace &&
          entry.orchestratorBackend === "aroraWeb" &&
          entry.animationTransport === "orchestrator" &&
          entry.orchestratorReady === true &&
          entry.ready === true &&
          Number(entry.outputCount ?? 0) > 0 &&
          Number(entry.errorCount ?? 0) === 0 &&
          (!requireControllers ||
            (Number(entry.graphControllerCount ?? 0) > 0 &&
              Number(entry.animationControllerCount ?? 0) > 0)),
      );
      const aroraInstanceId = runtime?.aroraWebDebugInstanceId;
      if (typeof aroraInstanceId !== "string" || aroraInstanceId.length === 0) {
        return null;
      }
      const aroraState = (window as any).__vizijAroraWebDebugState;
      const arora = aroraState?.instances?.[aroraInstanceId];
      if (!arora) {
        return null;
      }
      const selectedName = arora?.selectedModule?.name;
      const facadeCallCounts = arora?.facadeCallCounts ?? {};
      const deltaStepCount = Number(
        facadeCallCounts["orchestrator.stepDelta"] ?? 0,
      );
      const fullStepCount = Number(facadeCallCounts["orchestrator.step"] ?? 0);
      const preloadedNames = Array.isArray(arora?.preloadedModules)
        ? arora.preloadedModules.map(
            (moduleInfo: { name?: unknown }) => moduleInfo.name,
          )
        : [];
      const aroraMatchesRuntime =
        arora?.orchestratorModule === "composed" &&
        selectedName === "vizij-orchestrator-composed" &&
        preloadedNames.includes("vizij-animation") &&
        preloadedNames.includes("vizij-node-graph") &&
        Number(arora.dispatchCount ?? 0) > 0 &&
        (!requireDeltaStep || (deltaStepCount > 0 && fullStepCount === 0));
      if (!aroraMatchesRuntime) {
        return null;
      }
      if (!runtime || !arora) {
        return null;
      }
      return { runtime, arora };
    },
    {
      runtimeNamespace: namespace,
      requireControllers: options.requireControllers ?? true,
      requireDeltaStep: options.requireDeltaStep ?? false,
    },
    { timeout: 120_000 },
  );
  const snapshot = await handle.jsonValue();
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Expected composed runtime diagnostics to be available");
  }
  return snapshot as {
    runtime: Record<string, unknown>;
    arora: Record<string, unknown>;
  };
}

function waitForMainComposedRuntimeDiagnostics(page: Page) {
  return waitForComposedRuntimeDiagnostics(page, "default", {
    requireDeltaStep: true,
  });
}

function waitForReferenceComposedRuntimeDiagnostics(page: Page) {
  return waitForComposedRuntimeDiagnostics(page, "refface", {
    requireControllers: false,
  });
}

async function waitForMainRuntimeWrites(
  page: Page,
  previousFrameWriteCount: number,
) {
  await page.waitForFunction(
    (previousCount) => {
      const memoryState = (window as any).__vizijMemoryDebugState;
      const runtimes = Object.values(memoryState?.runtimes ?? {}) as Array<
        Record<string, unknown>
      >;
      const runtime = runtimes.find(
        (entry) =>
          entry.namespace === "default" &&
          entry.orchestratorBackend === "aroraWeb" &&
          entry.ready === true,
      );
      if (!runtime) {
        return false;
      }
      return (
        Number(runtime.frameWriteCount ?? 0) > previousCount &&
        Number(runtime.lastFrameWriteCount ?? 0) > 0
      );
    },
    previousFrameWriteCount,
    { timeout: 30_000 },
  );
}

type RendererSample = {
  id: string;
  value: number;
};

async function readMainRuntimeDebug(page: Page) {
  return page.evaluate(() => {
    const memoryState = (window as any).__vizijMemoryDebugState;
    const runtimes = Object.values(memoryState?.runtimes ?? {}) as Array<
      Record<string, unknown>
    >;
    return (
      runtimes.find(
        (entry) =>
          entry.namespace === "default" &&
          entry.orchestratorBackend === "aroraWeb" &&
          entry.ready === true,
      ) ?? null
    );
  });
}

async function waitForMainRendererWriteCountGreaterThan(
  page: Page,
  previousRendererWriteCount: number,
) {
  await page.waitForFunction(
    (previousCount) => {
      const memoryState = (window as any).__vizijMemoryDebugState;
      const runtimes = Object.values(memoryState?.runtimes ?? {}) as Array<
        Record<string, unknown>
      >;
      const runtime = runtimes.find(
        (entry) =>
          entry.namespace === "default" &&
          entry.orchestratorBackend === "aroraWeb" &&
          entry.ready === true,
      );
      if (!runtime) {
        return false;
      }
      return Number(runtime.rendererWriteCount ?? 0) > previousCount;
    },
    previousRendererWriteCount,
    { timeout: 30_000 },
  );
}

async function readMainAroraDebug(page: Page) {
  return page.evaluate(() => {
    const memoryState = (window as any).__vizijMemoryDebugState;
    const runtimes = Object.values(memoryState?.runtimes ?? {}) as Array<
      Record<string, unknown>
    >;
    const runtime = runtimes.find(
      (entry) =>
        entry.namespace === "default" &&
        entry.orchestratorBackend === "aroraWeb" &&
        entry.ready === true,
    );
    const aroraInstanceId = runtime?.aroraWebDebugInstanceId;
    if (typeof aroraInstanceId !== "string") {
      return null;
    }
    return (
      (window as any).__vizijAroraWebDebugState?.instances?.[aroraInstanceId] ??
      null
    );
  });
}

async function waitForMainFacadeCallCountGreaterThan(
  page: Page,
  callName: string,
  previousCount: number,
): Promise<number> {
  await expect
    .poll(
      async () => {
        const arora = await readMainAroraDebug(page);
        return Number(
          (arora?.facadeCallCounts as Record<string, unknown> | undefined)?.[
            callName
          ] ?? 0,
        );
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThan(previousCount);
  const arora = await readMainAroraDebug(page);
  return Number(
    (arora?.facadeCallCounts as Record<string, unknown> | undefined)?.[
      callName
    ] ?? 0,
  );
}

async function waitForMainRendererSample(
  page: Page,
  options: {
    id: RegExp;
    previousFrameWriteCount?: number;
    previousRendererWriteCount?: number;
    expectedValue?: number;
    minValue?: number;
    maxValue?: number;
    tolerance?: number;
  },
): Promise<RendererSample> {
  const handle = await page.waitForFunction(
    ({
      idPattern,
      idFlags,
      previousFrameWriteCount,
      previousRendererWriteCount,
      expectedValue,
      minValue,
      maxValue,
      tolerance,
    }) => {
      function numericValue(value: unknown): number | null {
        if (typeof value === "number" && Number.isFinite(value)) {
          return value;
        }
        if (!value || typeof value !== "object") {
          return null;
        }
        const record = value as Record<string, unknown>;
        const candidates = [record.float, record.number, record.value];
        for (const candidate of candidates) {
          if (typeof candidate === "number" && Number.isFinite(candidate)) {
            return candidate;
          }
        }
        return null;
      }

      const memoryState = (window as any).__vizijMemoryDebugState;
      const runtimes = Object.values(memoryState?.runtimes ?? {}) as Array<
        Record<string, unknown>
      >;
      const runtime = runtimes.find(
        (entry) =>
          entry.namespace === "default" &&
          entry.orchestratorBackend === "aroraWeb" &&
          entry.ready === true,
      );
      if (!runtime) {
        return null;
      }
      if (
        previousFrameWriteCount != null &&
        Number(runtime.frameWriteCount ?? 0) <= previousFrameWriteCount
      ) {
        return null;
      }
      if (
        previousRendererWriteCount != null &&
        Number(runtime.rendererWriteCount ?? 0) <= previousRendererWriteCount
      ) {
        return null;
      }

      const idRegex = new RegExp(idPattern, idFlags);
      const samples = Array.isArray(runtime.lastRendererWriteSamples)
        ? runtime.lastRendererWriteSamples
        : [];
      for (const sample of samples) {
        if (!sample || typeof sample !== "object") {
          continue;
        }
        const id = String((sample as { id?: unknown }).id ?? "");
        if (!idRegex.test(id)) {
          continue;
        }
        const value = numericValue((sample as { value?: unknown }).value);
        if (value == null) {
          continue;
        }
        if (
          expectedValue != null &&
          Math.abs(value - expectedValue) > (tolerance ?? 0.001)
        ) {
          continue;
        }
        if (minValue != null && value < minValue) {
          continue;
        }
        if (maxValue != null && value > maxValue) {
          continue;
        }
        return { id, value };
      }
      return null;
    },
    {
      idPattern: options.id.source,
      idFlags: options.id.flags,
      previousFrameWriteCount: options.previousFrameWriteCount,
      previousRendererWriteCount: options.previousRendererWriteCount,
      expectedValue: options.expectedValue,
      minValue: options.minValue,
      maxValue: options.maxValue,
      tolerance: options.tolerance,
    },
    { timeout: 30_000 },
  );
  const snapshot = await handle.jsonValue();
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    typeof (snapshot as RendererSample).id !== "string" ||
    typeof (snapshot as RendererSample).value !== "number"
  ) {
    throw new Error("Expected runtime renderer sample to resolve");
  }
  return snapshot as RendererSample;
}

async function captureMainRuntimeCanvasPixels(
  page: Page,
): Promise<CanvasPixelSnapshot> {
  const canvas = page
    .getByTestId("main-runtime-view")
    .locator("canvas")
    .first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () => {
        const box = await canvas.boundingBox();
        return box && box.width >= 64 && box.height >= 64;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await canvas.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const screenshot = await canvas.screenshot({ timeout: 30_000 });
  return decodeScreenshotPixels(page, screenshot);
}

async function decodeScreenshotPixels(
  page: Page,
  screenshot: Buffer,
): Promise<CanvasPixelSnapshot> {
  return page.evaluate(
    async ({ bytes, sampleSize }) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
      const bitmap = await createImageBitmap(blob);
      const sampleWidth = Math.min(sampleSize, bitmap.width);
      const sampleHeight = Math.min(sampleSize, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = sampleWidth;
      canvas.height = sampleHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Expected 2D context for screenshot pixel decoding");
      }
      ctx.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
      bitmap.close();
      const pixels = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;

      return {
        width: sampleWidth,
        height: sampleHeight,
        data: Array.from(pixels),
      };
    },
    {
      bytes: Array.from(screenshot),
      sampleSize: MAIN_CANVAS_PIXEL_SAMPLE_SIZE,
    },
  );
}

function pixelDifferenceRatio(
  before: CanvasPixelSnapshot,
  after: CanvasPixelSnapshot,
): number {
  const maxLength = Math.max(before.data.length, after.data.length);
  if (maxLength === 0) {
    return 0;
  }
  let changedBytes =
    before.width === after.width && before.height === after.height
      ? Math.abs(before.data.length - after.data.length)
      : maxLength;
  const sharedLength = Math.min(before.data.length, after.data.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (before.data[index] !== after.data[index]) {
      changedBytes += 1;
    }
  }
  return changedBytes / maxLength;
}

async function expectMainRuntimeCanvasVisualChange(
  page: Page,
  before: CanvasPixelSnapshot,
) {
  await expect
    .poll(
      async () =>
        pixelDifferenceRatio(
          before,
          await captureMainRuntimeCanvasPixels(page),
        ),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(MAIN_CANVAS_PIXEL_CHANGE_THRESHOLD);
}

async function waitForMainAnimationCommandDiagnostics(
  page: Page,
  previousCommandCount: number,
) {
  const handle = await page.waitForFunction(
    (previousCount) => {
      const memoryState = (window as any).__vizijMemoryDebugState;
      const runtimes = Object.values(memoryState?.runtimes ?? {}) as Array<
        Record<string, unknown>
      >;
      const runtime = runtimes.find(
        (entry) =>
          entry.namespace === "default" &&
          entry.orchestratorBackend === "aroraWeb" &&
          entry.animationTransport === "orchestrator" &&
          entry.ready === true,
      );
      if (!runtime) {
        return null;
      }
      const commandCount = Number(
        runtime.orchestratorAnimationCommandCount ?? 0,
      );
      const fallbackCount = Number(
        runtime.orchestratorAnimationFallbackCount ?? 0,
      );
      const hostSampleCount = Number(runtime.hostAnimationSampleCount ?? 0);
      if (
        commandCount <= previousCount ||
        fallbackCount !== 0 ||
        hostSampleCount !== 0
      ) {
        return null;
      }
      return runtime;
    },
    previousCommandCount,
    { timeout: 30_000 },
  );
  const snapshot = await handle.jsonValue();
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error(
      "Expected Arora animation playback to use orchestrator commands without host sampling fallback",
    );
  }
  return snapshot as Record<string, unknown>;
}

async function clickViaDom(locator: Locator): Promise<void> {
  await locator.first().evaluate((node) => {
    (node as HTMLButtonElement).click();
  });
}

async function ensureAuthoringProgramsVisible(page: Page): Promise<void> {
  const programsTab = page.getByTestId("control-authoring-tab-programs");
  if (!(await programsTab.isVisible().catch(() => false))) {
    await page.getByTestId("app-menu-view").click();
    await page.getByRole("menuitem", { name: "Authoring" }).click();
    await page.keyboard.press("Escape");
  }
  await programsTab.click();
  await expect(
    page.getByTestId("control-authoring-panel-programs"),
  ).toBeVisible();
}

async function downloadedFilePath(
  download: Awaited<ReturnType<typeof expectDownload>>,
) {
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("Expected exported GLB download to resolve to a file path");
  }
  return downloadPath;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeCssAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseGlbJson(filePath: string): Record<string, unknown> {
  const bytes = fs.readFileSync(filePath);
  if (bytes.readUInt32LE(0) !== 0x46546c67) {
    throw new Error("Expected a binary GLB file");
  }
  const jsonChunkLength = bytes.readUInt32LE(12);
  const jsonChunkType = bytes.readUInt32LE(16);
  if (jsonChunkType !== 0x4e4f534a) {
    throw new Error("Expected the first GLB chunk to be JSON");
  }
  const json = bytes
    .subarray(20, 20 + jsonChunkLength)
    .toString("utf8")
    .trim();
  return JSON.parse(json) as Record<string, unknown>;
}

function readRootVizijBundleFromGlb(filePath: string): Record<string, unknown> {
  const json = parseGlbJson(filePath);
  const rootExtensions = json.extensions;
  const rootBundle =
    rootExtensions && typeof rootExtensions === "object"
      ? (rootExtensions as { VIZIJ_bundle?: unknown }).VIZIJ_bundle
      : null;
  if (!rootBundle || typeof rootBundle !== "object") {
    throw new Error(
      "Expected exported GLB to contain a root VIZIJ_bundle extension",
    );
  }

  const staleBundleLocations: string[] = [];
  const containers = [
    ...(Array.isArray(json.nodes)
      ? json.nodes.map((node, index) => ({
          container: node,
          path: `nodes.${index}`,
        }))
      : []),
    ...(Array.isArray(json.scenes)
      ? json.scenes.map((scene, index) => ({
          container: scene,
          path: `scenes.${index}`,
        }))
      : []),
  ];
  for (const { container, path: containerPath } of containers) {
    if (!container || typeof container !== "object") {
      continue;
    }
    const extensions = (container as { extensions?: unknown }).extensions;
    if (!extensions || typeof extensions !== "object") {
      continue;
    }
    const bundle = (extensions as { VIZIJ_bundle?: unknown }).VIZIJ_bundle;
    if (bundle) {
      staleBundleLocations.push(containerPath);
    }
  }
  if (staleBundleLocations.length > 0) {
    throw new Error(
      `Expected only the root GLB object to contain VIZIJ_bundle; found stale bundle(s) at ${staleBundleLocations.join(
        ", ",
      )}`,
    );
  }
  return rootBundle as Record<string, unknown>;
}

function findExportedAnimation(
  bundle: Record<string, unknown>,
  name: string,
): Record<string, unknown> {
  const animation = Array.isArray(bundle.animations)
    ? bundle.animations.find(
        (entry) => (entry as { clip?: { name?: unknown } }).clip?.name === name,
      )
    : null;
  if (!animation || typeof animation !== "object") {
    throw new Error(`Expected exported animation "${name}"`);
  }
  return animation as Record<string, unknown>;
}

function findExportedAnimationTrack(
  animation: Record<string, unknown>,
  channel: string,
): Record<string, unknown> {
  const clip = animation.clip as { tracks?: unknown } | undefined;
  const track = Array.isArray(clip?.tracks)
    ? clip.tracks.find(
        (entry) => (entry as { channel?: unknown }).channel === channel,
      )
    : null;
  if (!track || typeof track !== "object") {
    throw new Error(`Expected exported animation track "${channel}"`);
  }
  return track as Record<string, unknown>;
}

function findExportedGraph(
  bundle: Record<string, unknown>,
  label: string,
): Record<string, unknown> {
  const graph = Array.isArray(bundle.graphs)
    ? bundle.graphs.find(
        (entry) => (entry as { label?: unknown }).label === label,
      )
    : null;
  if (!graph || typeof graph !== "object") {
    throw new Error(`Expected exported graph "${label}"`);
  }
  return graph as Record<string, unknown>;
}

function readGraphSyntheticDefault(options: {
  graph: Record<string, unknown>;
  nodeId: string;
  portId: string;
}): unknown {
  const spec = options.graph.spec as { nodes?: unknown } | undefined;
  const nodes = Array.isArray(spec?.nodes) ? spec.nodes : [];
  const constNode = nodes.find(
    (entry) =>
      (entry as { id?: unknown }).id ===
      `__const_${options.nodeId}_${options.portId}`,
  ) as { params?: { value?: unknown } } | undefined;
  if (!constNode) {
    throw new Error(
      `Expected exported graph default for ${options.nodeId}.${options.portId}`,
    );
  }
  return constNode.params?.value;
}

function readGraphNodeParam(options: {
  graph: Record<string, unknown>;
  nodeId: string;
  paramId: string;
}): unknown {
  const spec = options.graph.spec as { nodes?: unknown } | undefined;
  const nodes = Array.isArray(spec?.nodes) ? spec.nodes : [];
  const node = nodes.find(
    (entry) => (entry as { id?: unknown }).id === options.nodeId,
  ) as { params?: Record<string, unknown> } | undefined;
  if (!node) {
    throw new Error(`Expected exported graph node ${options.nodeId}`);
  }
  return node.params?.[options.paramId];
}

function readGraphEndpointNodeId(endpoint: unknown): string | null {
  if (!endpoint || typeof endpoint !== "object") {
    return null;
  }
  const record = endpoint as Record<string, unknown>;
  const id = record.node_id ?? record.nodeId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function readGraphOutputPathDrivenByNode(options: {
  graph: Record<string, unknown>;
  nodeId: string;
}): string {
  const spec = options.graph.spec as
    | { nodes?: unknown; edges?: unknown }
    | undefined;
  const nodes = Array.isArray(spec?.nodes) ? spec.nodes : [];
  const edges = Array.isArray(spec?.edges) ? spec.edges : [];
  const nodesById = new Map(
    nodes
      .map((entry) => {
        const id = (entry as { id?: unknown }).id;
        return typeof id === "string" ? [id, entry] : null;
      })
      .filter((entry): entry is [string, unknown] => entry !== null),
  );
  const visited = new Set<string>();
  const queue = [options.nodeId];

  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;
    if (visited.has(currentNodeId)) {
      continue;
    }
    visited.add(currentNodeId);
    const node = nodesById.get(currentNodeId) as
      | { type?: unknown; params?: Record<string, unknown> }
      | undefined;
    if (node?.type === "output" && typeof node.params?.path === "string") {
      return node.params.path;
    }

    edges.forEach((edge) => {
      const record = edge as { from?: unknown; to?: unknown };
      const fromNodeId = readGraphEndpointNodeId(record.from);
      const toNodeId = readGraphEndpointNodeId(record.to);
      if (fromNodeId === currentNodeId && toNodeId) {
        queue.push(toNodeId);
      }
    });
  }

  throw new Error(
    `Expected graph node ${options.nodeId} to drive a runtime output path`,
  );
}

function readLastFacadeRequestArgs(
  arora: Record<string, unknown> | null,
  callName: string,
): Record<string, unknown> {
  const requests = arora?.lastFacadeRequests;
  const requestJson =
    requests && typeof requests === "object"
      ? (requests as Record<string, unknown>)[callName]
      : null;
  if (typeof requestJson !== "string") {
    throw new Error(`Expected debug request for ${callName}`);
  }
  const request = JSON.parse(requestJson) as { args?: unknown };
  if (!request.args || typeof request.args !== "object") {
    throw new Error(`Expected debug request args for ${callName}`);
  }
  return request.args as Record<string, unknown>;
}

async function duplicateTargetByLabel(options: {
  label: RegExp;
  page: Page;
  panelTestId: string;
  targetKind: "animation" | "program";
}): Promise<Locator> {
  const panel = options.page.getByTestId(options.panelTestId);
  const itemTestId = `authoring-${options.targetKind}-item`;
  const beforeTargetIds = new Set(
    await panel
      .getByTestId(itemTestId)
      .evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute("data-target-id"))
          .filter((id): id is string => Boolean(id)),
      ),
  );
  const item = panel
    .getByTestId(itemTestId)
    .filter({ hasText: options.label })
    .first();
  await expect(item).toBeVisible();
  await clickViaDom(
    item.getByTestId(`authoring-${options.targetKind}-item-copy`),
  );

  await expect
    .poll(
      async () => {
        const targetIds = await panel
          .getByTestId(itemTestId)
          .evaluateAll((nodes) =>
            nodes
              .map((node) => node.getAttribute("data-target-id"))
              .filter((id): id is string => Boolean(id)),
          );
        return (
          targetIds.find((targetId) => !beforeTargetIds.has(targetId)) ?? null
        );
      },
      { timeout: 10_000 },
    )
    .not.toBeNull();
  const copiedTargetId = (
    await panel
      .getByTestId(itemTestId)
      .evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute("data-target-id"))
          .filter((id): id is string => Boolean(id)),
      )
  ).find((targetId) => !beforeTargetIds.has(targetId));
  if (!copiedTargetId) {
    throw new Error(`Expected copied ${options.targetKind} target id`);
  }
  const copiedItem = panel.locator(
    `[data-testid="${itemTestId}"][data-target-id="${escapeCssAttribute(
      copiedTargetId,
    )}"]`,
  );
  await expect(copiedItem).toBeVisible();
  return copiedItem;
}

async function duplicateFirstTarget(options: {
  page: Page;
  panelTestId: string;
  targetKind: "animation" | "program";
}): Promise<{ copiedItem: Locator; copiedLabel: string }> {
  const panel = options.page.getByTestId(options.panelTestId);
  const item = panel
    .getByTestId(`authoring-${options.targetKind}-item`)
    .first();
  await expect(item).toBeVisible();
  const rawLabel = await item
    .getByTestId(`authoring-${options.targetKind}-item-label`)
    .textContent();
  const label = rawLabel?.trim();
  if (!label) {
    throw new Error(`Could not read ${options.targetKind} target label`);
  }

  await clickViaDom(
    item.getByTestId(`authoring-${options.targetKind}-item-copy`),
  );
  const copiedLabel = `${label} Copy`;
  const copiedItem = panel
    .getByTestId(`authoring-${options.targetKind}-item`)
    .filter({ hasText: new RegExp(escapeRegex(copiedLabel), "i") })
    .first();
  await expect(copiedItem).toBeVisible();
  return { copiedItem, copiedLabel };
}

async function playTarget(item: Locator, targetKind: "animation" | "program") {
  await clickViaDom(item.getByTestId(`authoring-${targetKind}-item-play`));
}

async function stopActiveRuntime(page: Page): Promise<void> {
  const stopAnimation = page.getByTestId("main-runtime-stop-animation");
  if (await stopAnimation.isVisible().catch(() => false)) {
    await clickViaDom(stopAnimation);
  }
  const stopProgram = page.getByTestId("main-runtime-stop-program");
  if (await stopProgram.isVisible().catch(() => false)) {
    await clickViaDom(stopProgram);
  }
  await expect(page.getByTestId("main-runtime-status-chip")).toHaveText(
    "Runtime: Idle",
  );
}

async function expectAuthoringCompileState(
  page: Page,
  target: "animation" | "motiongraph" | "runtime-graph",
  status: "compiled" | "registered",
): Promise<void> {
  await expect(
    page.getByTestId(`authoring-compile-target-${target}`),
  ).toContainText(`${target} ${status}`, { timeout: 30_000 });
}

async function expectAuthoringCompileAtLeastCompiled(
  page: Page,
  target: "animation" | "motiongraph" | "runtime-graph",
): Promise<void> {
  await expect(
    page.getByTestId(`authoring-compile-target-${target}`),
  ).toContainText(new RegExp(`^${target} (compiled|registered)$`), {
    timeout: 30_000,
  });
}

test.beforeAll(() => {
  assertPreparedAroraAssets();
});

test("loads authoring face, animation, and program through Arora web composed execution @workflow", async ({
  page,
}) => {
  const consoleErrors = trackPageErrors(page);
  await bootAuthoring(page, "/?memoryInvestigation=1");

  const aroraReady = waitForAroraWebResponses(page);
  await loadMainPreset(page, "quori:latest");
  await aroraReady;
  await waitForMainComposedRuntimeDiagnostics(page);

  const runtimeChip = page.getByTestId("main-runtime-status-chip");
  await expect(runtimeChip).toHaveText("Runtime: Idle");

  await page.getByRole("tab", { name: /^Animations \(\d+\)$/ }).click();
  await ensureAnimationPanelVisible(page);
  const idleCanvas = await captureMainRuntimeCanvasPixels(page);
  await clickViaDom(page.getByTestId("animation-panel-playback-toggle"));
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expectMainRuntimeCanvasVisualChange(page, idleCanvas);

  await ensureAuthoringProgramsVisible(page);
  await clickViaDom(
    page
      .getByTestId("control-authoring-panel-programs")
      .locator('button[title="Play program"]'),
  );
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(page.getByTestId("motiongraph-panel")).toBeVisible();

  await loadReferencePreset(page, "quori:basic");
  await expect(page.getByTestId("reference-runtime-ready-flag")).toBeVisible();
  await waitForReferenceComposedRuntimeDiagnostics(page);
  await expect(
    page.getByTestId("reference-runtime-reset-inputs"),
  ).toBeVisible();
  await page.getByTestId("reference-face-unload").click();
  await expect(page.getByTestId("reference-face-empty-state")).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("executes UI-edited animation and graph values through Arora web composed runtime @workflow", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const authoredAnimationValue = 0.55;
  const authoredGraphValue = 0.68;
  const consoleErrors = trackPageErrors(page);
  await bootAuthoring(
    page,
    "/?memoryInvestigation=1&memoryScope=main-runtime-only",
  );

  const aroraReady = waitForAroraWebResponses(page);
  await loadMainPreset(page, "quori:latest");
  await aroraReady;
  await waitForMainComposedRuntimeDiagnostics(page);

  const runtimeChip = page.getByTestId("main-runtime-status-chip");
  await expect(runtimeChip).toHaveText("Runtime: Idle");

  await page.getByTestId("control-authoring-tab-animations").click();
  const copiedAnimation = await duplicateTargetByLabel({
    page,
    panelTestId: "control-authoring-panel-animations",
    targetKind: "animation",
    label: /Nonesense/i,
  });
  await clickViaDom(
    copiedAnimation.getByTestId("authoring-animation-item-select"),
  );
  await ensureAnimationPanelVisible(page);
  await ensureInspectorPanelVisible(page);

  const inspector = page.getByTestId("inspector-panel");
  const editedTrackRow = page
    .getByTestId("animation-track-row")
    .filter({ hasText: /gaze_left_right/i })
    .first();
  await clickViaDom(editedTrackRow);
  await expect(
    inspector.getByTestId("animation-track-interpolation-select"),
  ).toBeVisible();
  await inspector
    .getByTestId("animation-track-interpolation-select")
    .selectOption("step");
  await clickViaDom(editedTrackRow.getByTestId("animation-timeline-keyframe"));
  await expect(
    inspector.getByTestId("animation-keyframe-item").first(),
  ).toBeVisible();
  const keyframeValueInput = inspector.getByTestId(
    "animation-keyframe-value-input",
  );
  await keyframeValueInput.fill(String(authoredAnimationValue));
  await expect(
    editedTrackRow.getByTestId("animation-timeline-keyframe").first(),
  ).toHaveAttribute("title", /Value: 0\.55/);
  await expectAuthoringCompileAtLeastCompiled(page, "animation");
  await expectAuthoringCompileState(page, "animation", "registered");

  const beforeAnimationRuntime = await readMainRuntimeDebug(page);
  const beforeAnimationCanvas = await captureMainRuntimeCanvasPixels(page);
  await playTarget(copiedAnimation, "animation");
  await expect(runtimeChip).toContainText("Animation: Playing");
  await waitForMainAnimationCommandDiagnostics(
    page,
    Number(beforeAnimationRuntime?.orchestratorAnimationCommandCount ?? 0),
  );
  await waitForMainRendererSample(page, {
    id: /gaze\/left_right$/,
    previousFrameWriteCount: Number(
      beforeAnimationRuntime?.frameWriteCount ?? 0,
    ),
    expectedValue: authoredAnimationValue,
    tolerance: 0.03,
  });
  await expectMainRuntimeCanvasVisualChange(page, beforeAnimationCanvas);
  await stopActiveRuntime(page);

  await ensureAuthoringProgramsVisible(page);
  const liveProgram = page
    .getByTestId("control-authoring-panel-programs")
    .getByTestId("authoring-program-item")
    .filter({ hasText: /Live/i })
    .first();
  await expect(liveProgram).toBeVisible();
  await clickViaDom(liveProgram.getByTestId("authoring-program-item-select"));
  await ensureProgramPanelVisible(page);

  const graphPanel = page.getByTestId("motiongraph-panel");
  const noiseFrequencyInput = graphPanel.locator(
    '[data-testid="motiongraph-param-input"][data-node-id="node_1772233939116_946"][data-param-id="frequency"]',
  );
  await expect(noiseFrequencyInput).toBeVisible({ timeout: 30_000 });
  await noiseFrequencyInput.fill("0");
  await expect(noiseFrequencyInput).toHaveValue("0");

  const operandDefaultInput = graphPanel.locator(
    '[data-testid="motiongraph-port-default-input"][data-node-id="node_1773247042486_236"][data-port-id="operand_1"]',
  );
  await expect(operandDefaultInput).toBeVisible({ timeout: 30_000 });
  await operandDefaultInput.fill(String(authoredGraphValue));
  await expect(operandDefaultInput).toHaveValue(String(authoredGraphValue));
  await expectAuthoringCompileAtLeastCompiled(page, "motiongraph");

  const beforeGraphRuntime = await readMainRuntimeDebug(page);
  const beforeGraphArora = await readMainAroraDebug(page);
  await playTarget(liveProgram, "program");
  await expect(runtimeChip).toContainText("Program: Playing");
  await waitForMainFacadeCallCountGreaterThan(
    page,
    "graph.register",
    Number(
      (
        beforeGraphArora?.facadeCallCounts as
          | Record<string, unknown>
          | undefined
      )?.["graph.register"] ?? 0,
    ),
  );
  await expectAuthoringCompileState(page, "motiongraph", "registered");
  await waitForMainRuntimeWrites(
    page,
    Number(beforeGraphRuntime?.frameWriteCount ?? 0),
  );
  const registeredGraphArgs = readLastFacadeRequestArgs(
    await readMainAroraDebug(page),
    "graph.register",
  );
  const registeredGraph = { spec: registeredGraphArgs.spec };
  expect(
    Number(
      readGraphNodeParam({
        graph: registeredGraph,
        nodeId: "node_1772233939116_946",
        paramId: "frequency",
      }),
    ),
  ).toBe(0);
  expect(
    Number(
      readGraphSyntheticDefault({
        graph: registeredGraph,
        nodeId: "node_1773247042486_236",
        portId: "operand_1",
      }),
    ),
  ).toBeCloseTo(authoredGraphValue, 2);
  const editedGraphOutputPath = readGraphOutputPathDrivenByNode({
    graph: registeredGraph,
    nodeId: "node_1773247042486_236",
  });
  expect(editedGraphOutputPath).toMatch(/poses\/.+\.weight$/);
  await waitForMainRendererWriteCountGreaterThan(
    page,
    Number(beforeGraphRuntime?.rendererWriteCount ?? 0),
  );
  await stopActiveRuntime(page);

  await openExportDialog(page);
  const download = await expectDownload(page, async () => {
    await clickViaDom(page.getByTestId("export-glb-button"));
  });
  const exportedBundle = readRootVizijBundleFromGlb(
    await downloadedFilePath(download),
  );
  const exportedAnimation = findExportedAnimation(
    exportedBundle,
    "Nonesense Copy",
  );
  const exportedTrack = findExportedAnimationTrack(
    exportedAnimation,
    "gaze/left_right",
  );
  const exportedKeyframes = Array.isArray(exportedTrack.keyframes)
    ? exportedTrack.keyframes
    : [];
  expect(exportedTrack.interpolation).toBe("step");
  expect(
    Number((exportedKeyframes[0] as { value?: unknown } | undefined)?.value),
  ).toBeCloseTo(authoredAnimationValue, 2);

  const exportedGraph = findExportedGraph(exportedBundle, "Live");
  expect(
    Number(
      readGraphNodeParam({
        graph: exportedGraph,
        nodeId: "node_1772233939116_946",
        paramId: "frequency",
      }),
    ),
  ).toBe(0);
  expect(
    Number(
      readGraphSyntheticDefault({
        graph: exportedGraph,
        nodeId: "node_1773247042486_236",
        portId: "operand_1",
      }),
    ),
  ).toBeCloseTo(authoredGraphValue, 2);
  await page.getByRole("button", { name: "Close" }).click();

  expect(consoleErrors).toEqual([]);
});

test("round-trips authored animation and program targets through exported GLB and Arora web composed execution @workflow", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const consoleErrors = trackPageErrors(page);
  await bootAuthoring(
    page,
    "/?memoryInvestigation=1&memoryScope=main-runtime-only",
  );

  const aroraReady = waitForAroraWebResponses(page);
  await loadMainPreset(page, "quori:latest");
  await aroraReady;
  const diagnostics = await waitForMainComposedRuntimeDiagnostics(page);
  const initialFrameWriteCount = Number(
    diagnostics.runtime.frameWriteCount ?? 0,
  );
  const initialAnimationCommandCount = Number(
    diagnostics.runtime.orchestratorAnimationCommandCount ?? 0,
  );

  const runtimeChip = page.getByTestId("main-runtime-status-chip");
  await expect(runtimeChip).toHaveText("Runtime: Idle");

  await page.getByTestId("control-authoring-tab-animations").click();
  const copiedAnimation = await duplicateTargetByLabel({
    page,
    panelTestId: "control-authoring-panel-animations",
    targetKind: "animation",
    label: /Nonesense/i,
  });
  const beforeCopiedAnimationCanvas =
    await captureMainRuntimeCanvasPixels(page);
  await playTarget(copiedAnimation, "animation");
  await expect(runtimeChip).toContainText("Animation: Playing");
  await waitForMainAnimationCommandDiagnostics(
    page,
    initialAnimationCommandCount,
  );
  await waitForMainRuntimeWrites(page, initialFrameWriteCount);
  await expectMainRuntimeCanvasVisualChange(page, beforeCopiedAnimationCanvas);
  await stopActiveRuntime(page);

  await ensureAuthoringProgramsVisible(page);
  const { copiedItem: copiedProgram, copiedLabel: copiedProgramLabel } =
    await duplicateFirstTarget({
      page,
      panelTestId: "control-authoring-panel-programs",
      targetKind: "program",
    });
  const beforeProgramDiagnostics =
    await waitForMainComposedRuntimeDiagnostics(page);
  await playTarget(copiedProgram, "program");
  await expect(runtimeChip).toContainText("Program: Playing");
  await waitForMainRuntimeWrites(
    page,
    Number(beforeProgramDiagnostics.runtime.frameWriteCount ?? 0),
  );
  await stopActiveRuntime(page);

  await page.getByTestId("control-authoring-tab-animations").click();
  await expect(
    page
      .getByTestId("control-authoring-panel-animations")
      .getByTestId("authoring-animation-item")
      .filter({ hasText: /Nonesense Copy/i })
      .first(),
  ).toBeVisible();

  await openExportDialog(page);
  const download = await expectDownload(page, async () => {
    await clickViaDom(page.getByTestId("export-glb-button"));
  });
  expect(download.suggestedFilename()).toMatch(/\.glb$/i);
  const exportedGlbPath = await downloadedFilePath(download);
  const exportedBundle = readRootVizijBundleFromGlb(exportedGlbPath);
  const exportedAnimationNames = Array.isArray(exportedBundle.animations)
    ? exportedBundle.animations.map(
        (entry) => (entry as { clip?: { name?: unknown } }).clip?.name ?? null,
      )
    : [];
  expect(exportedAnimationNames).toContain("Nonesense Copy");
  const exportedProgramLabels = Array.isArray(exportedBundle.graphs)
    ? exportedBundle.graphs.map((entry) => (entry as { label?: unknown }).label)
    : [];
  expect(exportedProgramLabels).toContain(copiedProgramLabel);
  await page.getByRole("button", { name: "Close" }).click();

  await page
    .getByTestId("main-import-file-input")
    .setInputFiles(exportedGlbPath);
  await waitForMainFaceReady(page);
  const reimportedDiagnostics =
    await waitForMainComposedRuntimeDiagnostics(page);
  await expect(runtimeChip).toHaveText("Runtime: Idle");

  await page.getByTestId("control-authoring-tab-animations").click();
  const reloadedAnimation = page
    .getByTestId("control-authoring-panel-animations")
    .getByTestId("authoring-animation-item")
    .filter({ hasText: /Nonesense Copy/i })
    .first();
  await expect(reloadedAnimation).toBeVisible();
  const beforeReloadedAnimationDiagnostics =
    await waitForMainComposedRuntimeDiagnostics(page);
  await playTarget(reloadedAnimation, "animation");
  await expect(runtimeChip).toContainText("Animation: Playing");
  await waitForMainAnimationCommandDiagnostics(
    page,
    Number(
      beforeReloadedAnimationDiagnostics.runtime
        .orchestratorAnimationCommandCount ?? 0,
    ),
  );
  await waitForMainRuntimeWrites(
    page,
    Number(reimportedDiagnostics.runtime.frameWriteCount ?? 0),
  );
  await stopActiveRuntime(page);

  await ensureAuthoringProgramsVisible(page);
  const reloadedProgram = page
    .getByTestId("control-authoring-panel-programs")
    .getByTestId("authoring-program-item")
    .filter({ hasText: new RegExp(escapeRegex(copiedProgramLabel), "i") })
    .first();
  await expect(reloadedProgram).toBeVisible();
  const beforeReloadedProgramDiagnostics =
    await waitForMainComposedRuntimeDiagnostics(page);
  await playTarget(reloadedProgram, "program");
  await expect(runtimeChip).toContainText("Program: Playing");
  await waitForMainRuntimeWrites(
    page,
    Number(beforeReloadedProgramDiagnostics.runtime.frameWriteCount ?? 0),
  );

  expect(consoleErrors).toEqual([]);
});
