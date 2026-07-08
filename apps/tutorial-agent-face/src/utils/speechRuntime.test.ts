import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPEECH_TOPIC_PATHS,
  hasGraphSpeechControl,
  resolveActiveProgramInputPaths,
  resolveTutorialSpeechRuntime,
  shouldEnableDebugPoseFallback,
} from "./speechRuntime";

describe("resolveTutorialSpeechRuntime", () => {
  it("falls back to the default speech topic paths", () => {
    expect(resolveTutorialSpeechRuntime({ bundle: null })).toEqual({
      speechConfig: null,
      activeMotionGraphId: null,
      speechPaths: { ...DEFAULT_SPEECH_TOPIC_PATHS },
    });
  });

  it("uses bundle speech path overrides when present", () => {
    const runtime = resolveTutorialSpeechRuntime({
      bundle: {
        version: 1,
        metadata: {
          activeMotionGraphId: "program.alpha",
          speechConfig: {
            speakingInputPath: "speech/output",
            userSpeakingInputPath: "/speech/inbound",
            thinkingInputPath: "thinking/main",
            agentName: "Q",
          },
        },
      },
    });

    expect(runtime.activeMotionGraphId).toBe("program.alpha");
    expect(runtime.speechPaths).toEqual({
      speakingInputPath: "/speech/output",
      userSpeakingInputPath: "/speech/inbound",
      thinkingInputPath: "/thinking/main",
    });
    expect(runtime.speechConfig?.agentName).toBe("Q");
  });
});

describe("speech graph control helpers", () => {
  const assetBundle = {
    programs: [
      {
        id: "program.alpha",
        graph: {
          id: "program.alpha",
          spec: {
            nodes: [
              {
                id: "input.speaking",
                type: "input",
                params: { path: "rig/quori_latest/speech/speaking" },
              },
              {
                id: "input.user",
                type: "input",
                params: { path: "rig/quori_latest/speech/user_speaking" },
              },
              {
                id: "input.thinking",
                type: "input",
                params: { path: "rig/quori_latest/speech/thinking" },
              },
            ],
          },
        },
      },
    ],
    bundle: null,
  };

  it("collects program input paths", () => {
    expect(
      Array.from(resolveActiveProgramInputPaths(assetBundle, "program.alpha")),
    ).toEqual([
      "rig/quori_latest/speech/speaking",
      "rig/quori_latest/speech/user_speaking",
      "rig/quori_latest/speech/thinking",
    ]);
  });

  it("detects when graph speech control is available", () => {
    expect(
      hasGraphSpeechControl({
        assetBundle,
        activeMotionGraphId: "program.alpha",
        faceId: "quori_latest",
        speechPaths: { ...DEFAULT_SPEECH_TOPIC_PATHS },
      }),
    ).toBe(true);
  });

  it("falls back when one or more topic inputs are missing", () => {
    expect(
      hasGraphSpeechControl({
        assetBundle,
        activeMotionGraphId: "missing",
        faceId: "quori_latest",
        speechPaths: { ...DEFAULT_SPEECH_TOPIC_PATHS },
      }),
    ).toBe(false);
  });
});

describe("shouldEnableDebugPoseFallback", () => {
  it("keeps manual pose controls hidden when graph control is active", () => {
    expect(
      shouldEnableDebugPoseFallback({
        debugControlsOpen: false,
        hasGraphSpeechControl: true,
      }),
    ).toBe(false);
  });

  it("enables fallback when the user opens debug controls", () => {
    expect(
      shouldEnableDebugPoseFallback({
        debugControlsOpen: true,
        hasGraphSpeechControl: true,
      }),
    ).toBe(true);
  });

  it("enables fallback automatically when graph control is unavailable", () => {
    expect(
      shouldEnableDebugPoseFallback({
        debugControlsOpen: false,
        hasGraphSpeechControl: false,
      }),
    ).toBe(true);
  });
});
