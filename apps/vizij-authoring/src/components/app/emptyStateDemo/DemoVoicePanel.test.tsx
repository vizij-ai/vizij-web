import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoVoicePanel } from "./DemoVoicePanel";

const RUN = { run: "run-1", status: "task/run-1/status" };

const face = {
  status: "ready",
  values: {} as Record<string, unknown>,
};
const runtime = {
  path: (relative: string) => `rig/quori/${relative}`,
  invoke: vi.fn(),
  halt: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@vizij/runtime-react", () => ({
  useVizijRuntime: () => ({ status: face.status, runtime }),
  useVizijValues: (paths: string[]) =>
    Object.fromEntries(paths.map((path) => [path, face.values[path] ?? null])),
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

describe("DemoVoicePanel", () => {
  beforeEach(() => {
    face.status = "ready";
    face.values = {};
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

  it("says the script in the chosen voice, shows the viseme, and stops the run", async () => {
    face.values = {
      "rig/quori/standard/vizij/speech": { str: "Hello" },
      "rig/quori/standard/vizij/viseme": { str: "aa" },
      [RUN.status]: { str: "running" },
    };
    render(<DemoVoicePanel />);
    fireEvent.change(screen.getByTestId("empty-state-demo-voice-script"), {
      target: { value: "Hello" },
    });

    await act(async () => {
      fireEvent.click(speakButton());
    });

    expect(runtime.invoke).toHaveBeenCalledWith("say", {
      text: "Hello",
      voice: "Ruth",
    });
    expect(screen.getByTestId("empty-state-demo-viseme").textContent).toBe(
      "aa",
    );
    expect(speakButton().disabled).toBe(true);

    fireEvent.click(screen.getByTestId("empty-state-demo-voice-stop"));
    expect(runtime.halt).toHaveBeenCalledWith(RUN.run);
  });

  it("shows why the face could not speak", async () => {
    runtime.invoke.mockRejectedValue(new Error("speech service unreachable"));
    render(<DemoVoicePanel />);

    await act(async () => {
      fireEvent.click(speakButton());
    });

    expect(screen.getByTestId("empty-state-demo-voice-error").textContent).toBe(
      "speech service unreachable",
    );
    expect(speakButton().disabled).toBe(false);
  });
});
