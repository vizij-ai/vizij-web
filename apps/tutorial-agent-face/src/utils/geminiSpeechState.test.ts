import { describe, expect, it } from "vitest";
import {
  createInitialGeminiSpeechState,
  transitionGeminiSpeechState,
} from "./geminiSpeechState";

describe("transitionGeminiSpeechState", () => {
  it("enters thinking after a user turn finishes and before the model answers", () => {
    let state = createInitialGeminiSpeechState();
    state = transitionGeminiSpeechState(state, {
      type: "user-speaking-start",
    });
    state = transitionGeminiSpeechState(state, {
      type: "user-speaking-stop",
    });

    expect(state.userSpeaking).toBe(false);
    expect(state.thinking).toBe(true);
    expect(state.modelSpeaking).toBe(false);
  });

  it("clears thinking and marks model speaking when the reply starts", () => {
    let state = createInitialGeminiSpeechState();
    state = transitionGeminiSpeechState(state, {
      type: "user-turn-observed",
    });
    state = transitionGeminiSpeechState(state, {
      type: "model-turn-start",
    });

    expect(state.thinking).toBe(false);
    expect(state.modelSpeaking).toBe(true);
    expect(state.awaitingModelResponse).toBe(false);
  });

  it("resets all speech topics when the model turn ends", () => {
    let state = createInitialGeminiSpeechState();
    state = transitionGeminiSpeechState(state, {
      type: "user-speaking-start",
    });
    state = transitionGeminiSpeechState(state, {
      type: "user-speaking-stop",
    });
    state = transitionGeminiSpeechState(state, {
      type: "model-turn-start",
    });
    state = transitionGeminiSpeechState(state, {
      type: "model-turn-end",
    });

    expect(state).toEqual(createInitialGeminiSpeechState());
  });
});
