// A slot's loading view: which stage it shows, in which words, and how a
// page replaces it.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  loadingStage,
  markDrawn,
  setRuntimeStage,
  setVizijProgress,
  watchLoading,
} from "../src/page/progress.ts";
import { describeLoading } from "../src/page/loading.tsx";
import { frame } from "../src/page/frame.ts";
import { Vizij } from "../src/page/vizij.tsx";

const MB = 1_000_000;

/** Each test names its own faces and starts from a mounted runtime. */
function mounted() {
  setRuntimeStage(null);
}

test("before init() and through it, a slot shows the runtime's stages", () => {
  setRuntimeStage({ stage: "download", loaded: 0, total: null });
  assert.deepEqual(loadingStage("a"), {
    stage: "download",
    loaded: 0,
    total: null,
  });
  setRuntimeStage({ stage: "compile" });
  assert.deepEqual(loadingStage("a"), { stage: "compile" });
  setRuntimeStage({ stage: "mount" });
  assert.deepEqual(loadingStage("a"), { stage: "mount" });
});

test("the runtime's stages show before the face's, which wait on it", () => {
  setRuntimeStage({ stage: "start" });
  setVizijProgress("b", { stage: "fetch", loaded: MB, total: 2 * MB });
  assert.deepEqual(loadingStage("b"), { stage: "start" });
  mounted();
  assert.deepEqual(loadingStage("b"), {
    stage: "fetch",
    loaded: MB,
    total: 2 * MB,
  });
  setVizijProgress("b", { stage: "draw" });
  assert.deepEqual(loadingStage("b"), { stage: "draw" });
});

test("a face nobody reports on shows as loading once the runtime is mounted", () => {
  mounted();
  assert.deepEqual(loadingStage("unreported"), { stage: "load" });
});

test("a failure shows first, whether the runtime's or the face's", () => {
  const error = new Error("404");
  setRuntimeStage({ stage: "download", loaded: 10, total: 100 });
  setVizijProgress("c", { stage: "failed", error });
  assert.deepEqual(loadingStage("c"), { stage: "failed", error });

  const broken = new Error("no wasm");
  setRuntimeStage({ stage: "failed", error: broken });
  setVizijProgress("c", { stage: "load" });
  assert.deepEqual(loadingStage("c"), { stage: "failed", error: broken });
});

test("once drawn, a face's slot shows no loading view, through reloads, until it is unloaded", () => {
  mounted();
  setVizijProgress("d", { stage: "draw" });
  markDrawn("d");
  assert.equal(loadingStage("d"), null);

  // A reload: the previous scene draws until the new one is ready.
  setVizijProgress("d", { stage: "fetch", loaded: 0, total: null });
  assert.equal(loadingStage("d"), null);

  // Unloaded: the slot waits for a face again.
  setVizijProgress("d", null);
  assert.deepEqual(loadingStage("d"), { stage: "load" });
});

test("the frame marks a slot's face drawn when the view reports it ready", () => {
  mounted();
  const element = {
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 10, height: 10 }),
    getAttribute: () => null,
    setAttribute: () => undefined,
  };
  const slot = {
    vizijId: "e",
    element,
    safeArea: null,
    onPick: undefined,
    placed: null,
  };
  const view = (ready) => ({
    placeVizij: () => undefined,
    ready: () => ready,
    safeArea: () => null,
    drainPicks: () => [],
  });
  frame([slot], element, view(false));
  assert.deepEqual(loadingStage("e"), { stage: "load" });
  frame([slot], element, view(true));
  assert.equal(loadingStage("e"), null);
});

test("a watcher hears the current stage at once, then each change once", () => {
  mounted();
  const heard = [];
  const stop = watchLoading("f", (stage) => heard.push(stage));
  setVizijProgress("f", { stage: "fetch", loaded: 1, total: 4 });
  setVizijProgress("f", { stage: "fetch", loaded: 1, total: 4 });
  setVizijProgress("other", { stage: "draw" });
  markDrawn("f");
  stop();
  setVizijProgress("f", null);
  assert.deepEqual(heard, [
    { stage: "load" },
    { stage: "fetch", loaded: 1, total: 4 },
    null,
  ]);
});

