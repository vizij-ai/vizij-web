import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  bootAuthoring,
  ensureAnimationPanelVisible,
  loadMainPreset,
} from "./helpers";

/**
 * The animation transport, tested against a clock that is actually running.
 *
 * Pause and resume broke repeatedly here, and unit tests kept passing over
 * it: the store actions and the state machine are correct in isolation, and
 * the bugs lived in whether anything was ever told what happened. Asserting
 * the state label is not enough either — the label read "Paused" while the
 * playhead sat frozen at zero and no control could restart it.
 *
 * So these assert the playhead itself: that it moves while playing, that
 * pausing holds it where it was, and that resuming carries on from there
 * rather than starting over. That needs real frames, which is why it belongs
 * here and not in vitest.
 *
 * Driven from the Animation panel's own transport rather than the target
 * list's row buttons, because the panel is what an author actually reaches
 * for while editing, and it is on screen whenever the timeline is.
 *
 * Tagged @smoke deliberately. CI runs only that project, and these caught a
 * bug that survived three rounds of fixes and a hand check — coverage that
 * does not run would not have caught it a fourth time. They cannot go in the
 * @workflow project until the two stale specs in there are repaired.
 */

// Loading a face is the slow part and can approach the shared 120s budget on
// its own; these tests then need several seconds of real playback on top.
test.describe.configure({ timeout: 240_000 });

/** Reads the playhead as seconds, whichever unit the field displays. */
async function readPlayhead(field: Locator): Promise<number> {
  const raw = await field.inputValue();
  const seconds = raw.match(/^([\d.]+)s$/);
  if (seconds) {
    return Number.parseFloat(seconds[1]!);
  }
  const frames = raw.match(/^(\d+)f$/);
  if (frames) {
    return Number.parseInt(frames[1]!, 10) / 32;
  }
  throw new Error(`Could not read a playhead time from "${raw}"`);
}

/** Distinct playhead readings over a window, in order of first appearance. */
async function samplePlayhead(
  field: Locator,
  durationMs = 1200,
): Promise<string[]> {
  return field.evaluate(
    async (node, options) => {
      const input = node as HTMLInputElement;
      const seen: string[] = [];
      const start = performance.now();
      while (performance.now() - start < options.durationMs) {
        if (seen[seen.length - 1] !== input.value) {
          seen.push(input.value);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 25));
      }
      return seen;
    },
    { durationMs },
  );
}

/**
 * Watches the runtime chip for `durationMs` and returns every distinct value.
 *
 * Pause reverting is only visible over time: the local write lands, the chip
 * reads "Paused", and then the next frame of runtime feedback overwrites it
 * back to "Playing". A single assertion right after the click sees only the
 * first half of that.
 */
async function watchChip(chip: Locator, durationMs = 2000): Promise<string[]> {
  return chip.evaluate(
    async (node, options) => {
      const seen: string[] = [];
      const start = performance.now();
      while (performance.now() - start < options.durationMs) {
        const text = node.textContent?.trim() ?? "";
        if (seen[seen.length - 1] !== text) {
          seen.push(text);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 10));
      }
      return seen;
    },
    { durationMs },
  );
}

interface Transport {
  chip: Locator;
  playhead: Locator;
  panel: Locator;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  /** Types a time into the playhead field and commits it. */
  seekTo: (value: string) => Promise<void>;
  /** Everything the runtime has complained about so far. */
  runtimeLog: () => string;
}

