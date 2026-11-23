// The page canvas's frame: each slot's face placed over the slot, its ready
// flag and safe-area outline kept current; picks handed to their slot; and a
// face's readiness kept from the App's events.
import test from "node:test";
import assert from "node:assert/strict";
import { deliverPick, frame } from "../src/page/frame.ts";
import { trackDrawn } from "../src/page/drawn.ts";

function element(rect) {
  const attributes = {};
  return {
    rect,
    getBoundingClientRect: () => ({ ...rect }),
    getAttribute: (name) => attributes[name] ?? null,
    setAttribute: (name, value) => {
      attributes[name] = value;
    },
    style: {},
  };
}

function recordingView({ ready = {}, areas = {} } = {}) {
  const calls = [];
  return {
    calls,
    place: (vizijId, rect) => calls.push(["place", vizijId, rect]),
    ready: (vizijId) => ready[vizijId] ?? false,
    safeArea: (vizijId) => areas[vizijId] ?? null,
  };
}

function slot(vizijId, rect, extra = {}) {
  return {
    vizijId,
    element: element(rect),
    safeArea: null,
    onPick: undefined,
    placed: null,
    ...extra,
  };
}

const CANVAS = element({ x: 0, y: 10, width: 800, height: 600 });

test("a slot's face is placed over the slot, relative to the canvas, once per move", () => {
  const view = recordingView();
  const hero = slot("hero", { x: 100, y: 60, width: 200, height: 150 });

  frame([hero], CANVAS, view);
  frame([hero], CANVAS, view);
  assert.deepEqual(view.calls, [
    ["place", "hero", { x: 100, y: 50, width: 200, height: 150 }],
  ]);

  // Scrolling moves the slot; the next frame follows it, past the edge too.
  hero.element.rect.y = -90;
  frame([hero], CANVAS, view);
  assert.deepEqual(view.calls.at(-1), [
    "place",
    "hero",
    { x: 100, y: -100, width: 200, height: 150 },
  ]);
});

test("data-vizij-ready follows the face's readiness", () => {
  const ready = { hero: false };
  const view = recordingView({ ready });
  const hero = slot("hero", { x: 0, y: 10, width: 10, height: 10 });

  frame([hero], CANVAS, view);
  assert.equal(hero.element.getAttribute("data-vizij-ready"), "false");
  ready.hero = true;
  frame([hero], CANVAS, view);
  assert.equal(hero.element.getAttribute("data-vizij-ready"), "true");
});

test("the safe-area outline lies over the face's safe area, hidden without one", () => {
  const areas = {};
  const view = recordingView({ areas });
  const outline = element({});
  const hero = slot(
    "hero",
    { x: 100, y: 60, width: 200, height: 150 },
    {
      safeArea: {
        outline,
        frame: element({ x: 100, y: 60, width: 200, height: 150 }),
      },
    },
  );

  frame([hero], CANVAS, view);
  assert.equal(outline.style.display, "none");

  areas.hero = { x: 120, y: 55, width: 160, height: 140 };
  frame([hero], CANVAS, view);
  assert.deepEqual(outline.style, {
    display: "block",
    left: "20px",
    top: "5px",
    width: "160px",
    height: "140px",
  });
});

test("each pick reaches the slot it names; picks for no slot are dropped", () => {
  const received = [];
  const hero = slot(
    "hero",
    { x: 0, y: 10, width: 10, height: 10 },
    { onPick: (pick) => received.push(pick) },
  );
  const other = slot("other", { x: 20, y: 10, width: 10, height: 10 });

  deliverPick([hero, other], "hero", "eye");
  deliverPick([hero, other], "gone", null);
  deliverPick([hero, other], "hero", null);
  assert.deepEqual(received, [
    { vizijId: "hero", elementId: "eye" },
    { vizijId: "hero", elementId: null },
  ]);
});

test("a face is drawn from its ready until its next load, and only while shown", () => {
  const drawn = trackDrawn();
  const state = { faces: new Map(), loading: new Set() };

  state.loading.add("hero");
  assert.equal(drawn.ready(state, "hero"), false, "loading");
  state.loading.delete("hero");
  state.faces.set("hero", { instance: "hero", elements: [] });
  drawn.hear({ type: "loaded", instance: "hero", elements: [] });
  assert.equal(drawn.ready(state, "hero"), false, "loaded, not yet drawn");
  drawn.hear({ type: "ready", instance: "hero", drawn: true });
  assert.equal(drawn.ready(state, "hero"), true);

  // A reload: the face shown draws on, but the slot is not ready until the
  // new one has drawn.
  state.loading.add("hero");
  assert.equal(drawn.ready(state, "hero"), false, "reloading");
  state.loading.delete("hero");
  drawn.hear({ type: "loaded", instance: "hero", elements: [] });
  assert.equal(drawn.ready(state, "hero"), false, "reloaded, not yet drawn");
  drawn.hear({ type: "ready", instance: "hero", drawn: false });
  assert.equal(drawn.ready(state, "hero"), true, "readiness that gave up");

  // A failed reload keeps the face drawn.
  state.loading.add("hero");
  state.loading.delete("hero");
  drawn.hear({ type: "loadFailed", instance: "hero", error: "no" });
  assert.equal(drawn.ready(state, "hero"), true, "a failed reload");

  // Unloaded, it is not drawn.
  state.faces.delete("hero");
  assert.equal(drawn.ready(state, "hero"), false, "unloaded");
});
