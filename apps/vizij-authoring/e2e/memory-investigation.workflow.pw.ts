import { createWriteStream } from "node:fs";
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
    /** The Vizij wasm module's linear memory, `memoryBytes()`. */
    vizijMemoryBytes?: number | null;
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
/**
 * The JS heap's bound in a churn: its growth per cycle, as the slope of a
 * least-squares line through the cycles' checkpoints. In the dev build the
 * same face reads 0.4–0.7 MB apart from one checkpoint to the next, and
 * the preset churn's checkpoints alternate between faces 4–5 MB apart,
 * which the slope averages out: a churn that keeps nothing measures within
 * ±0.2 MB per cycle, and one that keeps a face per cycle 3 MB or more.
 */
const JS_HEAP_SLOPE_BYTES = readEnvInt(
  "VIZIJ_MEMORY_JS_HEAP_SLOPE_BYTES",
  500_000,
);
/**
 * The Vizij module's bound in a churn: the most its linear memory may reach.
 * Linear memory never shrinks; it rises to the most the module ever held at
 * once, and a churn holds two faces at once whenever the empty state's demo
 * face is still loaded as the next face loads. Natively, a churn of Quori
 * Latest and Quori Basic holds 130–147 MB live with one face and peaks at
 * 290 MB with two, with no allocation above 6.3 MB; in the browser the
 * module reaches 313–317 MB. A face left behind by each cycle passes this
 * bound within a few cycles.
 */
const VIZIJ_MEMORY_CEILING_BYTES = readEnvInt(
  "VIZIJ_MEMORY_VIZIJ_CEILING_BYTES",
  336 * 1024 * 1024,
);
/** Forced-collection readings of the JS heap per checkpoint, of which the
 * least is the checkpoint's. */
const JS_HEAP_READINGS = 3;
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

/**
 * Clear the page's performance measures. React's development build records
 * one per component render it times, with the render's props diff cloned
 * into it, and the page keeps every one until they are cleared. They are
 * the dev build's, not the app's, memory, and over a long churn cloning one
 * more runs out of memory and breaks React's commit.
 */
async function clearReactMeasures(page: Page): Promise<void> {
  await page.evaluate(() => performance.clearMeasures());
}

