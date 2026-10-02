// The mind's answer, parsed: JSON with an expression, fenced JSON, plain text.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReply } from "../src/agent/think.ts";

test("a JSON reply carries its expression", () => {
  assert.deepEqual(parseReply('{"text": "Hi there", "expression": "happy"}'), {
    text: "Hi there",
    expression: "happy",
  });
});

test("a fenced reply is unwrapped, and an unknown expression is neutral", () => {
  assert.deepEqual(
    parseReply('```json\n{"text": "Hm", "expression": "puzzled"}\n```'),
    {
      text: "Hm",
      expression: "neutral",
    },
  );
});

test("the older emotion field still counts", () => {
  assert.equal(
    parseReply('{"text": "Oh no", "emotion": "sad"}').expression,
    "sad",
  );
});

test("plain text is said neutrally", () => {
  assert.deepEqual(parseReply("Just words."), {
    text: "Just words.",
    expression: "neutral",
  });
});