async function openTransport(page: Page): Promise<Transport> {
  // The transport failures here are reported by the runtime, not thrown: a
  // dropped play or a clip whose player was never created shows up as a
  // console warning and an unchanged playhead. Collecting them turns "the
  // playhead did not move" into a message that says why.
  const runtimeMessages = new Set<string>();
  // Headless Chromium has no GPU, so the renderer reports a failed WebGL
  // context on every frame. The animation clock runs without it, so this is
  // noise that would bury the messages worth reading.
  const isNoise = (text: string) => /WebGL|GPU stall|Violation/i.test(text);
  const remember = (text: string) => {
    if (!isNoise(text)) {
      runtimeMessages.add(text);
    }
  };
  page.on("console", (message) => {
    const type = message.type();
    if (type === "warning" || type === "error") {
      remember(`[${type}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    remember(`[pageerror] ${error.message}`);
  });

  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");
  await ensureAnimationPanelVisible(page);

  const panel = page.getByTestId("animation-panel");
  const playhead = page.getByTestId("timeline-current-time");
  await expect(playhead).toBeVisible();

  // A DOM click, as the other specs do, so an overlay cannot swallow it and
  // turn a real transport failure into a missed-click failure. Enablement is
  // asserted first because `.click()` on a disabled button is a silent no-op,
  // which would surface as "the transport ignored me" rather than "the
  // control was dead".
  // `button[title=...]`, not `getByTitle`: the latter matches any element
  // carrying the attribute, and `.click()` on the non-button it resolved to
  // was a silent no-op that read exactly like the transport ignoring us.
  const click = async (title: string) => {
    const button = panel.locator(`button[title="${title}"]`).first();
    await expect(button, `${title} button should be enabled`).toBeEnabled();
    await button.evaluate((node) => {
      (node as HTMLButtonElement).click();
    });
  };

  return {
    chip: page.getByTestId("main-runtime-status-chip"),
    playhead,
    panel,
    play: () => click("Play"),
    pause: () => click("Pause"),
    seekTo: async (value: string) => {
      await playhead.fill(value);
      await playhead.press("Enter");
    },
    runtimeLog: () =>
      runtimeMessages.size > 0
        ? `\nruntime said:\n  ${[...runtimeMessages].join("\n  ")}`
        : "\nruntime said nothing.",
  };
}

test("the playhead advances while playing @smoke", async ({ page }) => {
  const t = await openTransport(page);

  await t.play();
  await expect(t.chip).toContainText("Animation: Playing");

  // Playing means moving. A "playing" label over a frozen playhead is the
  // failure this exists to catch.
  const moving = await samplePlayhead(t.playhead);
  expect(
    moving.length,
    `playhead did not advance while playing (saw ${JSON.stringify(moving)})`,
  ).toBeGreaterThan(1);
});

test("plays from a seek made while stopped @smoke", async ({ page }) => {
  const t = await openTransport(page);

  // The seek lands before Play has created the module's player. Nothing
  // replayed it, so the clip started from zero while the playhead read 2s.
  await t.seekTo("2.000s");
  expect(await readPlayhead(t.playhead)).toBeCloseTo(2, 2);

  await t.play();
  await expect(t.chip).toContainText("Animation: Playing");
  await samplePlayhead(t.playhead, 700);

  expect(
    await readPlayhead(t.playhead),
    `play rewound to the start instead of running on from the seek${t.runtimeLog()}`,
  ).toBeGreaterThan(2);
});

test("pausing turns the button into Play and holds the playhead @smoke", async ({
  page,
}) => {
  const t = await openTransport(page);

  await t.play();
  await expect(t.chip).toContainText("Animation: Playing");
  await expect(t.panel.locator('button[title="Pause"]')).toBeVisible();
  await samplePlayhead(t.playhead, 900);

  // Pause has to stick. Watched rather than sampled once, because the failure
  // is a revert: the local write lands and the chip reads "Paused", then a
  // frame of runtime feedback overwrites it and the clip is playing again
  // behind a Pause button. A single assertion sees only the first half.
  await t.pause();
  const afterPause = await watchChip(t.chip);
  expect(
    afterPause.filter((text) => text.includes("Animation: Playing")),
    `pause did not stick — the chip went ${afterPause.join(" -> ")}${t.runtimeLog()}`,
  ).toHaveLength(0);
  expect(
    afterPause[afterPause.length - 1] ?? "",
    `pause never reported paused${t.runtimeLog()}`,
  ).toContain("Animation: Paused");

  // The control has to offer the way back.
  await expect(t.panel.locator('button[title="Play"]')).toBeVisible();
  await expect(t.panel.locator('button[title="Pause"]')).toHaveCount(0);

  const atPause = await readPlayhead(t.playhead);
  expect(
    atPause,
    "the playhead should have left zero before being paused",
  ).toBeGreaterThan(0);

  const whilePaused = await samplePlayhead(t.playhead);
  expect(
    whilePaused.length,
    `playhead kept moving after pause (saw ${JSON.stringify(whilePaused)})`,
  ).toBe(1);
});

test("resuming continues from the paused time instead of starting over @smoke", async ({
  page,
}) => {
  const t = await openTransport(page);

  await t.play();
  await expect(t.chip).toContainText("Animation: Playing");
  await samplePlayhead(t.playhead, 900);

  await t.pause();
  await expect(
    t.chip,
    `pause did not take effect${t.runtimeLog()}`,
  ).toContainText("Animation: Paused");
  const atPause = await readPlayhead(t.playhead);
  expect(atPause).toBeGreaterThan(0);

  await t.play();
  await expect(
    t.chip,
    `resume did not take effect${t.runtimeLog()}`,
  ).toContainText("Animation: Playing");

  const afterResume = await samplePlayhead(t.playhead);
  expect(
    afterResume.length,
    `playhead frozen after resuming from ${atPause}s (saw ${JSON.stringify(afterResume)})${t.runtimeLog()}`,
  ).toBeGreaterThan(1);

  // Resume, not restart.
  const firstAfterResume = Number.parseFloat(afterResume[0]!);
  expect(
    firstAfterResume,
    `resume rewound from ${atPause}s to ${afterResume[0]}`,
  ).toBeGreaterThanOrEqual(atPause - 0.25);
});

test("pause and resume survive being used repeatedly @smoke", async ({
  page,
}) => {
  const t = await openTransport(page);

  await t.play();
  await expect(t.chip).toContainText("Animation: Playing");

  // The first Play of a session starts a runtime session; later ones resume an
  // existing one, down a different code path. A single cycle proves nothing
  // about the second, which is where this last broke.
  for (let cycle = 1; cycle <= 4; cycle += 1) {
    await samplePlayhead(t.playhead, 700);

    await t.pause();
    await expect(
      t.chip,
      `cycle ${cycle}: pause did not take effect${t.runtimeLog()}`,
    ).toContainText("Animation: Paused");
    await expect(
      t.panel.locator('button[title="Play"]'),
      `cycle ${cycle}: pause should offer Play`,
    ).toBeVisible();

    const atPause = await readPlayhead(t.playhead);

    await t.play();
    await expect(t.chip, `cycle ${cycle}: resume`).toContainText(
      "Animation: Playing",
    );

    const moving = await samplePlayhead(t.playhead, 900);
    expect(
      moving.length,
      `cycle ${cycle}: playhead frozen after resuming from ${atPause}s (saw ${JSON.stringify(moving)})`,
    ).toBeGreaterThan(1);
  }
});
