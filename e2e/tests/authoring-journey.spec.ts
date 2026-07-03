import { test, expect } from "@playwright/test";

// Heavy suite (on demand: `pnpm run e2e:heavy`): drives real editing
// interactions in the workspace. Kept out of CI because it is slower and
// more UI-coupled; run it before releases or after changes to the editing
// surface. Selectors are intentionally role-based; when the workspace gains
// data-testid hooks, tighten them.

test.skip(!process.env.RUN_HEAVY, "heavy suite: set RUN_HEAVY=1 to run");

test("the workspace exposes its primary editing surfaces", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#root")).not.toBeEmpty({ timeout: 30_000 });

  // The workspace should expose interactive controls (buttons, menus) —
  // an interaction-free page means the shell rendered but the app did not.
  const buttons = page.getByRole("button");
  await expect
    .poll(async () => buttons.count(), { timeout: 15_000 })
    .toBeGreaterThan(0);

  // Every button that opens a menu/dialog must not crash the page.
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  const count = Math.min(await buttons.count(), 5);
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    if (await button.isVisible()) {
      await button.click({ trial: false }).catch(() => {});
      await page.keyboard.press("Escape").catch(() => {});
    }
  }
  expect(pageErrors).toHaveLength(0);
});
