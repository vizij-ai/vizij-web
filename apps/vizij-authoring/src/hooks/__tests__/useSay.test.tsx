import React, { act } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSay } from "../useSay";

const RUN = { run: "run-1", status: "task/run-1/status" };

const listeners = vi.hoisted(
  () => [] as Array<(changes: Record<string, unknown>) => void>,
);
const runtime = vi.hoisted(() => ({
  path: (relative: string) => `rig/face/${relative}`,
  invoke: vi.fn(),
  halt: vi.fn(async (_run: string) => undefined),
}));

vi.mock("@vizij/runtime-react", () => ({
  useOptionalVizijRuntime: () => ({ status: "ready", runtime }),
  useVizijChanges: (listener: (changes: Record<string, unknown>) => void) => {
    listeners[0] = listener;
  },
}));

vi.mock("@vizij/runtime", () => ({
  unlockAudio: vi.fn(async () => undefined),
  runStatus: (value: unknown) =>
    value && typeof value === "object" && "str" in value
      ? (value as { str: string }).str
      : undefined,
}));

/** Hands the hook's latest result out. */
function renderSay() {
  let result!: ReturnType<typeof useSay>;
  function Harness() {
    result = useSay();
    return null;
  }
  render(<Harness />);
  return () => result;
}

const batch = (changes: Record<string, unknown>) =>
  act(() => {
    listeners[0]!(changes);
  });

describe("useSay", () => {
  beforeEach(() => {
    runtime.invoke.mockReset().mockResolvedValue(RUN);
    runtime.halt.mockClear();
  });

  afterEach(cleanup);

  it("says the text in the voice, and builds the timeline from the visemes the face reports", async () => {
    const say = renderSay();
    await act(async () => {
      await say().speak("Hello", "Ruth");
    });

    expect(runtime.invoke).toHaveBeenCalledWith("say", {
      text: "Hello",
      voice: "Ruth",
    });
    expect(say().status).toBe("speaking");

    batch({
      "rig/face/standard/vizij/speech": { str: "Hello" },
      "rig/face/standard/vizij/viseme": { str: "PP" },
    });
    batch({ "rig/face/standard/vizij/viseme": { str: "PP" } });
    batch({ "rig/face/standard/vizij/viseme": { str: "aa" } });

    expect(say().utterance).toBe("Hello");
    expect(say().visemes.map((entry) => entry.viseme)).toEqual(["PP", "aa"]);

    batch({ [RUN.status]: { str: "success" } });
    expect(say().status).toBe("idle");
    expect(say().visemes.map((entry) => entry.viseme)).toEqual(["PP", "aa"]);
  });

  it("halts the run on stop", async () => {
    const say = renderSay();
    await act(async () => {
      await say().speak("Hello", "Ruth");
    });

    act(() => say().stop());

    expect(runtime.halt).toHaveBeenCalledWith(RUN.run);
  });

  it("reports why the face could not speak", async () => {
    runtime.invoke.mockRejectedValue(new Error("speech service unreachable"));
    const say = renderSay();
    await act(async () => {
      await say().speak("Hello", "Ruth");
    });

    expect(say().status).toBe("idle");
    expect(say().error).toBe("speech service unreachable");
  });
});
