import { createRef } from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UseSpeechPlaybackReturn } from "../../../hooks/useSpeechPlayback";
import { DemoVoicePanel } from "./DemoVoicePanel";

const runtimeState = { ready: true };

vi.mock("@vizij/runtime-react", () => ({
  useVizijRuntime: () => ({
    ready: runtimeState.ready,
    setInput: vi.fn(),
    animateValue: vi.fn(),
    faceId: "face",
    assetBundle: { namespace: "empty-demo", glb: { kind: "url", src: "x" } },
  }),
}));

const speechState: UseSpeechPlaybackReturn = {} as UseSpeechPlaybackReturn;

vi.mock("../../../hooks/useSpeechPlayback", () => ({
  useSpeechPlayback: () => speechState,
}));

function resetSpeechState(overrides: Partial<UseSpeechPlaybackReturn> = {}) {
  Object.assign(speechState, {
    status: "idle",
    script: "Hello",
    setScript: vi.fn(),
    selectedVoice: "Ruth",
    setSelectedVoice: vi.fn(),
    error: null,
    isLoading: false,
    words: [],
    visemeLabels: [],
    activeVisemeIndex: -1,
    audioRef: createRef<HTMLAudioElement>(),
    handleSpeak: vi.fn(),
    handleStop: vi.fn(),
    handleAudioPlay: vi.fn(),
    handleAudioPause: vi.fn(),
    handleAudioEnded: vi.fn(),
    selectedGroupId: null,
    setSelectedGroupId: vi.fn(),
    groupOptions: [],
    ...overrides,
  } satisfies UseSpeechPlaybackReturn);
}

const speakButton = (container: HTMLElement) =>
  container.querySelector(
    '[data-testid="empty-state-demo-voice-speak"]',
  ) as HTMLButtonElement;

describe("DemoVoicePanel", () => {
  beforeEach(() => {
    runtimeState.ready = true;
    resetSpeechState();
  });

  it("enables the speak button when the runtime is ready", () => {
    const { container } = render(<DemoVoicePanel />);
    expect(speakButton(container).disabled).toBe(false);
  });

  it("disables the speak button until the runtime is ready", () => {
    runtimeState.ready = false;
    const { container } = render(<DemoVoicePanel />);
    expect(speakButton(container).disabled).toBe(true);
  });

  it("disables the speak button while speech is loading", () => {
    resetSpeechState({ isLoading: true });
    const { container } = render(<DemoVoicePanel />);
    expect(speakButton(container).disabled).toBe(true);
  });

  it("shows the speech error inline", () => {
    resetSpeechState({ error: "Polly unreachable" });
    const { container } = render(<DemoVoicePanel />);
    expect(
      container.querySelector('[data-testid="empty-state-demo-voice-error"]')
        ?.textContent,
    ).toBe("Polly unreachable");
  });

  it("renders word and viseme chips with the active viseme highlighted", () => {
    resetSpeechState({
      words: [
        { time: 0, type: "word", value: "Hello" },
        { time: 200, type: "word", value: "world" },
      ],
      visemeLabels: ["p", "eh", "rest"],
      activeVisemeIndex: 1,
    });
    const { container } = render(<DemoVoicePanel />);
    expect(container.textContent).toContain("Hello");
    expect(container.textContent).toContain("world");
    const chips = Array.from(
      container.querySelectorAll(
        '[data-testid="empty-state-demo-viseme-chips"] span',
      ),
    );
    expect(chips.map((chip) => chip.textContent)).toEqual(["p", "eh", "rest"]);
    expect(chips[1].className).toContain("border-accent");
    expect(chips[0].className).not.toContain("border-accent");
  });
});