async function captureCheckpoint(
  page: Page,
  session: any,
  label: string,
  metadata?: Record<string, unknown>,
): Promise<MemoryCheckpoint> {
  await clearReactMeasures(page);
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

  // `performance.memory` is bucketed and refreshed rarely unless Chromium
  // runs with `--enable-precise-memory-info`; the inspector's heap usage,
  // read right after a collection, is exact. What survives a collection
  // still varies from one to the next; the least of a few readings is the
  // checkpoint's.
  try {
    let least: { usedSize: number; totalSize: number } | null = null;
    for (let reading = 0; reading < JS_HEAP_READINGS; reading += 1) {
      await forceGarbageCollection(session);
      const usage = (await session.send("Runtime.getHeapUsage")) as {
        usedSize: number;
        totalSize: number;
      };
      if (!least || usage.usedSize < least.usedSize) least = usage;
    }
    checkpoint.browser.jsHeap = {
      ...checkpoint.browser.jsHeap,
      usedJSHeapSize: least!.usedSize,
      totalJSHeapSize: least!.totalSize,
    };
  } catch {
    // The page's own reading stands.
  }

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

/** The scenarios whose churn must leave memory where it was. */
const BOUNDED_SCENARIOS = new Set(["preset-churn", "reference-face-churn"]);

/** A churn checkpoint's cycle, from its `cycle-NN` label; `null` for the
 * checkpoint taken before the first cycle. */
function cycleOf(checkpoint: MemoryCheckpoint): number | null {
  const match = /cycle-(\d+)$/.exec(checkpoint.label);
  return match ? Number(match[1]) : null;
}

/** The slope of the least-squares line through `points`, per unit of x;
 * `null` with fewer than two points. */
function slope(points: Array<{ x: number; y: number }>): number | null {
  if (points.length < 2) return null;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / points.length;
  let covariance = 0;
  let variance = 0;
  for (const p of points) {
    covariance += (p.x - meanX) * (p.y - meanY);
    variance += (p.x - meanX) ** 2;
  }
  return variance === 0 ? null : covariance / variance;
}

/**
 * What a churn left behind:
 *
 * - `jsHeapSlope`: the JS heap's growth per cycle, the slope through the
 *   checkpoints from the second cycle on. The first cycle loads the churn's
 *   other face for the first time.
 * - `vizijMemoryMax`: the most the Vizij module's linear memory reached.
 */
function leftBehind(result: ScenarioResult): {
  jsHeapSlope: number | null;
  vizijMemoryMax: number | null;
} {
  const heap = result.checkpoints.flatMap((checkpoint) => {
    const cycle = cycleOf(checkpoint);
    const bytes = checkpoint.browser.jsHeap?.usedJSHeapSize;
    return cycle !== null && cycle >= 2 && typeof bytes === "number"
      ? [{ x: cycle, y: bytes }]
      : [];
  });
  const vizij = result.checkpoints.flatMap((checkpoint) => {
    const bytes = checkpoint.browser.vizijMemoryBytes;
    return typeof bytes === "number" ? [bytes] : [];
  });
  return {
    jsHeapSlope: slope(heap),
    vizijMemoryMax: vizij.length > 0 ? Math.max(...vizij) : null,
  };
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
  // A snapshot of the dev build's heap is larger than the longest string V8
  // holds: each chunk goes to the file as it arrives.
  const file = createWriteStream(outputPath, "utf8");
  const handleChunk = (event: { chunk: string }) => {
    file.write(event.chunk);
  };

  session.on("HeapProfiler.addHeapSnapshotChunk", handleChunk);
  try {
    await session.send("HeapProfiler.takeHeapSnapshot", {
      reportProgress: false,
    });
  } finally {
    session.off("HeapProfiler.addHeapSnapshotChunk", handleChunk);
    await new Promise<void>((resolve, reject) =>
      file.end((error?: Error | null) => (error ? reject(error) : resolve())),
    );
  }
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
  await clearReactMeasures(page);
  await page.getByTestId("app-menu-file").click();
  const newScene = page.getByRole("menuitem", { name: "New" });
  await newScene.click();
  // The next step presses a preset under where the menu draws: it must be
  // closed first.
  if (await newScene.isVisible()) {
    await page.keyboard.press("Escape");
  }
  await expect(newScene).toBeHidden({ timeout: 30_000 });
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
  let leakLikely: boolean;

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
        const nextPreset = index % 2 === 0 ? "quori:basic" : "quori:latest";
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
  await loadReferencePreset(page, "quori:basic");

  return runMeasuredScenario(
    page,
    session,
    testInfo,
    "reference-face-churn",
    "full",
    async (record) => {
      await record("start");
      for (let index = 0; index < REFERENCE_FACE_CYCLES; index += 1) {
        await clearReactMeasures(page);
        await page.getByTestId("reference-face-unload").click();
        await expect(
          page.getByTestId("reference-face-empty-state"),
        ).toBeVisible();
        await page.getByTestId("reference-face-preset-quori-basic").click();
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
    "| Scenario | Scope | Checkpoint | JS heap MB | Vizij memory MB | UA memory MB | DOM nodes | Event listeners | Leak likely |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
  ];

  results.forEach((result) => {
    result.checkpoints.forEach((checkpoint) => {
      lines.push(
        [
          result.scenario,
          result.scope,
          checkpoint.label,
          toMb(checkpoint.browser.jsHeap?.usedJSHeapSize),
          toMb(checkpoint.browser.vizijMemoryBytes),
          toMb(checkpoint.browser.userAgentSpecificMemory?.bytes),
          checkpoint.domCounters?.nodes ?? "n/a",
          checkpoint.domCounters?.jsEventListeners ?? "n/a",
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
    // A face load per cycle, at up to a minute each on a busy host.
    test.setTimeout(
      20 * 60_000 + 60_000 * (3 * PRESET_CYCLES + REFERENCE_FACE_CYCLES),
    );

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
      // A dev server runs the app in StrictMode, whose doubled effects mount,
      // unmount and mount again each face's provider and slot.
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
    for (const result of results) {
      if (!BOUNDED_SCENARIOS.has(result.scenario)) continue;
      const { jsHeapSlope, vizijMemoryMax } = leftBehind(result);
      const name = `${result.scenario} (${result.scope})`;
      console.log(
        `${name}: JS heap ${toMb(jsHeapSlope)} MB per cycle, Vizij memory at most ${toMb(vizijMemoryMax)} MB`,
      );
      if (jsHeapSlope !== null) {
        expect
          .soft(
            jsHeapSlope,
            `${name}: the JS heap grows by less than ${JS_HEAP_SLOPE_BYTES} bytes per cycle`,
          )
          .toBeLessThan(JS_HEAP_SLOPE_BYTES);
      }
      if (vizijMemoryMax !== null) {
        expect
          .soft(
            vizijMemoryMax,
            `${name}: Vizij memory stays within ${VIZIJ_MEMORY_CEILING_BYTES} bytes`,
          )
          .toBeLessThanOrEqual(VIZIJ_MEMORY_CEILING_BYTES);
      }
    }
  });
});
