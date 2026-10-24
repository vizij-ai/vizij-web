// The conversation state the conversation writes on the face: `speaking`
// around the `say` run, `user_speaking` from the ear's voice activity,
// `thinking` around the mind's call, all three back to 0 on dispose.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { Conversation } from "../src/agent/conversation.ts";

/** A face that records what is written on it and runs `say` until told the
 * run has ended. */
function fakeFace() {
  const face = {
    /** Each write, as `[state, weight]`. */
    writes: [],
    /** The runs `say` spawned and the ones halted. */
    runs: [],
    halted: [],
    /** The current weight of each state, as last written. */
    weight(state) {
      const last = face.writes.filter(([s]) => s === state).at(-1);
      return last ? last[1] : 0;
    },
    converse(state, holds) {
      face.writes.push([state, holds ? 1 : 0]);
    },
    async say(text) {
      const run = { run: `run-${face.runs.length}`, status: "s", text };
      run.over = false;
      face.runs.push(run);
      return run;
    },
    async halt(run) {
      face.halted.push(run);
    },
    ended: (run) => run.over,
    express() {},
  };
  return face;
}

/** An ear the test speaks into. */
function fakeEar() {
  const ear = { events: null, listening: false };
  ear.hear = (events) => {
    ear.events = events;
    return {
      get listening() {
        return ear.listening;
      },
      async start() {
        ear.listening = true;
      },
      stop() {
        ear.listening = false;
      },
    };
  };
  return ear;
}

/** A mind whose replies the test hands over. */
function fakeMind() {
  const mind = { pending: [] };
  mind.reply = (text) =>
    new Promise((resolve, reject) =>
      mind.pending.push({ text, resolve, reject }),
    );
  return mind;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

// The conversation watches its run's status on an interval; the tests step
// it by hand.
mock.timers.enable({ apis: ["setInterval"] });

test("speaking is 1 from the say run's spawn until its status reads terminal", async () => {
  const face = fakeFace();
  const conversation = new Conversation(face, null, {}, null);

  assert.equal(face.weight("speaking"), 0);
  await conversation.turn("Hello");
  assert.equal(face.runs.length, 1);
  assert.equal(face.weight("speaking"), 1, "1 once the run is spawned");
  assert.equal(conversation.state, "speaking");

  mock.timers.tick(200);
  assert.equal(face.weight("speaking"), 1, "1 while the run is running");

  face.runs[0].over = true;
  mock.timers.tick(50);
  assert.equal(face.weight("speaking"), 0, "0 once its status is terminal");
  assert.equal(conversation.state, "idle");
  assert.deepEqual(
    face.writes.filter(([s]) => s === "speaking"),
    [
      ["speaking", 1],
      ["speaking", 0],
    ],
  );
});

test("stopping the face writes speaking 0 and halts its run", async () => {
  const face = fakeFace();
  const conversation = new Conversation(face, null, {}, null);
  await conversation.turn("Hello");

  const stopped = conversation.interrupt();
  assert.equal(face.weight("speaking"), 0, "0 at the stop, not once halted");
  await stopped;
  assert.deepEqual(face.halted, [face.runs[0]]);
  assert.equal(conversation.state, "idle");
});

test("a new utterance halts the one before it, and speaking stays truthful", async () => {
  const face = fakeFace();
  const conversation = new Conversation(face, null, {}, null);
  await conversation.turn("One");
  await conversation.turn("Two");

  assert.deepEqual(face.halted, [face.runs[0]]);
  assert.deepEqual(
    face.writes.filter(([s]) => s === "speaking"),
    [
      ["speaking", 1],
      ["speaking", 0],
      ["speaking", 1],
    ],
  );
});

test("user_speaking follows the ear's voice activity, and barge-in halts the face", async () => {
  const face = fakeFace();
  const ear = fakeEar();
  const conversation = new Conversation(face, null, {}, ear.hear);
  await conversation.listen();
  await conversation.turn("Hello");

  ear.events.onUserSpeaking(true);
  assert.equal(face.weight("user_speaking"), 1);
  assert.equal(face.weight("speaking"), 0, "the barge-in stops the face");
  await tick();
  assert.deepEqual(face.halted, [face.runs[0]]);

  ear.events.onUserSpeaking(true);
  ear.events.onUserSpeaking(false);
  assert.equal(face.weight("user_speaking"), 0);
  assert.deepEqual(
    face.writes.filter(([s]) => s === "user_speaking"),
    [
      ["user_speaking", 1],
      ["user_speaking", 0],
    ],
    "written when it changes",
  );
});

test("thinking is 1 while the mind's call is pending", async () => {
  const face = fakeFace();
  const mind = fakeMind();
  const conversation = new Conversation(face, mind, {}, null);

  const turn = conversation.turn("How are you?");
  assert.equal(face.weight("thinking"), 1);
  assert.equal(conversation.state, "thinking");
  mind.pending[0].resolve({ text: "Fine.", expression: "happy" });
  await turn;

  assert.equal(face.weight("thinking"), 0);
  assert.equal(face.weight("speaking"), 1);
  assert.deepEqual(face.writes, [
    ["thinking", 1],
    ["thinking", 0],
    ["speaking", 1],
  ]);
});

test("thinking holds until the last pending call to the mind ends", async () => {
  const face = fakeFace();
  const mind = fakeMind();
  const conversation = new Conversation(face, mind, {}, null);

  const first = conversation.turn("One");
  const second = conversation.turn("Two");
  // The newer turn supersedes the first: the mind answers it with nothing.
  mind.pending[0].resolve(null);
  await first;
  assert.equal(face.weight("thinking"), 1, "the second call still pending");
  assert.equal(conversation.state, "thinking");

  mind.pending[1].resolve({ text: "Two it is.", expression: "neutral" });
  await second;
  assert.equal(face.weight("thinking"), 0);
  assert.equal(face.runs.length, 1);
});

test("a failed call to the mind ends thinking and reports the error", async () => {
  const face = fakeFace();
  const mind = fakeMind();
  const errors = [];
  const conversation = new Conversation(
    face,
    mind,
    { onError: (message) => errors.push(message) },
    null,
  );

  const turn = conversation.turn("Hello?");
  mind.pending[0].reject(new Error("OpenAI 500"));
  await turn;
  assert.equal(face.weight("thinking"), 0);
  assert.deepEqual(errors, ["OpenAI 500"]);
  assert.equal(conversation.state, "idle");
});

test("dispose returns all three to 0 and writes nothing after", async () => {
  const face = fakeFace();
  const mind = fakeMind();
  const ear = fakeEar();
  const conversation = new Conversation(face, mind, {}, ear.hear);
  await conversation.listen();
  ear.events.onUserSpeaking(true);
  const turn = conversation.turn("Hello");
  conversation.dispose();

  assert.equal(face.weight("speaking"), 0);
  assert.equal(face.weight("user_speaking"), 0);
  assert.equal(face.weight("thinking"), 0);
  assert.equal(ear.listening, false, "the ear is closed");

  const written = face.writes.length;
  mind.pending[0].resolve({ text: "Too late.", expression: "neutral" });
  await turn;
  assert.equal(face.writes.length, written);
  assert.equal(face.runs.length, 0, "nothing is said after dispose");
});
