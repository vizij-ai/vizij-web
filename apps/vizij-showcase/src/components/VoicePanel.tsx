import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { runStatus, unlockAudio, type RunHandle } from "@vizij/runtime";
import { useVizijRuntime, useVizijValues } from "@vizij/runtime-react";
import { SPEECH_STATUS_COPY, type SpeechStatus } from "../data/speech";
import { POLLY_VOICES, type PollyVoice } from "../data/pollyVoices";

export type VoicePanelProps = {
  status: SpeechStatus;
  onStatusChange: Dispatch<SetStateAction<SpeechStatus>>;
  enabled?: boolean;
};

const DEFAULT_SCRIPT =
  "With Vizij your avatar mirrors every beat of the conversation.";

/** What the face reports while it speaks: the utterance and its current
 * viseme, both `str`. */
const SPEECH = "standard/vizij/speech";
const VISEME = "standard/vizij/viseme";

const textOf = (value: unknown) =>
  value && typeof value === "object" && "str" in value
    ? String((value as { str: unknown }).str)
    : "";

/**
 * The face speaks a line through the device's `say` method: the text goes
 * to the text-to-speech service, the audio plays through the page, and the
 * face's viseme players move the lips. The run's status key says when the
 * line is over; `halt` stops it.
 */
export function VoicePanel({
  status,
  onStatusChange,
  enabled = true,
}: VoicePanelProps) {
  const { runtime, status: loadStatus } = useVizijRuntime();
  const ready = loadStatus === "ready";
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [voice, setVoice] = useState<PollyVoice>("Ruth");
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
      onStatusChange("idle");
    }
  }, [onStatusChange, run, runState]);

  const speak = useCallback(async () => {
    if (!runtime || !ready || !enabled) return;
    const text = script.trim();
    if (!text) {
      setError("Please enter something to say.");
      return;
    }
    setError(null);
    onStatusChange("preparing");
    try {
      await unlockAudio();
      const handle = (await runtime.invoke("say", {
        text,
        voice,
      })) as RunHandle;
      setRun(handle);
      onStatusChange("speaking");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      onStatusChange("idle");
    }
  }, [enabled, onStatusChange, ready, runtime, script, voice]);

  const stop = useCallback(() => {
    if (runtime && run) void runtime.halt(run.run);
  }, [run, runtime]);

  const statusCopy = SPEECH_STATUS_COPY[status];

  return (
    <div className="feature-card voice-panel">
      <p className="feature-card__eyebrow">Speech pipeline</p>
      <h3>Let the face say a line.</h3>
      <p className="feature-card__description">
        The face's <code>say</code> method turns the text into speech and
        streams its visemes into the face standard's lips, with no credentials
        on the page.
      </p>
      <form className="voice-panel__form" onSubmit={(e) => e.preventDefault()}>
        <label className="voice-panel__label" htmlFor="voice-script">
          Script
        </label>
        <textarea
          id="voice-script"
          className="voice-panel__textarea"
          value={script}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
            setScript(event.target.value)
          }
          rows={3}
          placeholder="Type something for the face to say"
        />
        <label className="voice-panel__label" htmlFor="voice-select">
          Voice
        </label>
        <select
          id="voice-select"
          className="voice-panel__select"
          value={voice}
          onChange={(event: ChangeEvent<HTMLSelectElement>) =>
            setVoice(event.target.value as PollyVoice)
          }
        >
          {POLLY_VOICES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </form>
      {error && <p className="voice-panel__error">{error}</p>}
      <div className="voice-panel__actions">
        <button
          type="button"
          className="cta"
          disabled={!ready || status !== "idle"}
          onClick={() => void speak()}
        >
          {status === "speaking" ? "Speaking…" : "Say it"}
        </button>
        {run && (
          <button type="button" className="ghost-button" onClick={stop}>
            Stop
          </button>
        )}
      </div>
      <div className="voice-panel__status">Status: {statusCopy.label}</div>
      {run && (
        <div className="voice-panel__transcript">
          <div>
            <p className="voice-panel__label">Saying</p>
            <p>{textOf(values[speechKey])}</p>
          </div>
          <div>
            <p className="voice-panel__label">Viseme</p>
            <div className="voice-panel__tokens">
              <span className="voice-panel__token--active">
                {textOf(values[visemeKey]) || "sil"}
              </span>
            </div>
          </div>
        </div>
      )}
      <ul className="voice-panel__steps">
        <li>
          1. <code>say</code> sends the text and voice to the text-to-speech
          service.
        </li>
        <li>2. The audio plays through the page's audio player.</li>
        <li>3. The viseme players move the face standard's lips with it.</li>
      </ul>
    </div>
  );
}
