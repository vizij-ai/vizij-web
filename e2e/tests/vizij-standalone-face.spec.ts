import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { STANDALONE_DEMOS, demoUrl } from "../standalone-demos";

// The face page: the Bevy view mounts on the page's canvas, the shipped face
// loads from its bytes, its device runs, and the page reports it ready. The
// canvas then shows something — a non-uniform pixel sample — and an
// expression written by its ROS4HRI name changes what it shows.
const standalone = STANDALONE_DEMOS.find(
  (demo) => demo.filter === "vizij-standalone",
)!;

test("the face page loads its face and shows it", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto(demoUrl(standalone));

  // Compiling the Bevy shaders on SwiftShader takes a while the first time.
  await expect(page.getByText("ready", { exact: true })).toBeVisible({
    timeout: 180_000,
  });
  await page.waitForTimeout(1_500);

  const before = await sample(page);
  expect(
    before.distinct,
    "the canvas shows more than one colour",
  ).toBeGreaterThan(8);

  await page.getByRole("button", { name: "surprised", exact: true }).click();
  await page.waitForTimeout(1_500);
  const after = await sample(page);
  expect(after.digest, "the expression changed the face").not.toEqual(
    before.digest,
  );

  expect(
    pageErrors,
    `page errors: ${pageErrors.map((e) => e.message).join("; ")}`,
  ).toHaveLength(0);
});

/** The distinct colours of the page's middle, and a digest of it. */
async function sample(page: import("@playwright/test").Page) {
  const shot = PNG.sync.read(
    await page.screenshot({
      clip: { x: 200, y: 100, width: 500, height: 350 },
    }),
  );
  const colours = new Set<number>();
  let digest = 0;
  for (let i = 0; i < shot.data.length; i += 4) {
    const rgb =
      (shot.data[i] << 16) | (shot.data[i + 1] << 8) | shot.data[i + 2];
    colours.add(rgb);
    digest = (digest * 31 + rgb) >>> 0;
  }
  return { distinct: colours.size, digest };
}
