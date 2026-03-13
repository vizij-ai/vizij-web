import { writeFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  bootAuthoring,
  loadMainPreset,
  loadReferencePreset,
  sanitizePresetId,
} from "./helpers";

type MemoryScope = "full" | "main-runtime-only" | "authoring-only";

type MemoryCheckpoint = {
  label: string;
  timestampMs: number;
  flags: {
    enabled: boolean;
    scope: MemoryScope;
    mainRuntimeEnabled: boolean;
    referenceRuntimeEnabled: boolean;
  };
  authoring: Record<string, unknown>;
  graphRuntime: Record<string, unknown>;
  runtimes: Record<string, Record<string, unknown>>;
  render: Record<string, unknown>;
  browser: {
    jsHeap?: {
      usedJSHeapSize?: number | null;
      totalJSHeapSize?: number | null;
      jsHeapSizeLimit?: number | null;
    } | null;
    userAgentSpecificMemory?: {
      bytes?: number | null;
      breakdownCount?: number | null;
      error?: string;
    } | null;
  };
  domCounters?: {
    documents: number;
    nodes: number;
    jsEventListeners: number;
  } | null;
};

type ScenarioResult = {
  serverMode: string;
  scenario: string;
  scope: MemoryScope;
  checkpoints: MemoryCheckpoint[];
  leakLikely: boolean;
  allocationProfilePath: string | null;
  heapSnapshotPath: string | null;
};

const SERVER_MODE = process.env.VIZIJ_MEMORY_SERVER_MODE ?? "preview";
const IDLE_MS = readEnvInt("VIZIJ_MEMORY_IDLE_MS", 120_000);
const IDLE_CHECKPOINT_MS = readEnvInt(
  "VIZIJ_MEMORY_IDLE_CHECKPOINT_MS",
  30_000,
);
const PRESET_CYCLES = readEnvInt("VIZIJ_MEMORY_PRESET_CYCLES", 25);
const REFERENCE_FACE_CYCLES = readEnvInt("VIZIJ_MEMORY_REFERENCE_CYCLES", 25);
const PLAYBACK_CYCLES = readEnvInt("VIZIJ_MEMORY_PLAYBACK_CYCLES", 50);
const CHECKPOINT_INTERVAL = readEnvInt("VIZIJ_MEMORY_CHECKPOINT_INTERVAL", 5);
const GROWTH_DELTA_BYTES = readEnvInt(
  "VIZIJ_MEMORY_GROWTH_DELTA_BYTES",
  1_000_000,
);
const SAMPLING_INTERVAL_BYTES = 32 * 1024;
const CAPTURE_HEAP_ON_LEAK =
  process.env.VIZIJ_MEMORY_CAPTURE_HEAP_ON_LEAK !== "0";
