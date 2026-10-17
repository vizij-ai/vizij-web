import { useCallback, useEffect, useState } from "react";
import { runStatus, unlockAudio, type RunHandle } from "@vizij/runtime";
import { useVizijRuntime, useVizijValues } from "@vizij/runtime-react";
import { Button, Select, TextArea, type SelectOption } from "../../ui";
import { POLLY_VOICES, type PollyVoice } from "../../../data/pollyVoices";

const VOICE_OPTIONS: SelectOption[] = POLLY_VOICES.map((voice) => ({
  value: voice,
  label: voice,
}));

const DEFAULT_SCRIPT =
  "Vizij is a framework for defining, animating, and deploying expressive rendered robot faces";

/** What the face reports while it speaks: the utterance and its current
 * viseme, both `str`, relative to the face. */
const SPEECH = "standard/vizij/speech";
const VISEME = "standard/vizij/viseme";

const textOf = (value: unknown) =>
  value && typeof value === "object" && "str" in value
    ? String((value as { str: unknown }).str)
    : "";

/**
 * The demo face says a line through its device's `say` method: the text goes
 * to the text-to-speech service, the audio plays through the page, and the
 * face's lips follow. The run's status key says when the line is over;
 * Stop halts it.
 */
export function DemoVoicePanel() {
  const { status, runtime } = useVizijRuntime();
  const ready = status === "ready";
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [voice, setVoice] = useState<PollyVoice>("Ruth");
  const [preparing, setPreparing] = useState(false);
  const [run, setRun] = useState<RunHandle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const speechKey = runtime ? runtime.path(SPEECH) : SPEECH;
  const visemeKey = runtime ? runtime.path(VISEME) : VISEME;
  const values = useVizijValues(
    run ? [run.status, speechKey, visemeKey] : [speechKey, visemeKey],
  );
  const runState = run ? runStatus(values[run.status]) : undefined;

  useEffect(() => {
    if (run && runState && runState !== "running") {
      setRun(null);
    }
  }, [run, runState]);

  const speak = useCallback(async () => {
    if (!runtime || !ready) {
      return;
    }
    const text = script.trim();
    if (!text) {
      setError("Please enter something to say.");
      return;
    }
    setError(null);
    setPreparing(true);
    try {
      await unlockAudio();
      setRun((await runtime.invoke("say", { text, voice })) as RunHandle);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreparing(false);
    }
  }, [ready, runtime, script, voice]);

  const stop = useCallback(() => {
    if (runtime && run) {
      void runtime.halt(run.run);
    }
  }, [run, runtime]);

  const busy = preparing || run !== null;

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
          disabled={!ready || busy}
          onClick={() => void speak()}
        >
          {preparing ? "Preparing…" : run ? "Speaking…" : "Speak"}
        </Button>
        {run ? (
          <Button
            data-testid="empty-state-demo-voice-stop"
            variant="subtle"
            size="sm"
            onClick={stop}
          >
            Stop
          </Button>
        ) : null}
      </div>
      {error ? (
        <p
          data-testid="empty-state-demo-voice-error"
          className="text-xs text-red-400"
        >
          {error}
        </p>
      ) : null}
      {run ? (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
            Saying
          </p>
          <p className="text-[11px] text-text-muted">
            {textOf(values[speechKey])}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-widest text-text-muted">
            Viseme
          </p>
          <span
            data-testid="empty-state-demo-viseme"
            className="self-start rounded border border-accent bg-accent/20 px-1.5 py-0.5 text-[11px] text-text-primary"
          >
            {textOf(values[visemeKey]) || "sil"}
          </span>
        </div>
      ) : null}
    </div>
  );
}
