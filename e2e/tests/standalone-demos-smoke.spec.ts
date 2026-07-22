import { test, expect } from "@playwright/test";
import { STANDALONE_DEMOS, demoUrl } from "../standalone-demos";

// Light suite (CI): each standalone demo boots and renders without page errors.
// These demos drive the wasm packages (animation / node-graph)
// and the renderer end to end, so a failed wasm load, a crashed React root, or
// a module-level exception all surface here — the canary that a standalone demo
// regressed. One test per demo (see standalone-demos.ts); each runs on its own
// dev server, so we navigate to its absolute URL.
for (const demo of STANDALONE_DEMOS) {
  test(`${demo.filter} boots without page errors`, async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await page.goto(demoUrl(demo));

    // The React root must render actual UI, not stay empty (a crashed app leaves
    // #root empty while the HTTP request still succeeds).
    const root = page.locator("#root");
    await expect(root).not.toBeEmpty({ timeout: 30_000 });

    // Give the lazy wasm packages a moment to initialize, then assert nothing threw.
    await page.waitForTimeout(2_000);
    expect(
      pageErrors,
      `page errors: ${pageErrors.map((e) => e.message).join("; ")}`,
    ).toHaveLength(0);
  });
}