const SCENARIO_FILTER = new Set(
  (process.env.VIZIJ_MEMORY_SCENARIOS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const SCOPE_FILTER = new Set(
  (process.env.VIZIJ_MEMORY_SCOPES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

function readEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildInvestigationPath(scope: MemoryScope): string {
  const params = new URLSearchParams({
    memoryInvestigation: "1",
    memoryScope: scope,
  });
  return `/?${params.toString()}`;
}

function isScenarioEnabled(name: string): boolean {
  return SCENARIO_FILTER.size === 0 || SCENARIO_FILTER.has(name);
}

function getEnabledScopes(scopes: MemoryScope[]): MemoryScope[] {
  if (SCOPE_FILTER.size === 0) {
    return scopes;
  }
  return scopes.filter((scope) => SCOPE_FILTER.has(scope));
}

async function waitForMemoryDebug(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    return (
      typeof (window as any).__vizijMemoryDebug?.captureCheckpoint ===
      "function"
    );
  });
}

async function forceGarbageCollection(session: any): Promise<void> {
  try {
    await session.send("HeapProfiler.collectGarbage");
  } catch {
    try {
      await session.send("Runtime.collectGarbage");
    } catch {
      // Best-effort only.
    }
  }
}

async function captureCheckpoint(
  page: Page,
  session: any,
  label: string,
  metadata?: Record<string, unknown>,
): Promise<MemoryCheckpoint> {
  await forceGarbageCollection(session);
  const checkpoint = (await page.evaluate(
    async ({ nextLabel, nextMetadata }) => {
      const api = (window as any).__vizijMemoryDebug;
      if (!api) {
        throw new Error("window.__vizijMemoryDebug is not available");
      }
      return api.captureCheckpoint(nextLabel, nextMetadata);
    },
    { nextLabel: label, nextMetadata: metadata ?? null },
  )) as MemoryCheckpoint;

  try {
    checkpoint.domCounters = (await session.send("Memory.getDOMCounters")) as {
      documents: number;
      nodes: number;
      jsEventListeners: number;
    };
  } catch {
    checkpoint.domCounters = null;
  }

  return checkpoint;
}

function primaryMemoryBytes(checkpoint: MemoryCheckpoint): number | null {
  const userAgentBytes = checkpoint.browser.userAgentSpecificMemory?.bytes;
  if (typeof userAgentBytes === "number") {
    return userAgentBytes;
  }
  const jsHeapBytes = checkpoint.browser.jsHeap?.usedJSHeapSize;
  return typeof jsHeapBytes === "number" ? jsHeapBytes : null;
}

function detectMonotonicGrowth(checkpoints: MemoryCheckpoint[]): boolean {
  const usable = checkpoints
    .map((checkpoint) => primaryMemoryBytes(checkpoint))
    .filter((value): value is number => typeof value === "number");

  if (usable.length < 3) {
    return false;
  }

  const lastThree = usable.slice(-3);
  return (
    lastThree[0] < lastThree[1] &&
    lastThree[1] < lastThree[2] &&
    lastThree[2] - lastThree[0] >= GROWTH_DELTA_BYTES
  );
}

async function writeAllocationProfile(
  session: any,
  outputPath: string,
): Promise<void> {
  const { profile } = await session.send("HeapProfiler.stopSampling");
  await writeFile(outputPath, JSON.stringify(profile, null, 2), "utf8");
}

async function writeHeapSnapshot(
  session: any,
  outputPath: string,
): Promise<void> {
  const chunks: string[] = [];
  const handleChunk = (event: { chunk: string }) => {
    chunks.push(event.chunk);
  };

  session.on("HeapProfiler.addHeapSnapshotChunk", handleChunk);
  try {
    await session.send("HeapProfiler.takeHeapSnapshot", {
      reportProgress: false,
    });
  } finally {
    session.off("HeapProfiler.addHeapSnapshotChunk", handleChunk);
  }

  await writeFile(outputPath, chunks.join(""), "utf8");
}

async function loadPresetForScope(
  page: Page,
  scope: MemoryScope,
  presetId: string,
): Promise<void> {
  await page.getByTestId(`main-preset-${sanitizePresetId(presetId)}`).click();
  if (scope === "authoring-only") {
    await expect(page.getByTestId("main-runtime-disabled-state")).toBeVisible({
      timeout: 120_000,
    });
    return;
  }
  await expect(page.getByTestId("main-runtime-view")).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByTestId("main-runtime-status")).toContainText(
    "runtime: ready",
    {
      timeout: 120_000,
    },
  );
  await page.waitForFunction(() => {
    const state = (window as any).__vizijMemoryDebugState;
    const runtimeState = state?.graphRuntime;
    if (!runtimeState || typeof runtimeState !== "object") {
      return false;
    }
    return (
      runtimeState.graphStatus === "ready" &&
      runtimeState.runtimeViewReady === true &&
      runtimeState.runtimeViewLoading === false
    );
  });
  await expect(page.getByTestId("main-viewer-empty-state")).toBeHidden();
}

async function clickButtonByTitle(page: Page, title: string): Promise<void> {
  await page
    .locator(`button[title="${title}"]`)
    .first()
    .evaluate((node) => {
      (node as HTMLButtonElement).click();
    });
}

async function resetMainScene(page: Page): Promise<void> {
  await page.getByTestId("app-menu-file").click();
  await page.getByRole("menuitem", { name: "New" }).click();
  await expect(page.getByTestId("main-viewer-empty-state")).toBeVisible({
    timeout: 30_000,
  });
}

async function runMeasuredScenario(
  page: Page,
  session: any,
  testInfo: TestInfo,
  scenario: string,
  scope: MemoryScope,
  runner: (record: (label: string) => Promise<void>) => Promise<void>,
): Promise<ScenarioResult> {
  const checkpoints: MemoryCheckpoint[] = [];
  const checkpointPrefix = `${SERVER_MODE}:${scope}:${scenario}`;
  const record = async (label: string) => {
    checkpoints.push(
      await captureCheckpoint(page, session, `${checkpointPrefix}:${label}`, {
        serverMode: SERVER_MODE,
        scope,
        scenario,
      }),
    );
  };

  await session.send("HeapProfiler.startSampling", {
    samplingInterval: SAMPLING_INTERVAL_BYTES,
  });

  let allocationProfilePath: string | null = null;
  let heapSnapshotPath: string | null = null;
  let leakLikely = false;

  try {
    await runner(record);
    leakLikely = detectMonotonicGrowth(checkpoints);

    if (leakLikely && CAPTURE_HEAP_ON_LEAK) {
      allocationProfilePath = testInfo.outputPath(
        `${checkpointPrefix}-allocation-profile.json`,
      );
      await writeAllocationProfile(session, allocationProfilePath);

      heapSnapshotPath = testInfo.outputPath(
        `${checkpointPrefix}-heap.heapsnapshot`,
      );
      await writeHeapSnapshot(session, heapSnapshotPath);
    }
  } finally {
    if (!allocationProfilePath) {
      try {
        await session.send("HeapProfiler.stopSampling");
      } catch {
        // Ignore teardown-only failures.
      }
    }
  }

  return {
    serverMode: SERVER_MODE,
    scenario,
    scope,
    checkpoints,
    leakLikely,
    allocationProfilePath,
    heapSnapshotPath,
  };
}

async function runIdleScenario(
  page: Page,
  session: any,
  testInfo: TestInfo,
): Promise<ScenarioResult> {
  await bootAuthoring(page, buildInvestigationPath("full"));
  await waitForMemoryDebug(page);
  await loadMainPreset(page, "quori:latest");

  return runMeasuredScenario(
    page,
    session,
    testInfo,
    "idle-after-load",
    "full",
    async (record) => {
      await record("loaded");
      const checkpoints = Math.max(1, Math.floor(IDLE_MS / IDLE_CHECKPOINT_MS));
      for (let index = 1; index <= checkpoints; index += 1) {
        await page.waitForTimeout(IDLE_CHECKPOINT_MS);
        await record(`idle-${index}`);
      }
    },
  );
}

async function runPresetChurnScenario(
  page: Page,
  session: any,
  testInfo: TestInfo,
  scope: MemoryScope,
): Promise<ScenarioResult> {
  await bootAuthoring(page, buildInvestigationPath(scope));
  await waitForMemoryDebug(page);
  await loadPresetForScope(page, scope, "quori:latest");

  return runMeasuredScenario(
    page,
    session,
    testInfo,
    "preset-churn",
    scope,
    async (record) => {
      await record("start");
      for (let index = 0; index < PRESET_CYCLES; index += 1) {
        const nextPreset = index % 2 === 0 ? "hugo:basic" : "quori:latest";
        await resetMainScene(page);
        await loadPresetForScope(page, scope, nextPreset);
        if (
          (index + 1) % CHECKPOINT_INTERVAL === 0 ||
          index === PRESET_CYCLES - 1
        ) {
          await record(`cycle-${String(index + 1).padStart(2, "0")}`);
        }
      }
    },
  );
}

async function runReferenceFaceScenario(
  page: Page,
  session: any,
  testInfo: TestInfo,
): Promise<ScenarioResult> {
  await bootAuthoring(page, buildInvestigationPath("full"));
  await waitForMemoryDebug(page);
  await loadMainPreset(page, "quori:latest");
  await loadReferencePreset(page, "hugo:latest");

  return runMeasuredScenario(
    page,
    session,
    testInfo,
    "reference-face-churn",
    "full",
    async (record) => {
      await record("start");
      for (let index = 0; index < REFERENCE_FACE_CYCLES; index += 1) {
        await page.getByTestId("reference-face-unload").click();
        await expect(
          page.getByTestId("reference-face-empty-state"),
        ).toBeVisible();
        await page.getByTestId("reference-face-preset-hugo-latest").click();
        await expect(page.getByTestId("reference-face-runtime")).toBeVisible({
          timeout: 120_000,
        });
        if (
          (index + 1) % CHECKPOINT_INTERVAL === 0 ||
          index === REFERENCE_FACE_CYCLES - 1
        ) {
          await record(`cycle-${String(index + 1).padStart(2, "0")}`);
        }
      }
    },
  );
}

async function runPlaybackScenario(
  page: Page,
  session: any,
  testInfo: TestInfo,
): Promise<ScenarioResult> {
  await bootAuthoring(page, buildInvestigationPath("full"));
  await waitForMemoryDebug(page);
  await loadMainPreset(page, "quori:latest");

  return runMeasuredScenario(
    page,
    session,
    testInfo,
    "animation-program-playback",
    "full",
    async (record) => {
      await record("start");
      await page.getByRole("tab", { name: /^Animations \(\d+\)$/ }).click();
      for (let index = 0; index < PLAYBACK_CYCLES; index += 1) {
        await clickButtonByTitle(page, "Play animation");
        await clickButtonByTitle(page, "Pause animation");
        await clickButtonByTitle(page, "Stop animation");
        if (
          (index + 1) % CHECKPOINT_INTERVAL === 0 ||
          index === PLAYBACK_CYCLES - 1
        ) {
          await record(`animation-${String(index + 1).padStart(2, "0")}`);
        }
      }

      await page.getByRole("tab", { name: /^Programs \(\d+\)$/ }).click();
      for (let index = 0; index < PLAYBACK_CYCLES; index += 1) {
        await clickButtonByTitle(page, "Play program");
        await clickButtonByTitle(page, "Pause program");
        await clickButtonByTitle(page, "Stop program");
        if (
          (index + 1) % CHECKPOINT_INTERVAL === 0 ||
          index === PLAYBACK_CYCLES - 1
        ) {
          await record(`program-${String(index + 1).padStart(2, "0")}`);
        }
      }
    },
  );
}

function toMb(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "n/a";
  }
  return (value / (1024 * 1024)).toFixed(1);
}