test("each stage's label, and a fraction only where bytes count against a total", () => {
  const cases = [
    [
      { stage: "download", loaded: 0, total: null },
      "Downloading the runtime",
      null,
    ],
    [
      { stage: "download", loaded: 3.2 * MB, total: null },
      "Downloading the runtime: 3.2 MB",
      null,
    ],
    [
      { stage: "download", loaded: 2.5 * MB, total: 10 * MB },
      "Downloading the runtime: 2.5 of 10.0 MB",
      0.25,
    ],
    [{ stage: "compile" }, "Compiling the runtime", null],
    [{ stage: "start" }, "Starting the runtime", null],
    [{ stage: "mount" }, "Starting the view", null],
    [
      { stage: "fetch", loaded: MB, total: 4 * MB },
      "Loading the face: 1.0 of 4.0 MB",
      0.25,
    ],
    [
      { stage: "fetch", loaded: 1.5 * MB, total: null },
      "Loading the face: 1.5 MB",
      null,
    ],
    [{ stage: "load" }, "Loading the face", null],
    [{ stage: "draw" }, "Drawing the face", null],
    [{ stage: "failed", error: new Error("x") }, "Loading failed", null],
  ];
  for (const [stage, label, fraction] of cases) {
    const loading = describeLoading(stage);
    assert.equal(loading.label, label);
    assert.equal(loading.fraction, fraction, label);
  }
  // A body past its declared length does not overfill the bar.
  assert.equal(
    describeLoading({ stage: "fetch", loaded: 5, total: 4 }).fraction,
    1,
  );
});

const slot = (props) => renderToStaticMarkup(createElement(Vizij, props));

test("the default view: Vizij's logo, a determinate progress bar and the label", () => {
  mounted();
  setVizijProgress("g", { stage: "fetch", loaded: MB, total: 4 * MB });
  const html = slot({ vizijId: "g" });
  assert.match(html, /data-vizij-loading/);
  // The logo at 64 px, in its own colours rather than the text colour: the
  // teal circle, the orange quadrilateral and the amber triangle.
  const image = html.match(/<svg[^>]*>[\s\S]*?<\/svg>/)?.[0];
  assert.ok(image, "the default image is an inline SVG");
  assert.match(image, /width="64" height="64"/);
  for (const fill of ["#50c4b6", "#f56b29", "#ff9e00"]) {
    assert.match(image, new RegExp(`fill="${fill}"`));
  }
  assert.doesNotMatch(image, /currentColor/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-label="Loading the face"/);
  assert.match(html, /aria-valuetext="Loading the face: 1.0 of 4.0 MB"/);
  assert.match(html, /aria-valuenow="25"/);
  assert.match(html, /aria-valuemax="100"/);
  assert.match(html, />Loading the face: 1.0 of 4.0 MB</);
});

test("an indeterminate stage's bar carries no value", () => {
  setRuntimeStage({ stage: "compile" });
  const html = slot({ vizijId: "h" });
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuetext="Compiling the runtime"/);
  assert.doesNotMatch(html, /aria-valuenow/);
  assert.match(html, /data-vizij-loading-indeterminate/);
});

test("a failure shows its label as a status, with no progress bar", () => {
  setRuntimeStage(null);
  setVizijProgress("i", { stage: "failed", error: new Error("404") });
  const html = slot({ vizijId: "i" });
  assert.match(html, /role="status"[^>]*>Loading failed</);
  assert.doesNotMatch(html, /progressbar/);
});

test("loadingImage replaces the image, and null leaves it out", () => {
  mounted();
  const own = slot({
    vizijId: "j",
    loadingImage: createElement("img", { src: "/logo.svg", alt: "" }),
  });
  assert.match(own, /<img src="\/logo.svg"/);
  assert.doesNotMatch(own, /<svg/);
  assert.match(own, /role="progressbar"/);

  const none = slot({ vizijId: "j", loadingImage: null });
  assert.doesNotMatch(none, /<svg|<img/);
  assert.match(none, /role="progressbar"/);
});

test("loading replaces the whole view with the page's, given the stage, label and fraction", () => {
  mounted();
  setVizijProgress("k", { stage: "fetch", loaded: MB, total: 2 * MB });
  let given;
  const html = slot({
    vizijId: "k",
    loading: (loading) => {
      given = loading;
      return createElement("p", { className: "mine" }, loading.label);
    },
  });
  assert.deepEqual(given, {
    stage: { stage: "fetch", loaded: MB, total: 2 * MB },
    label: "Loading the face: 1.0 of 2.0 MB",
    fraction: 0.5,
  });
  assert.match(html, /<p class="mine">Loading the face: 1.0 of 2.0 MB<\/p>/);
  assert.doesNotMatch(html, /progressbar/);
});

test("loading={null} shows no loading view, and a drawn face's slot none either", () => {
  mounted();
  assert.doesNotMatch(
    slot({ vizijId: "l", loading: null }),
    /data-vizij-loading/,
  );
  markDrawn("l");
  assert.doesNotMatch(slot({ vizijId: "l" }), /data-vizij-loading/);
});
