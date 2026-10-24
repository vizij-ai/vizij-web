// `setValue` given an updater calls it with the current value, or with the
// animatable's default when no value is held, and stores what it returns.
import test from "node:test";
import assert from "node:assert/strict";
import { getLookup } from "@vizij/utils";
import { createVizijStore } from "../src/store.ts";

const namespace = "default";

function storeWithAnimatable() {
  const store = createVizijStore();
  store.setState({
    animatables: {
      blink: { id: "blink", name: "blink", type: "number", default: 0.25 },
    },
  });
  return store;
}

test("an updater receives the value currently held", () => {
  const store = storeWithAnimatable();
  store.getState().setValue("blink", namespace, 2);

  const received = [];
  store.getState().setValue("blink", namespace, (current) => {
    received.push(current);
    return current + 1;
  });

  assert.deepEqual(received, [2]);
  assert.equal(store.getState().values.get(getLookup(namespace, "blink")), 3);
});

test("an updater receives the animatable's default when no value is held", () => {
  const store = storeWithAnimatable();

  const received = [];
  store.getState().setValue("blink", namespace, (current) => {
    received.push(current);
    return current * 2;
  });

  assert.deepEqual(received, [0.25]);
  assert.equal(store.getState().values.get(getLookup(namespace, "blink")), 0.5);
});

test("an updater's 0 is stored", () => {
  const store = storeWithAnimatable();
  store.getState().setValue("blink", namespace, 2);

  store.getState().setValue("blink", namespace, () => 0);

  assert.equal(store.getState().values.get(getLookup(namespace, "blink")), 0);
});

test("an updater that returns undefined leaves the held value", () => {
  const store = storeWithAnimatable();
  store.getState().setValue("blink", namespace, 2);

  store.getState().setValue("blink", namespace, () => undefined);

  assert.equal(store.getState().values.get(getLookup(namespace, "blink")), 2);
});
