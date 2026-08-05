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
 *
 * Exception: the `control-authoring-tabs-*`, `menu-file-popup-*`,
 * `demo-voice-select-*`, and `select-popup-*` baselines were added later and so
 * record the post-`@semio/ui` state. They cover `Tabs` and `MenuBar` (both
 * queued for a rebuild) and the already-migrated `Select`; they therefore lock
 * in current behaviour rather than pre-migration behaviour.
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

    test(`control authoring tab bar @visual`, async ({ page }) => {
      await bootAuthoring(page);
      await loadMainPreset(page, "quori:latest");

      // `left-bottom` is the "Authoring" VariablesPanel instance — the only
      // multi-tab `Tabs` surface in the app (`left-middle` renders a single
      // "Inputs" tab, so it cannot show selected-vs-unselected side by side).
      // The `Tabs` list has no testid of its own; `role="tablist"` is part of
      // the primitive's a11y contract, so it is a stabler anchor than a class
      // path.
      const authoring = page.getByTestId("workspace-section-left-bottom");
      const tabBar = authoring.getByRole("tablist");
      await expect(
        authoring.getByTestId("control-authoring-tab-drivers"),
      ).toBeVisible();

      // Select a mid-list tab rather than the default first one, so the crop
      // contains selected and unselected tabs on either side of the selection.
      await authoring.getByTestId("control-authoring-tab-poses").click();
      await expect(
        page.getByTestId("control-authoring-panel-poses"),
      ).toBeVisible();
      await settle(page);

      await shoot(tabBar, `control-authoring-tabs-${theme}.png`);
    });

    test(`file menu popup @visual`, async ({ page }) => {
      // No preset load: the menu bar is mounted on the empty state, and the
      // "no scene" variant of the File menu is both cheaper to reach and freer
      // of live state (the enabled/disabled split is fixed rather than tied to
      // autosave's dirty flag).
      await bootAuthoring(page);
      await settle(page);

      await page.getByTestId("app-menu-file").click();

      // The popup is portaled out of the trigger, so it has to be found from
      // the page root. Base UI's `Menu.Popup` is the page's only `role="menu"`
      // while a single menu is open.
      const popup = page.getByRole("menu");
      await expect(
        popup.getByTestId("app-menu-file-standard-profiles"),
      ).toBeVisible();

      // MenuItem, MenuSubmenu (chevron + indent), MenuSeparator, and the
      // popup's own border/shadow/radius.
      await shoot(popup, `menu-file-popup-${theme}.png`);

      await page.keyboard.press("Escape");
      await expect(popup).toBeHidden();
    });

    test(`select trigger and popup @visual`, async ({ page }) => {
      // The empty-state demo's voice picker is the cheapest `Select` in the
      // app: it is on the first screen, so no preset load and no panel
      // navigation is needed, and it sits under a stable testid.
      // `RuntimeSourceToolbar` — the other obvious candidate — is dead code
      // (nothing renders it, and `WorkspaceLayout` is never given a `topPanel`).
      await bootAuthoring(page);
      const voice = page.getByTestId("empty-state-demo-voice");
      // The demo's own runtime gates the Speak button, and a pending runtime
      // renders it disabled — wait the state out rather than race it.
      await expect(
        voice.getByTestId("empty-state-demo-voice-speak"),
      ).toBeEnabled({ timeout: 60_000 });
      await settle(page);

      await shoot(voice, `demo-voice-select-${theme}.png`);

      // `@semio/ui`'s single-select trigger is a `div` with no role, so it is
      // addressed by the ARIA attribute that makes it a menu button.
      await voice.locator('[aria-haspopup="menu"]').click();
      const popup = page.getByRole("menu");
      await expect(popup).toBeVisible();
      await shoot(popup, `select-popup-${theme}.png`);

      await page.keyboard.press("Escape");
      await expect(popup).toBeHidden();
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
