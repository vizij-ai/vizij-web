import {
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { usePollyTTS } from "../hooks/usePollyTTS";
import { SPEECH_STATUS_COPY, type SpeechStatus } from "../data/speech";
import { POLLY_VOICES, type PollyVoice } from "../data/pollyVoices";
import type { VisemeData } from "../types/polly";
import { FACE_VISEME_SEGMENT_LIST, mapPollyViseme } from "../lib/visemeMapping";

export type VoicePanelProps = {
  status: SpeechStatus;
  onStatusChange: Dispatch<SetStateAction<SpeechStatus>>;
  enabled?: boolean;
};

type VisemeTimelineEntry = {
  start: number;
  end: number;
  transitionStart: number;
  path: string | null;
  displayLabel: string;
  isSilence: boolean;
  sourceCode: string;
};

type CachedSpeech = {
  visemeData: VisemeData;
  audioBlob: Blob;
};

const DEFAULT_SCRIPT =
  "With Vizij your avatar mirrors every beat of the conversation.";
const MIN_VISEME_SPAN_MS = 45;
const MAX_VISEME_SPAN_MS = 320;
const RELEASE_TO_NEUTRAL_MS = 120;

const clampMs = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
export function VoicePanel({
  status,
  onStatusChange,
  enabled = true,
}: VoicePanelProps) {
  const { ready, setInput, faceId, animateValue } = useVizijRuntime();
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [selectedVoice, setSelectedVoice] = useState<PollyVoice>("Ruth");
  const [formError, setFormError] = useState<string | null>(null);
  const [activeVisemeIndex, setActiveVisemeIndex] = useState(-1);
  const [faceVisemeLabels, setFaceVisemeLabels] = useState<string[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const autoplayRef = useRef(false);
  const visemeTimelineRef = useRef<VisemeTimelineEntry[]>([]);
  const visemePathsRef = useRef<Set<string>>(new Set());
  const lastVisemePathRef = useRef<string | null>(null);
  const visemeIndexRef = useRef(-1);
  const transitionCursorRef = useRef(0);
  const speechCacheRef = useRef<Map<string, CachedSpeech>>(new Map());

  const {
    spokenWords,
    spokenAudio,
    isLoading: pollyLoading,
    error: pollyError,
    getTTSData,
    setSpokenAudio,
    setSpokenSentences,
    setSpokenVisemes,
    setSpokenWords,
  } = usePollyTTS();

  const visemeBasePath = useMemo(
    () => `rig/${(faceId ?? "face").toLowerCase()}/visemes`,
    [faceId],
  );

  const resolveSegmentPath = useCallback(
    (segment: string) => `${visemeBasePath}/${segment}.weight`,
    [visemeBasePath],
  );

  const defaultVisemePaths = useMemo(
    () =>
      FACE_VISEME_SEGMENT_LIST.map((segment) => resolveSegmentPath(segment)),
    [resolveSegmentPath],
  );

  useEffect(() => {
    visemePathsRef.current = new Set(defaultVisemePaths);
  }, [defaultVisemePaths]);

  const triggerVisemeEntry = useCallback(
    (index: number, timeMs: number) => {
      const timeline = visemeTimelineRef.current;
      const entry = timeline[index];
      if (!entry) {
        return;
      }
      if (!ready || !enabled) {
        lastVisemePathRef.current = entry.path;
        return;
      }
      const prevPath = lastVisemePathRef.current;
      const remainingMs = entry.start - timeMs;
      const durationMs = clampMs(
        remainingMs > 0 ? remainingMs : MIN_VISEME_SPAN_MS,
        MIN_VISEME_SPAN_MS,
        MAX_VISEME_SPAN_MS,
      );
      const durationSec = durationMs / 250;
      if (prevPath && prevPath !== entry.path) {
        void animateValue(prevPath, { float: 0 }, { duration: durationSec });
      } else if (!entry.path && prevPath) {
        void animateValue(prevPath, { float: 0 }, { duration: durationSec });
      }

      if (entry.path && prevPath !== entry.path) {
        void animateValue(entry.path, { float: 1 }, { duration: durationSec });
      }
      lastVisemePathRef.current = entry.path;
    },
    [animateValue, enabled, ready],
  );

  const triggerTransitionsUpToTime = useCallback(
    (timeMs: number) => {
      if (!ready || !enabled) {
        return;
      }
      const timeline = visemeTimelineRef.current;
      let cursor = transitionCursorRef.current;
      while (
        cursor < timeline.length &&
        timeMs >= timeline[cursor].transitionStart
      ) {
        triggerVisemeEntry(cursor, timeMs);
        cursor += 1;
      }
      transitionCursorRef.current = cursor;
    },
    [enabled, ready, triggerVisemeEntry],
  );

  const syncTransitionCursorToTime = useCallback((timeMs: number) => {
    const timeline = visemeTimelineRef.current;
    let cursor = 0;
    while (
      cursor < timeline.length &&
      timeMs >= timeline[cursor].transitionStart
    ) {
      cursor += 1;
    }
    transitionCursorRef.current = cursor;
  }, []);

  const stopRAF = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const clearVisemeInputs = useCallback(() => {
    if (!ready || !enabled) {
      lastVisemePathRef.current = null;
      return;
    }
    visemePathsRef.current.forEach((path) => setInput(path, { float: 0 }));
    lastVisemePathRef.current = null;
  }, [ready, setInput]);

  const snapToVisemeFrame = useCallback(
    (frame: VisemeTimelineEntry | null) => {
      if (!ready) {
        lastVisemePathRef.current = frame?.path ?? null;
        return;
      }
      visemePathsRef.current.forEach((path) => setInput(path, { float: 0 }));
      if (frame?.path) {
        setInput(frame.path, { float: 1 });
      }
      lastVisemePathRef.current = frame?.path ?? null;
    },
    [enabled, ready, setInput],
  );

  const resetVisemeState = useCallback(() => {
    visemeTimelineRef.current = [];
    visemeIndexRef.current = -1;
    setActiveVisemeIndex(-1);
    setFaceVisemeLabels([]);
    transitionCursorRef.current = 0;
    lastVisemePathRef.current = null;
  }, []);

  const stopPlayback = useCallback(
    (resetStatus = true) => {
      stopRAF();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      clearVisemeInputs();
      resetVisemeState();
      autoplayRef.current = false;
      if (resetStatus) {
        onStatusChange("idle");
      }
    },
    [clearVisemeInputs, onStatusChange, resetVisemeState, stopRAF],
  );

  useEffect(() => () => stopPlayback(false), [stopPlayback]);

  const applyVisemeAt = useCallback(
    (timeMs: number): VisemeTimelineEntry | null => {
      const timeline = visemeTimelineRef.current;
      if (timeline.length === 0) {
        if (visemeIndexRef.current !== -1) {
          visemeIndexRef.current = -1;
          setActiveVisemeIndex(-1);
        }
        return null;
      }
      const idx = findVisemeIndex(timeline, timeMs);
      if (idx !== visemeIndexRef.current) {
        visemeIndexRef.current = idx;
        setActiveVisemeIndex(idx);
      }
      return idx >= 0 ? timeline[idx] : null;
    },
    [],
  );

  const syncFromAudio = useCallback(() => {
    if (!audioRef.current) {
      rafRef.current = requestAnimationFrame(syncFromAudio);
      return;
    }
    const timeMs = audioRef.current.currentTime * 1000;
    triggerTransitionsUpToTime(timeMs);
    applyVisemeAt(timeMs);
    rafRef.current = requestAnimationFrame(syncFromAudio);
  }, [applyVisemeAt, triggerTransitionsUpToTime]);

  const startRAF = useCallback(() => {
    if (rafRef.current != null) {
      return;
    }
    rafRef.current = requestAnimationFrame(syncFromAudio);
  }, [syncFromAudio]);

  const updateTimeline = useCallback(
    (visemes: VisemeData["visemes"]) => {
      const timeline = createVisemeTimeline(visemes, resolveSegmentPath);
      visemeTimelineRef.current = timeline;
      const merged = new Set(defaultVisemePaths);
      timeline.forEach((entry) => {
        if (entry.path) {
          merged.add(entry.path);
        }
      });
      visemePathsRef.current = merged;
      visemeIndexRef.current = -1;
      setActiveVisemeIndex(-1);
      setFaceVisemeLabels(timeline.map((entry) => entry.displayLabel));
      transitionCursorRef.current = 0;
      lastVisemePathRef.current = null;
      if (timeline.length > 0) {
        triggerTransitionsUpToTime(0);
      }
    },
    [defaultVisemePaths, resolveSegmentPath, triggerTransitionsUpToTime],
  );

  const hydrateSpeech = useCallback(
    ({ visemeData, audioBlob }: CachedSpeech) => {
      const audioUrl = URL.createObjectURL(audioBlob);
      setSpokenSentences(visemeData.sentences);
      setSpokenWords(visemeData.words);
      setSpokenVisemes(visemeData.visemes);
      setSpokenAudio(audioUrl);
      updateTimeline(visemeData.visemes);
    },
    [
      setSpokenAudio,
      setSpokenSentences,
      setSpokenVisemes,
      setSpokenWords,
      updateTimeline,
    ],
  );

  const handleGenerate = useCallback(async () => {
    if (!ready || pollyLoading || !enabled) {
      return;
    }
    const trimmed = script.trim();
    if (!trimmed) {
      setFormError("Please enter something for Polly to speak.");
      return;
    }
    const cacheKey = `${selectedVoice}::${trimmed}`;
    setFormError(null);
    stopPlayback(false);
    onStatusChange("preparing");

    const cached = speechCacheRef.current.get(cacheKey);
    if (cached) {
      hydrateSpeech(cached);
      autoplayRef.current = true;
      return;
    }

    try {
      const { visemeData, audioBlob } = await getTTSData(
        trimmed,
        selectedVoice,
      );
      const payload: CachedSpeech = {
        visemeData,
        audioBlob,
      };
      speechCacheRef.current.set(cacheKey, payload);
      hydrateSpeech(payload);
      autoplayRef.current = true;
    } catch {
      onStatusChange("idle");
    }
  }, [
    getTTSData,
    hydrateSpeech,
    enabled,
    onStatusChange,
    pollyLoading,
    ready,
    script,
    selectedVoice,
    stopPlayback,
  ]);

  const handleVoiceChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setSelectedVoice(event.target.value as PollyVoice);
    },
    [],
  );

  const handleScriptChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setScript(event.target.value);
    },
    [],
  );

  const handleAudioPlay = useCallback(() => {
    startRAF();
    onStatusChange("speaking");
  }, [onStatusChange, startRAF]);

  const handleAudioPause = useCallback(() => {
    stopRAF();
  }, [stopRAF]);

  const handleAudioEnded = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  const handleAudioScrub = useCallback(
    (timeSec: number) => {
      if (audioRef.current && !audioRef.current.paused) {
        return;
      }
      const ms = Math.max(0, timeSec * 1000);
      syncTransitionCursorToTime(ms);
      const frame = applyVisemeAt(ms);
      snapToVisemeFrame(frame);
    },
    [applyVisemeAt, snapToVisemeFrame, syncTransitionCursorToTime],
  );

  const handleStopClick = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  useEffect(() => {
    if (!spokenAudio) {
      return undefined;
    }
    return () => URL.revokeObjectURL(spokenAudio);
  }, [spokenAudio]);

  useEffect(() => {
    if (!spokenAudio || !audioRef.current) {
      return;
    }
    audioRef.current.currentTime = 0;
    if (autoplayRef.current) {
      audioRef.current.play().catch(() => {
        onStatusChange("idle");
      });
    } else {
      onStatusChange("idle");
    }
    autoplayRef.current = false;
  }, [onStatusChange, spokenAudio]);

  useEffect(() => {
    if (pollyError) {
      onStatusChange("idle");
    }
  }, [pollyError, onStatusChange]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const timeMs = audioRef.current ? audioRef.current.currentTime * 1000 : 0;
    triggerTransitionsUpToTime(timeMs);
  }, [ready, triggerTransitionsUpToTime]);

  const statusCopy = SPEECH_STATUS_COPY[status];
  const primaryLabel = pollyLoading
    ? "Requesting Polly..."
    : status === "speaking"
      ? "Playing sample"
      : "Generate sample read";

  return (
    <div className="feature-card voice-panel">
      <p className="feature-card__eyebrow">Speech pipeline</p>
      <h3>Generate a sample line powered by Polly.</h3>
      <p className="feature-card__description">
        Request live Amazon Polly audio + viseme metadata, then stream the
        visemes into Vizij via the runtime staging API.
      </p>
      <form className="voice-panel__form" onSubmit={(e) => e.preventDefault()}>
        <label className="voice-panel__label" htmlFor="voice-script">
          Script
        </label>
        <textarea
          id="voice-script"
          className="voice-panel__textarea"
          value={script}
          onChange={handleScriptChange}
          rows={3}
          placeholder="Type something for Polly to say"
        />
        <label className="voice-panel__label" htmlFor="voice-select">
          Voice
        </label>
        <select
          id="voice-select"
          className="voice-panel__select"
          value={selectedVoice}
          onChange={handleVoiceChange}
        >
          {POLLY_VOICES.map((voice) => (
            <option key={voice} value={voice}>
              {voice}
            </option>
          ))}
        </select>
      </form>
      {formError && <p className="voice-panel__error">{formError}</p>}
      {pollyError && (
        <p className="voice-panel__error">
          {pollyError.message || "Failed to fetch Polly visemes."}
        </p>
      )}
      <div className="voice-panel__actions">
        <button
          type="button"
          className="cta"
          disabled={!ready || pollyLoading || status === "speaking"}
          onClick={handleGenerate}
        >
          {primaryLabel}
        </button>
        {status === "speaking" && (
          <button
            type="button"
            className="ghost-button"
            onClick={handleStopClick}
          >
            Stop playback
          </button>
        )}
      </div>
      <div className="voice-panel__status">Status: {statusCopy.label}</div>
      {spokenAudio && (
        <div className="voice-panel__audio">
          <audio
            key={spokenAudio}
            controls
            src={spokenAudio}
            ref={audioRef}
            onPlay={handleAudioPlay}
            onPause={handleAudioPause}
            onEnded={handleAudioEnded}
            onTimeUpdate={(event) =>
              handleAudioScrub(event.currentTarget.currentTime)
            }
            onSeeked={(event) =>
              handleAudioScrub(event.currentTarget.currentTime)
            }
          />
        </div>
      )}
      {(spokenWords.length > 0 || faceVisemeLabels.length > 0) && (
        <div className="voice-panel__transcript">
          {spokenWords.length > 0 && (
            <div>
              <p className="voice-panel__label">Words</p>
              <div className="voice-panel__tokens">
                {spokenWords.map((word, index) => (
                  <span key={`${word.value}-${index}`}>{word.value}</span>
                ))}
              </div>
            </div>
          )}
          {faceVisemeLabels.length > 0 && (
            <div>
              <p className="voice-panel__label">Visemes</p>
              <div className="voice-panel__tokens">
                {faceVisemeLabels.map((label, index) => (
                  <span
                    key={`${label}-${index}`}
                    className={
                      index === activeVisemeIndex
                        ? "voice-panel__token--active"
                        : undefined
                    }
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <ul className="voice-panel__steps">
        <li>1. Request Amazon Polly neural audio + viseme metadata.</li>
        <li>2. Convert viseme timeline to Vizij rig input paths.</li>
        <li>3. Blend visemes with orchestrator cues + expressions.</li>
      </ul>
    </div>
  );
}

const createVisemeTimeline = (
  visemes: VisemeData["visemes"],
  resolveSegmentPath: (segment: string) => string,
): VisemeTimelineEntry[] => {
  const entries: VisemeTimelineEntry[] = [];
  visemes.forEach((viseme) => {
    const resolved = mapPollyViseme(viseme.value);
    const start = Number(viseme.time);
    if (!resolved || !Number.isFinite(start)) {
      return;
    }
    const path = resolved.segment ? resolveSegmentPath(resolved.segment) : null;
    entries.push({
      start,
      end: start,
      transitionStart: start,
      path,
      displayLabel: resolved.label,
      isSilence: resolved.isSilence || path == null,
      sourceCode: resolved.sourceCode,
    });
  });

  if (entries.length === 0) {
    return entries;
  }

  entries.sort(
    (a, b) => a.start - b.start || a.sourceCode.localeCompare(b.sourceCode),
  );

  const lastStart = entries[entries.length - 1].start + RELEASE_TO_NEUTRAL_MS;
  entries.push({
    start: lastStart,
    end: lastStart + RELEASE_TO_NEUTRAL_MS,
    transitionStart: lastStart - MIN_VISEME_SPAN_MS,
    path: null,
    displayLabel: "rest",
    isSilence: true,
    sourceCode: "rest",
  });

  for (let i = 0; i < entries.length; i += 1) {
    const current = entries[i];
    const next = entries[i + 1];
    if (next) {
      current.end =
        next.start > current.start
          ? next.start
          : current.start + MIN_VISEME_SPAN_MS;
    } else {
      current.end = current.start + RELEASE_TO_NEUTRAL_MS;
    }
    if (current.end <= current.start) {
      current.end = current.start + MIN_VISEME_SPAN_MS;
    }
    const prevStart = i === 0 ? 0 : entries[i - 1].start;
    const gap = i === 0 ? current.start : current.start - prevStart;
    const ramp = clampMs(gap, MIN_VISEME_SPAN_MS, MAX_VISEME_SPAN_MS);
    current.transitionStart = current.start - ramp;
  }

  return entries;
};

const findVisemeIndex = (
  timeline: VisemeTimelineEntry[],
  timeMs: number,
): number => {
  for (let i = timeline.length - 1; i >= 0; i -= 1) {
    const entry = timeline[i];
    if (timeMs >= entry.start && timeMs < entry.end) {
      return i;
    }
  }
  return -1;
};
