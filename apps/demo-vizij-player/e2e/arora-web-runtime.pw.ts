import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

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
  "public/arora-web/modules/vizij-orchestrator/module.json",
  "public/arora-web/modules/vizij-orchestrator/arora_vizij_orchestrator.wasm",
  "public/arora-web/modules/vizij-orchestrator-composed/module.json",
  "public/arora-web/modules/vizij-orchestrator-composed/arora_vizij_orchestrator_composed.wasm",
];

function assertPreparedAroraAssets() {
  const missing = requiredAroraAssets.filter(
    (relativePath) => !fs.existsSync(path.join(appRoot, relativePath)),
  );
  if (missing.length > 0) {
    throw new Error(
      [
        "Missing prepared Arora web assets for demo-vizij-player.",
        "Run:",
        "ARORA_ENGINE_PATH=/path/to/engine-vizij-backend-experiment pnpm --filter demo-vizij-player prepare:arora-web",
        "",
        "If the engine checkout is a sibling named engine-vizij-backend-experiment, ARORA_ENGINE_PATH can be omitted.",
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

async function loadCuratedSample(page: Page, query = "") {
  await page.goto(`/${query}`);
  await page.getByRole("button", { name: "Load sample" }).click();

  const diagnosticsPanel = page.locator(
    'section[aria-labelledby="diagnostics-title"]',
  );
  const runtimeControllers = diagnosticsPanel
    .locator(".diagnostics-block")
    .filter({ hasText: "Runtime controllers" });
  const rendererOutputs = diagnosticsPanel
    .locator(".diagnostics-block")
    .filter({ hasText: "Renderer outputs" });

  await expect(page.getByRole("heading", { name: "Face stage" })).toBeVisible();
  await expect(runtimeControllers.locator("li").first()).toBeVisible();
  await expect(rendererOutputs.locator("li").first()).toBeVisible();
  await expect(page.getByText("No runtime errors captured.")).toBeVisible();
}

async function enableRuntimeDebug(page: Page) {
  await page.addInitScript(() => {
    (
      globalThis as typeof globalThis & {
        __VIZIJ_MEMORY_INVESTIGATION__?: { enabled?: boolean };
      }
    ).__VIZIJ_MEMORY_INVESTIGATION__ = { enabled: true };
  });
}

async function waitForGraphDrivenAnimationWrites(page: Page) {
  await page.waitForFunction(
    () => {
      const memoryState = (window as any).__vizijMemoryDebugState;
      const runtimes = Object.values(memoryState?.runtimes ?? {}) as Array<
        Record<string, unknown>
      >;
      const runtime = runtimes.find(
        (entry) =>
          entry.orchestratorBackend === "aroraWeb" && entry.ready === true,
      );
      if (!runtime) {
        return false;
      }
      if (
        Number(runtime.orchestratorAnimationCommandCount ?? 0) <= 0 ||
        Number(runtime.orchestratorAnimationFallbackCount ?? 0) !== 0 ||
        Number(runtime.hostAnimationSampleCount ?? 0) !== 0
      ) {
        return false;
      }
      const samples = Array.isArray(runtime.lastRendererWriteSamples)
        ? runtime.lastRendererWriteSamples
        : [];
      return samples.some((sample) => {
        const id = String((sample as { id?: unknown }).id ?? "");
        return /(^|\/)pose\/control\//.test(id);
      });
    },
    undefined,
    { timeout: 30_000 },
  );
}

test.beforeAll(() => {
  assertPreparedAroraAssets();
});

test("loads the curated face through the composed Arora web backend and drives animation", async ({
  page,
}) => {
  await enableRuntimeDebug(page);
  const consoleErrors = trackPageErrors(page);
  await loadCuratedSample(page);

  await expect(page.getByText("Backend: Arora web engine")).toHaveText(
    "Backend: Arora web engine (composed)",
  );

  const animationPanel = page.locator(
    'section[aria-labelledby="animation-panel-title"]',
  );
  await expect(
    animationPanel.getByRole("button", { name: /^Play / }),
  ).toBeVisible();
  await animationPanel.getByRole("button", { name: /^Play / }).click();
  await expect(animationPanel.getByText("Playing").first()).toBeVisible();
  await waitForGraphDrivenAnimationWrites(page);

  const enableLoopButton = animationPanel.getByRole("button", {
    name: /^Enable loop /,
  });
  if (await enableLoopButton.isVisible()) {
    await enableLoopButton.click();
    await expect(animationPanel.getByText("Loop On")).toBeVisible();
  }

  await animationPanel
    .getByRole("slider", { name: "Seek" })
    .evaluate((slider: HTMLInputElement) => {
      slider.value = "0.25";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      slider.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await expect(animationPanel.locator("output")).toContainText("s");

  await animationPanel.getByRole("button", { name: /^Stop / }).click();
  await expect(animationPanel.getByText("Idle").first()).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("keeps the compatibility Arora web module available as a fallback", async ({
  page,
}) => {
  const consoleErrors = trackPageErrors(page);
  await loadCuratedSample(page, "?orchestrator=compat");

  await expect(page.getByText("Backend: Arora web engine")).toHaveText(
    "Backend: Arora web engine (compatibility)",
  );
  expect(consoleErrors).toEqual([]);
});
