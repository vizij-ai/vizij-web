import { describe, expect, it } from "vitest";
import {
  MICROPHONE_INSECURE_CONTEXT_MESSAGE,
  MICROPHONE_PERMISSION_DENIED_MESSAGE,
  MICROPHONE_UNSUPPORTED_MESSAGE,
  assertMicrophoneSupport,
  getMicrophoneSupport,
  toMicrophoneInputError,
} from "./microphoneSupport";

describe("getMicrophoneSupport", () => {
  it("reports available when getUserMedia exists", () => {
    expect(
      getMicrophoneSupport({
        isSecureContext: true,
        navigator: {
          mediaDevices: {
            getUserMedia: () => Promise.resolve(null),
          },
        },
      }),
    ).toEqual({
      code: "available",
      message: null,
      supported: true,
    });
  });

  it("reports insecure context when mediaDevices is unavailable on HTTP", () => {
    expect(
      getMicrophoneSupport({
        isSecureContext: false,
        navigator: {},
      }),
    ).toEqual({
      code: "insecure-context",
      message: MICROPHONE_INSECURE_CONTEXT_MESSAGE,
      supported: false,
    });
  });

  it("reports unsupported browser when secure context still lacks getUserMedia", () => {
    expect(
      getMicrophoneSupport({
        isSecureContext: true,
        navigator: {},
      }),
    ).toEqual({
      code: "unsupported-browser",
      message: MICROPHONE_UNSUPPORTED_MESSAGE,
      supported: false,
    });
  });
});

describe("assertMicrophoneSupport", () => {
  it("throws a typed insecure-context error", () => {
    expect(() =>
      assertMicrophoneSupport({
        isSecureContext: false,
        navigator: {},
      }),
    ).toThrow(MICROPHONE_INSECURE_CONTEXT_MESSAGE);
  });
});

describe("toMicrophoneInputError", () => {
  it("maps permission denial to the app-specific message", () => {
    const error = toMicrophoneInputError(
      new DOMException("blocked", "NotAllowedError"),
      {
        isSecureContext: true,
        navigator: {
          mediaDevices: {
            getUserMedia: () => Promise.resolve(null),
          },
        },
      },
    );

    expect(error.code).toBe("permission-denied");
    expect(error.message).toBe(MICROPHONE_PERMISSION_DENIED_MESSAGE);
  });

  it("falls back to capability messaging when the browser lacks mediaDevices", () => {
    const error = toMicrophoneInputError(new Error("boom"), {
      isSecureContext: false,
      navigator: {},
    });

    expect(error.code).toBe("insecure-context");
    expect(error.message).toBe(MICROPHONE_INSECURE_CONTEXT_MESSAGE);
  });
});