function renderMarkdownSummary(results: ScenarioResult[]): string {
  const lines = [
    "# Memory Investigation Summary",
    "",
    `Server mode: \`${SERVER_MODE}\``,
    "",
    "| Scenario | Scope | Checkpoint | JS heap MB | UA memory MB | DOM nodes | Event listeners | Render loads | Runtime instances | Leak likely |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];

  results.forEach((result) => {
    result.checkpoints.forEach((checkpoint) => {
      lines.push(
        [
          result.scenario,
          result.scope,
          checkpoint.label,
          toMb(checkpoint.browser.jsHeap?.usedJSHeapSize),
          toMb(checkpoint.browser.userAgentSpecificMemory?.bytes),
          checkpoint.domCounters?.nodes ?? "n/a",
          checkpoint.domCounters?.jsEventListeners ?? "n/a",
          checkpoint.render.gltfLoadCount ?? "n/a",
          Object.keys(checkpoint.runtimes).length,
          result.leakLikely ? "yes" : "no",
        ].join(" | "),
      );
    });
  });

  return `${lines.join("\n")}\n`;
}

test.describe("memory investigation workflow", () => {
  test("captures memory checkpoints across authoring and runtime churn @workflow", async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(20 * 60_000);

    const session = await context.newCDPSession(page);
    await session.send("HeapProfiler.enable");

    const results: ScenarioResult[] = [];

    if (SERVER_MODE === "preview") {
      if (isScenarioEnabled("idle-after-load")) {
        results.push(await runIdleScenario(page, session, testInfo));
      }
      if (isScenarioEnabled("preset-churn")) {
        for (const scope of getEnabledScopes([
          "full",
          "main-runtime-only",
          "authoring-only",
        ])) {
          results.push(
            await runPresetChurnScenario(page, session, testInfo, scope),
          );
        }
      }
      if (isScenarioEnabled("reference-face-churn")) {
        results.push(await runReferenceFaceScenario(page, session, testInfo));
      }
      if (isScenarioEnabled("animation-program-playback")) {
        results.push(await runPlaybackScenario(page, session, testInfo));
      }
    } else {
      if (isScenarioEnabled("preset-churn")) {
        for (const scope of getEnabledScopes([
          "full",
          "main-runtime-only",
          "authoring-only",
        ])) {
          results.push(
            await runPresetChurnScenario(page, session, testInfo, scope),
          );
        }
      }
    }

    const jsonPath = testInfo.outputPath(
      `memory-investigation-${SERVER_MODE}.json`,
    );
    await writeFile(jsonPath, JSON.stringify(results, null, 2), "utf8");

    const summaryPath = testInfo.outputPath(
      `memory-investigation-${SERVER_MODE}.md`,
    );
    await writeFile(summaryPath, renderMarkdownSummary(results), "utf8");

    await testInfo.attach(`memory-investigation-${SERVER_MODE}.json`, {
      path: jsonPath,
      contentType: "application/json",
    });
    await testInfo.attach(`memory-investigation-${SERVER_MODE}.md`, {
      path: summaryPath,
      contentType: "text/markdown",
    });

    expect(results.length).toBeGreaterThan(0);
  });
});
