import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoVoicePanel } from "./DemoVoicePanel";

const RUN = { run: "run-1", status: "task/run-1/status" };
const SPEECH = "rig/quori/standard/vizij/speech";
const VISEME = "rig/quori/standard/vizij/viseme";

const face = vi.hoisted(() => ({
  status: "ready",
  listeners: [] as Array<(changes: Record<string, unknown>) => void>,
}));
const runtime = vi.hoisted(() => ({
  path: (relative: string) => `rig/quori/${relative}`,
  invoke: vi.fn(),
  halt: vi.fn(async (_run: string) => undefined),
}));

vi.mock("@vizij/runtime-react", () => ({
  useVizijRuntime: () => ({ status: face.status, runtime }),
  useOptionalVizijRuntime: () => ({ status: face.status, runtime }),
  useVizijChanges: (listener: (changes: Record<string, unknown>) => void) => {
    face.listeners[0] = listener;
  },
}));

vi.mock("@vizij/runtime", () => ({
  unlockAudio: vi.fn().mockResolvedValue(undefined),
  runStatus: (value: unknown) =>
    value && typeof value === "object" && "str" in value
      ? (value as { str: string }).str
      : undefined,
}));

const speakButton = () =>
  screen.getByTestId("empty-state-demo-voice-speak") as HTMLButtonElement;

const speak = () =>
  act(async () => {
    fireEvent.click(speakButton());
  });

/** The face's store changing, as one batch the provider hands out. */
const batch = (changes: Record<string, unknown>) =>
  act(() => {
    face.listeners[0]!(changes);
  });

const chips = () =>
  screen.queryAllByTestId("empty-state-demo-viseme").map((chip) => ({
    viseme: chip.textContent,
    current: chip.getAttribute("aria-current") === "true",
  }));

describe("DemoVoicePanel", () => {
  beforeEach(() => {
    face.status = "ready";
    runtime.invoke.mockReset().mockResolvedValue(RUN);
    runtime.halt.mockClear();
  });

  afterEach(cleanup);

  it("enables the speak button once the face is ready", () => {
    render(<DemoVoicePanel />);
    expect(speakButton().disabled).toBe(false);
  });

  it("disables the speak button until the face is ready", () => {
    face.status = "loading";
    render(<DemoVoicePanel />);
    expect(speakButton().disabled).toBe(true);
  });

  it("says the script in the chosen voice, adds each viseme as the face takes it, and stops the run", async () => {
    render(<DemoVoicePanel />);
    fireEvent.change(screen.getByTestId("empty-state-demo-voice-script"), {
      target: { value: "Hello" },
    });
    await speak();

    expect(runtime.invoke).toHaveBeenCalledWith("say", {
      text: "Hello",
      voice: "Ruth",
    });
    expect(speakButton().disabled).toBe(true);

    batch({ [SPEECH]: { str: "Hello" }, [VISEME]: { str: "PP" } });
    batch({ [VISEME]: { str: "PP" } });
    batch({ [VISEME]: { str: "sil" } });
    batch({ [VISEME]: { str: "aa" } });

    expect(screen.getByTestId("empty-state-demo-utterance").textContent).toBe(
      "Hello",
    );
    expect(chips()).toEqual([
      { viseme: "PP", current: false },
      { viseme: "sil", current: false },
      { viseme: "aa", current: true },
    ]);

    fireEvent.click(screen.getByTestId("empty-state-demo-voice-stop"));
    expect(runtime.halt).toHaveBeenCalledWith(RUN.run);
  });

  it("keeps the line and its visemes once it is said, none of them current", async () => {
    render(<DemoVoicePanel />);
    await speak();
    batch({ [SPEECH]: { str: "Hello" }, [VISEME]: { str: "aa" } });
    batch({ [SPEECH]: { str: "" }, [VISEME]: { str: "sil" } });
    batch({ [RUN.status]: { str: "success" } });

    expect(speakButton().disabled).toBe(false);
    expect(screen.queryByTestId("empty-state-demo-voice-stop")).toBeNull();
    expect(screen.getByTestId("empty-state-demo-utterance").textContent).toBe(
      "Hello",
    );
    expect(chips()).toEqual([
      { viseme: "aa", current: false },
      { viseme: "sil", current: false },
    ]);
  });

  it("clears the previous line's visemes when it speaks again", async () => {
    render(<DemoVoicePanel />);
    await speak();
    batch({ [SPEECH]: { str: "Hello" }, [VISEME]: { str: "aa" } });
    batch({ [RUN.status]: { str: "success" } });

    runtime.invoke.mockResolvedValue({
      run: "run-2",
      status: "task/run-2/status",
    });
    await speak();

    expect(chips()).toEqual([]);
    expect(screen.queryByTestId("empty-state-demo-utterance")).toBeNull();
  });

  it("shows why the face could not speak", async () => {
    runtime.invoke.mockRejectedValue(new Error("speech service unreachable"));
    render(<DemoVoicePanel />);

    await speak();

    expect(screen.getByTestId("empty-state-demo-voice-error").textContent).toBe(
      "speech service unreachable",
    );
    expect(speakButton().disabled).toBe(false);
  });
});
