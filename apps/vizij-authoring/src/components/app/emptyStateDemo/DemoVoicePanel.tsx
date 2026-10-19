import { useState } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { Button, Select, TextArea, type SelectOption } from "../../ui";
import { POLLY_VOICES, type PollyVoice } from "../../../data/pollyVoices";
import { useSay } from "../../../hooks/useSay";

const VOICE_OPTIONS: SelectOption[] = POLLY_VOICES.map((voice) => ({
  value: voice,
  label: voice,
}));

const DEFAULT_SCRIPT =
  "Vizij is a framework for defining, animating, and deploying expressive rendered robot faces";

/**
 * The demo face says a line through its device's `say` method: the text goes
 * to the text-to-speech service, the audio plays through the page, and the
 * face's lips follow. The panel shows the line and the visemes the face takes
 * as it says it, the current one highlighted; both stay once the line is
 * said, until the next Speak. Stop halts the run.
 */
export function DemoVoicePanel() {
  const { status } = useVizijRuntime();
  const ready = status === "ready";
  const say = useSay();
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [voice, setVoice] = useState<PollyVoice>("Ruth");
  const speaking = say.status === "speaking";

  return (
    <div
      data-testid="empty-state-demo-voice"
      className="flex w-full flex-col gap-2 text-left"
    >
      <TextArea
        data-testid="empty-state-demo-voice-script"
        rows={2}
        value={script}
        onChange={(event) => setScript(event.target.value)}
        placeholder="Type something for the face to say…"
      />
      <div className="flex items-center gap-2">
        <Select
          className="w-36 shrink-0"
          size="sm"
          value={voice}
          onChange={(next) => setVoice(next as PollyVoice)}
          options={VOICE_OPTIONS}
        />
        <Button
          data-testid="empty-state-demo-voice-speak"
          variant="primary"
          size="sm"
          disabled={!ready || say.status !== "idle"}
          onClick={() => void say.speak(script, voice)}
        >
          {say.status === "preparing"
            ? "Preparing…"
            : speaking
              ? "Speaking…"
              : "Speak"}
        </Button>
        {speaking ? (
          <Button
            data-testid="empty-state-demo-voice-stop"
            variant="subtle"
            size="sm"
            onClick={say.stop}
          >
            Stop
          </Button>
        ) : null}
      </div>
      {say.error ? (
        <p
          data-testid="empty-state-demo-voice-error"
          className="text-xs text-red-400"
        >
          {say.error}
        </p>
      ) : null}
      {say.utterance || say.visemes.length > 0 ? (
        <div className="flex flex-col gap-1">
          {say.utterance ? (
            <>
              <p className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
                {speaking ? "Saying" : "Said"}
              </p>
              <p
                data-testid="empty-state-demo-utterance"
                className="text-[11px] text-text-muted"
              >
                {say.utterance}
              </p>
            </>
          ) : null}
          <p className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
            Visemes
          </p>
          <div
            data-testid="empty-state-demo-visemes"
            className="flex flex-wrap gap-1"
          >
            {say.visemes.map((entry, index) => {
              const current = speaking && index === say.visemes.length - 1;
              return (
                <span
                  key={`${entry.at}-${index}`}
                  data-testid="empty-state-demo-viseme"
                  aria-current={current ? "true" : undefined}
                  className={`rounded border px-1.5 py-0.5 text-[11px] ${
                    current
                      ? "border-accent bg-accent/20 text-text-primary"
                      : "border-border-default bg-bg-panel text-text-muted"
                  }`}
                >
                  {entry.viseme}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
