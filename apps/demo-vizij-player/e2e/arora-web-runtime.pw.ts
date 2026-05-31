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
        "ARORA_ENGINE_PATH=/home/chris/Code/semio_ws/_worktrees/engine-vizij-backend-experiment pnpm --filter demo-vizij-player prepare:arora-web",
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

test.beforeAll(() => {
  assertPreparedAroraAssets();
});

test("loads the curated face through the composed Arora web backend and drives animation", async ({
  page,
}) => {
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
