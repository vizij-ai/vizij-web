import { expect, test } from "@playwright/test";

test("motiongraph panel smoke flow", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Vizij Authoring Tool/i);

  const viewButton = page.getByRole("button", { name: "View", exact: true });
  await viewButton.click();
  const motionGraphToggle = page.getByRole("menuitemcheckbox", {
    name: "MotionGraph",
  });
  if ((await motionGraphToggle.getAttribute("aria-checked")) !== "true") {
    await motionGraphToggle.click();
  }
  await page.keyboard.press("Escape");

  const addNamespaceButton = page.getByRole("button", {
    name: "+ New Namespace",
  });
  await expect(addNamespaceButton).toBeVisible();
  await addNamespaceButton.click();
  await page.getByRole("textbox", { name: "namespace name" }).fill("smoke.ns");
  await page.getByRole("button", { name: "OK" }).click();

  await page.getByRole("textbox", { name: "path/segments" }).fill("foo/bar");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(
    page.getByRole("button", { name: "smoke.ns.foo.bar" }),
  ).toBeVisible();

  const graphNode = page.locator(".react-flow__node").first();
  await expect(graphNode).toBeVisible();
  await graphNode.evaluate((el) => {
    (el as HTMLElement).click();
  });
  await expect(page.getByText("MotionGraph Inspector")).toBeVisible();
});
