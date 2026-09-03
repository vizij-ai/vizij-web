import { describe, expect, it } from "vitest";
import { toDeterministicSignature } from "../useAnimationTransport";

/**
 * The animation bridge decides whether the runtime has caught up with the
 * clip it published by comparing two signatures for equality. The runtime
 * stores a clip's duration as integer milliseconds, so anything finer comes
 * back rounded — and an exact comparison then never converges, which stalls
 * `transportRuntimeReady` and makes the bridge re-apply the bundle forever
 * (observed as playback restarting every couple of seconds).
 */
describe("toDeterministicSignature", () => {
  it("matches a duration that round-tripped through integer milliseconds", () => {
    // The real case: Toasty's imported clip is 21.958334s; the runtime reports
    // 21.958 after storing it as 21958ms.
    const published = { id: "clip", clip: { duration: 21.958334, tracks: [] } };
    const readBack = { id: "clip", clip: { duration: 21.958, tracks: [] } };
    expect(toDeterministicSignature(readBack)).toBe(
      toDeterministicSignature(published),
    );
  });

  it("matches keyframe times that round-tripped the same way", () => {
    const published = {
      clip: {
        tracks: [{ keyframes: [{ time: 0.7083333333, value: 0.1234567 }] }],
      },
    };
    const readBack = {
      clip: { tracks: [{ keyframes: [{ time: 0.708, value: 0.123 }] }] },
    };
    expect(toDeterministicSignature(readBack)).toBe(
      toDeterministicSignature(published),
    );
  });

  it("still differs when a duration genuinely changes", () => {
    expect(toDeterministicSignature({ clip: { duration: 5 } })).not.toBe(
      toDeterministicSignature({ clip: { duration: 6 } }),
    );
  });

  it("still differs when a keyframe value genuinely changes", () => {
    expect(
      toDeterministicSignature({ keyframes: [{ time: 0, value: 0 }] }),
    ).not.toBe(
      toDeterministicSignature({ keyframes: [{ time: 0, value: 1 }] }),
    );
  });

  it("still differs when a track is added or removed", () => {
    expect(toDeterministicSignature({ tracks: [] })).not.toBe(
      toDeterministicSignature({ tracks: [{ channel: "a" }] }),
    );
  });

  it("is insensitive to key order", () => {
    expect(toDeterministicSignature({ a: 1, b: 2 })).toBe(
      toDeterministicSignature({ b: 2, a: 1 }),
    );
  });

  it("tolerates circular structures", () => {
    const node: Record<string, unknown> = { id: "n" };
    node.self = node;
    expect(() => toDeterministicSignature(node)).not.toThrow();
  });

  it("leaves non-finite numbers alone rather than corrupting them", () => {
    const signature = toDeterministicSignature({ a: Number.NaN, b: Infinity });
    expect(signature).toContain("null");
  });
});
