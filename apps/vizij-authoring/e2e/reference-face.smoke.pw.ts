import { expect, test } from "@playwright/test";
import {
  bootAuthoring,
  loadMainPreset,
  loadReferencePreset,
  sanitizePresetId,
  waitForReferenceFaceReady,
} from "./helpers";

test("reference face compare and pose copy @smoke", async ({ page }) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");
  await loadReferencePreset(page, "quori:basic");

  const posesTab = page.getByTestId("control-authoring-tab-poses");
  await posesTab.click();

  // Same-character reference: quori:basic's poses map fully onto
  // quori:latest (every path resolves by exact normalized match) and the
  // pose names collide, so the dialog offers an in-place overwrite.
  const copyButton = page.getByTestId("variables-poses-copy-reference");
  await expect(copyButton).toBeVisible();
  await expect(copyButton).not.toHaveText(/Copy Ref Pose \(0\)/);
  await copyButton.click();
  await expect(
    page.getByRole("heading", { name: "Pose Copy Mapping" }),
  ).toBeVisible();
  await expect(page.getByText("unresolved rows: 0")).toBeVisible();
  const confirmButton = page.getByRole("button", { name: "Overwrite Pose" });
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
  // A fully resolved mapping copies without complaint: the dialog closes
  // and no blocking alert appears.
  await expect(
    page.getByRole("heading", { name: "Pose Copy Mapping" }),
  ).toBeHidden();
  await expect(page.getByRole("alert")).toBeHidden();

  // Cross-character reference: no pose maps onto the other rig, so the
  // copy flow never opens. (The blocking-unresolved path is unit-tested in
  // referenceFace/mapping.test.ts; no shipped preset pairing reaches it.)
  await page.getByTestId("reference-face-unload").click();
  await page
    .getByTestId(`reference-face-preset-${sanitizePresetId("toasty:basic")}`)
    .click();
  await waitForReferenceFaceReady(page);
  await expect(copyButton).toHaveText(/Copy Ref Pose \(0\)/);
  await expect(copyButton).toBeDisabled();

  await page.getByTestId("main-runtime-reset-inputs").click();
  await expect(page.getByTestId("main-runtime-ready-flag")).toBeVisible();
});
