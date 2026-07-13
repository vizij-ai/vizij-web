import { test, expect } from "@playwright/test";
import { STANDALONE_DEMOS, demoUrl } from "../standalone-demos";

// Regression for the arora value-marshalling bug: `demo-vizij-player` mounts the
// arora runtime (`@vizij/runtime-react` → `@vizij/arora-web-wasm`). Loading a
// sample drives `setValue` with vizij `ValueJSON` shorthand (`{"float": …}`,
// `{"vec3": …}`); the arora store speaks the canonical `Value` serde (`{"f32": …}`),
// so before @vizij/arora-web-wasm@0.1.2 every write threw `unknown variant 'float'`
// and surfaced as "Failed to create orchestrator runtime". The boot-only smoke
// (standalone-demos-smoke) never loaded a sample, so it missed this. This test
// loads the curated sample and asserts the runtime accepts the values.
//
// It ignores WebGL context errors: the three.js face renderer needs a GL context,
// which only exists headlessly via the swiftshader launch flags in
// playwright.config.ts; a GL hiccup is not what this test guards.
const player = STANDALONE_DEMOS.find((d) => d.filter === "demo-vizij-player");
if (!player) throw new Error("demo-vizij-player missing from STANDALONE_DEMOS");

const RUNTIME_ERROR =
  /unknown variant|Failed to create orchestrator|expected magic word|failed to init wasm/i;

test("demo-vizij-player loads a sample without a runtime value error", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  const record = (msg: string) => {
    if (RUNTIME_ERROR.test(msg)) runtimeErrors.push(msg);
  };
  page.on("pageerror", (e) => record(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") record(m.text());
  });

  await page.goto(demoUrl(player));
  // The curated-library "Load sample" button loads the Quori bundle and creates
  // the arora device with its real graph, then drives it.
  await page
    .getByRole("button", { name: /load sample/i })
    .first()
    .click();
  // Let the device create + a few frames of setValue/step run.
  await page.waitForTimeout(8_000);

  expect(
    runtimeErrors,
    `arora runtime value errors:\n${runtimeErrors.join("\n")}`,
  ).toHaveLength(0);
});
