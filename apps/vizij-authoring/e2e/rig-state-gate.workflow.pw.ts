import { expect, test } from "@playwright/test";
import { bootAuthoring, loadMainPreset } from "./helpers";

const STORAGE_KEY = "vizij:rig-authoring:v2";

/** The persisted rig-state map, read from the app's localStorage. */
async function readSavedStates(
  page: import("@playwright/test").Page,
): Promise<Record<string, { schemaVersion?: number }>> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  }, STORAGE_KEY);
}

test("a saved rig state from another schema generation is discarded, not applied @workflow", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });

  // A passive load never persists; one real edit does — capture the current
  // values as a driver, as an authoring session would.
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");
  await page.getByRole("button", { name: "Capture Current" }).click();
  await expect
    .poll(async () => Object.keys(await readSavedStates(page)).length, {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
  const baseline = await readSavedStates(page);
  const faceId = Object.keys(baseline)[0]!;
  const outputsOf = async () =>
    /outputs: \d+/.exec(
      (await page.getByTestId("main-runtime-status").textContent()) ?? "",
    )?.[0];
  const baselineOutputs = await outputsOf();
  expect(baselineOutputs, "the baseline run reports its outputs").toBeTruthy();

  // Downgrade the save to a previous generation, as a browser that last
  // authored before a bundle/schema migration would hold.
  await page.evaluate(
    ([key, id]) => {
      const map = JSON.parse(window.localStorage.getItem(key)!);
      map[id].schemaVersion = 4;
      window.localStorage.setItem(key, JSON.stringify(map));
    },
    [STORAGE_KEY, faceId] as const,
  );

  // The reload must refuse the stale save: discard it (visibly), derive the
  // face fresh from the asset, and re-persist a current-generation state.
  await page.reload();
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");
  await expect
    .poll(async () => (await readSavedStates(page))[faceId]?.schemaVersion, {
      timeout: 30_000,
    })
    .not.toBe(4);
  expect(
    warnings.some((w) => w.includes("discarding the saved authoring state")),
    "the discard is reported on the console",
  ).toBeTruthy();
  await expect
    .poll(outputsOf, { timeout: 30_000 })
    .toBe(baselineOutputs);
});
