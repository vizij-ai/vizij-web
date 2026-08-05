import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bootAuthoring,
  ensureInspectorPanelVisible,
  loadMainPreset,
  openAdvancedExportOptions,
  openExportDialog,
} from "./helpers";

/**
 * Visual regression baselines for the UI primitive layer.
 *
 * These exist to make the `@semio/ui` migration reviewable: the primitives have
 * no Storybook and no other visual harness, so a change to `Button` or `Panel`
 * would otherwise land across 600+ call sites with nothing to compare against.
 *
 * Design notes:
 * - Screenshots are **element-scoped**, never full-page. The 3D `Viewer` canvas
 *   renders a live WebGL face and would make any full-page shot flake.
 * - Theme is seeded through `localStorage` before first paint (the same key the
 *   FOUC script in `index.html` reads), so light mode is captured without
 *   clicking `ThemeToggle` and waiting for a transition.
 * - Animations are disabled so the `animate-in`/`fade-in` enter transitions
 *   cannot race the capture.
 *
 * Baselines were captured BEFORE `@semio/ui` was introduced. Update them only
 * with an intentional, reviewed visual change — never to "make it pass".
 */

type Theme = "dark" | "light";

const THEMES: Theme[] = ["dark", "light"];

/** Matches zustand `persist`'s serialized shape for the `vizij-theme` store. */
async function seedTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    ["vizij-theme", JSON.stringify({ state: { theme }, version: 0 })] as const,
  );
}

async function settle(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.fonts.status))
    .toBe("loaded");
}

/**
 * Wait until a locator's box stops changing before capturing it.
 *
 * Panels live inside `react-resizable-panels`, and several `defaultSize` values
 * are conditional on sibling visibility (e.g. `right-top` is 28% when the debug
 * panel is showing and 100% when it is not). Panel visibility resolves
 * asynchronously from persisted state, so a panel can be visible at one height
 * and then reflow. Element-scoped screenshots compare dimensions, so capturing
 * mid-reflow fails as a size mismatch rather than a pixel diff — which reads as
 * a visual regression when it is really a race.
 */
async function waitForStableBox(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  let previous = "";
  await expect
    .poll(
      async () => {
        const box = await locator.boundingBox();
        const current = box
          ? `${Math.round(box.width)}x${Math.round(box.height)}`
          : "";
        const stable = current !== "" && current === previous;
        previous = current;
        return stable;
      },
      { timeout: 15_000, intervals: [150, 150, 250, 250, 500] },
    )
    .toBe(true);
}

async function shoot(locator: Locator, name: string): Promise<void> {
  await waitForStableBox(locator);
  await expect(locator).toHaveScreenshot(name, {
    animations: "disabled",
    maxDiffPixelRatio: 0.01,
  });
}

for (const theme of THEMES) {
  test.describe(`visual — ${theme}`, () => {
    test.use({
      // Fixed viewport so panel widths (and therefore wrapping) are stable.
      viewport: { width: 1440, height: 900 },
    });

    test.beforeEach(async ({ page }) => {
      await seedTheme(page, theme);
    });

    test(`left sidebar sections @visual`, async ({ page }) => {
      await bootAuthoring(page);
      await loadMainPreset(page, "quori:latest");
      await settle(page);

      // `left-top` is HierarchyPanel, a Panel + PanelSearch + TreeRow surface.
      // `left-middle` is VariablesPanel ("Input Controls"): Tabs, Combobox,
      // EmptyState, Slider.
      for (const id of ["left-top", "left-middle"]) {
        await shoot(
          page.getByTestId(`workspace-section-${id}`),
          `sidebar-${id}-${theme}.png`,
        );
      }
    });

    test(`inspector panel @visual`, async ({ page }) => {
      await bootAuthoring(page);
      await loadMainPreset(page, "quori:latest");
      await ensureInspectorPanelVisible(page);
      await settle(page);

      // Panel, Button, Slider, NumberField, CollapsibleGroup, EmptyState.
      await shoot(
        page.getByTestId("inspector-panel"),
        `inspector-panel-${theme}.png`,
      );
    });

    test(`export dialog and advanced card surface @visual`, async ({
      page,
    }) => {
      await bootAuthoring(page);
      await loadMainPreset(page, "quori:latest");
      await openExportDialog(page);
      await settle(page);

      // Modal chrome: title heading, close button, backdrop, max-width.
      await shoot(
        page.getByTestId("export-dialog"),
        `export-dialog-${theme}.png`,
      );

      await openAdvancedExportOptions(page);
      await settle(page);

      // The densest Card + FieldRow + Switch + Button surface in the app.
      await shoot(
        page.getByTestId("export-advanced-panel"),
        `export-advanced-panel-${theme}.png`,
      );
    });
  });
}
