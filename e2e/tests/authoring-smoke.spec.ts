import { test, expect } from "@playwright/test";

// Light suite (CI): the editing workspace boots and renders without errors.
// This is the canary for "the Vizij app / workspace is broken" regressions —
// wasm packages failing to load, a crashed React root, or a module-level
// exception all fail here.

test("the authoring workspace boots without page errors", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.goto("/");

  // The React root must render actual UI, not stay empty (a crashed app
  // leaves #root empty while the HTTP request still succeeds).
  const root = page.locator("#root");
  await expect(root).not.toBeEmpty({ timeout: 30_000 });

  // Give lazy wasm modules a moment to initialize, then assert nothing threw.
  await page.waitForTimeout(2_000);
  expect(
    pageErrors,
    `page errors: ${pageErrors.map((e) => e.message).join("; ")}`,
  ).toHaveLength(0);
});
