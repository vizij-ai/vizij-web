// Drawn frames: the pace a page that shows a Bevy face works at.
//
// The page does its work on animation frames: the device steps once per
// frame, a tween writes once per frame, and the view draws what the previous
// step left. Under SwiftShader the browser draws no frame for many seconds
// after the face reports ready, while it compiles the face's pipelines, then
// one every one to five seconds depending on the runner: a window of wall time
// alone can pass without a frame, and every sample in it shows the same
// picture. A window is therefore a number of drawn frames as well as a length
// of time.
import type { Page } from "@playwright/test";

interface FrameCounter {
  framesDrawn: number;
}

/** Count the animation frames the page runs from its first script on. Call
 * before `page.goto`. */
export async function countFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counter = window as unknown as FrameCounter;
    counter.framesDrawn = 0;
    const count = () => {
      counter.framesDrawn += 1;
      requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
  });
}

/** Let the page run for `ms` and draw `frames` animation frames, whichever
 * takes longer, waiting at most `timeout` for the frames. Needs
 * {@link countFrames}. */
export async function drawWindow(
  page: Page,
  { ms, frames, timeout }: { ms: number; frames: number; timeout: number },
): Promise<void> {
  const target =
    (await page.evaluate(
      () => (window as unknown as FrameCounter).framesDrawn,
    )) + frames;
  await page.waitForTimeout(ms);
  await page.waitForFunction(
    (target) => (window as unknown as FrameCounter).framesDrawn >= target,
    target,
    { polling: 250, timeout },
  );
}
