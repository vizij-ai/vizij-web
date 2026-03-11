import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PoseDefinition,
  PoseGroupDefinition,
} from "@vizij/runtime-react";
import type { PollyVoice } from "../data/pollyVoices";
import type { VisemeData } from "../types/polly";
import { fetchVisemeData } from "../services/pollyApi";
import { FACE_VISEME_SEGMENT_LIST, mapPollyViseme } from "../lib/visemeMapping";
import {
  resolvePoseMembership,
  buildPoseWeightInputPathSegment,
  buildRigInputPath,
  POSE_WEIGHT_INPUT_PATH_PREFIX,
} from "../lib/poseUtils";

export type SpeechStatus = "idle" | "preparing" | "speaking";

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

export type SelectOption = {
  value: string;
  label: string;
};

const DEFAULT_SCRIPT =
  "With Vizij your avatar mirrors every beat of the conversation.";
const MIN_VISEME_SPAN_MS = 45;
const MAX_VISEME_SPAN_MS = 320;
const RELEASE_TO_NEUTRAL_MS = 120;

const clampMs = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export interface UseSpeechPlaybackOptions {
  faceId: string;
  poses: PoseDefinition[];
  poseGroups?: PoseGroupDefinition[];
  stageRuntimeInput: ((graphPath: string, value: number) => void) | undefined;
  animateRuntimeValue:
    | ((graphPath: string, value: number, duration: number) => void)
    | undefined;
  runtimeReady: boolean;
  speakingInputPath?: string;
  /** TTS API base URL */
  apiBaseUrl: string;
}

export interface UseSpeechPlaybackReturn {
  status: SpeechStatus;
  script: string;
  setScript: (value: string) => void;
  selectedVoice: PollyVoice;
  setSelectedVoice: (voice: PollyVoice) => void;
  error: string | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  handleSpeak: (textOverride?: string) => Promise<void>;
  handleStop: () => void;
  handleAudioPlay: () => void;
  handleAudioPause: () => void;
  handleAudioEnded: () => void;
  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void;
  groupOptions: SelectOption[];
}

export function useSpeechPlayback({
  faceId,
  poses,
  poseGroups,
  stageRuntimeInput,
  animateRuntimeValue,
  runtimeReady,
  speakingInputPath,
  apiBaseUrl,
}: UseSpeechPlaybackOptions): UseSpeechPlaybackReturn {
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [selectedVoice, setSelectedVoice] = useState<PollyVoice>("Ruth");
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const autoplayRef = useRef(false);
  const speakingInputPathRef = useRef(speakingInputPath);
  const faceIdRef = useRef(faceId);
  useEffect(() => {
    speakingInputPathRef.current = speakingInputPath;
  }, [speakingInputPath]);
  useEffect(() => {
    faceIdRef.current = faceId;
  }, [faceId]);
  const visemeTimelineRef = useRef<VisemeTimelineEntry[]>([]);
  const visemePathsRef = useRef<Set<string>>(new Set());
  const lastVisemePathRef = useRef<string | null>(null);
  const transitionCursorRef = useRef(0);
  const speechCacheRef = useRef<Map<string, CachedSpeech>>(new Map());
  const audioSrcRef = useRef<string | null>(null);

  const groupOptions = useMemo((): SelectOption[] => {
    if (!poseGroups || poseGroups.length === 0) {
      return [];
    }
    return poseGroups.map((g) => ({
      value: g.id,
      label: g.path || g.name || g.id,
    }));
  }, [poseGroups]);

  const defaultGroupId = useMemo((): string | null => {
    if (!poseGroups || poseGroups.length === 0) {
      return null;
    }
    const visemeGroup = poseGroups.find(
      (g) =>
        g.path?.toLowerCase().includes("viseme") ||
        g.name?.toLowerCase().includes("viseme"),
    );
    return visemeGroup ? visemeGroup.id : poseGroups[0].id;
  }, [poseGroups]);

  const effectiveGroupId = useMemo(() => {
    if (
      selectedGroupId !== null &&
      groupOptions.some((o) => o.value === selectedGroupId)
    ) {
      return selectedGroupId;
    }
    return defaultGroupId;
  }, [selectedGroupId, defaultGroupId, groupOptions]);

  const filteredPoses = useMemo(() => {
    if (effectiveGroupId === null || !poseGroups || poseGroups.length === 0) {
      return poses;
    }
    return poses.filter((pose) => {
      const membership = resolvePoseMembership(pose, poseGroups);
      return membership.groupIds.includes(effectiveGroupId);
    });
  }, [poses, poseGroups, effectiveGroupId]);

  const poseWeightPaths = useMemo(() => {
    const faceSegment = faceId?.trim() || "face";
    const map = new Map<string, string>();
    filteredPoses.forEach((pose) => {
      const segment = buildPoseWeightInputPathSegment(pose.id);
      const relativePath = `${POSE_WEIGHT_INPUT_PATH_PREFIX}${segment}.weight`;
      map.set(pose.id, buildRigInputPath(faceSegment, relativePath));
    });
    return map;
  }, [filteredPoses, faceId]);

  const resolveSegmentPath = useCallback(
    (segment: string): string | null => {
      return (
        poseWeightPaths.get(segment) ??
        poseWeightPaths.get(`pose_${segment}`) ??
        null
      );
    },
    [poseWeightPaths],
  );

  const defaultVisemePaths = useMemo(() => {
    const paths: string[] = [];
    FACE_VISEME_SEGMENT_LIST.forEach((segment) => {
      const path = resolveSegmentPath(segment);
      if (path) {
        paths.push(path);
      }
    });
    return paths;
  }, [resolveSegmentPath]);

  useEffect(() => {
    visemePathsRef.current = new Set(defaultVisemePaths);
  }, [defaultVisemePaths]);

  const triggerVisemeEntry = useCallback(
    (index: number, timeMs: number) => {
      const timeline = visemeTimelineRef.current;
      const entry = timeline[index];
      if (!entry || !runtimeReady) return;
      const animate = animateRuntimeValue;
      const stage = stageRuntimeInput;
      if (!animate && !stage) return;

      const prevPath = lastVisemePathRef.current;
      const remainingMs = entry.start - timeMs;
      const durationMs = clampMs(
        remainingMs > 0 ? remainingMs : MIN_VISEME_SPAN_MS,
        MIN_VISEME_SPAN_MS,
        MAX_VISEME_SPAN_MS,
      );
      const durationSec = durationMs / 250;

      if (prevPath && prevPath !== entry.path) {
        if (animate) animate(prevPath, 0, durationSec);
        else stage!(prevPath, 0);
      } else if (!entry.path && prevPath) {
        if (animate) animate(prevPath, 0, durationSec);
        else stage!(prevPath, 0);
      }

      if (entry.path && prevPath !== entry.path) {
        if (animate) animate(entry.path, 1, durationSec);
        else stage!(entry.path, 1);
      }
      lastVisemePathRef.current = entry.path;
    },
    [animateRuntimeValue, runtimeReady, stageRuntimeInput],
  );

  const triggerTransitionsUpToTime = useCallback(
    (timeMs: number) => {
      if (!runtimeReady) return;
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
    [runtimeReady, triggerVisemeEntry],
  );

  const stopRAF = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const clearVisemeInputs = useCallback(() => {
    if (!runtimeReady || !stageRuntimeInput) {
      lastVisemePathRef.current = null;
      return;
    }
    visemePathsRef.current.forEach((path) => stageRuntimeInput(path, 0));
    lastVisemePathRef.current = null;
  }, [runtimeReady, stageRuntimeInput]);

  const revokeAudioSrc = useCallback(() => {
    if (audioSrcRef.current) {
      URL.revokeObjectURL(audioSrcRef.current);
      audioSrcRef.current = null;
    }
  }, []);

  const resetVisemeState = useCallback(() => {
    visemeTimelineRef.current = [];
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
      if (speakingInputPathRef.current && stageRuntimeInput && runtimeReady) {
        stageRuntimeInput(
          buildRigInputPath(
            faceIdRef.current?.trim() || "face",
            speakingInputPathRef.current,
          ),
          0,
        );
      }
      resetVisemeState();
      revokeAudioSrc();
      autoplayRef.current = false;
      if (resetStatus) {
        setStatus("idle");
      }
    },
    [
      clearVisemeInputs,
      resetVisemeState,
      revokeAudioSrc,
      stopRAF,
      stageRuntimeInput,
      runtimeReady,
    ],
  );

  useEffect(() => () => stopPlayback(false), [stopPlayback]);

  const syncFromAudio = useCallback(() => {
    if (!audioRef.current) {
      rafRef.current = requestAnimationFrame(syncFromAudio);
      return;
    }
    const timeMs = audioRef.current.currentTime * 1000;
    triggerTransitionsUpToTime(timeMs);
    rafRef.current = requestAnimationFrame(syncFromAudio);
  }, [triggerTransitionsUpToTime]);

  const startRAF = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(syncFromAudio);
  }, [syncFromAudio]);

  const updateTimeline = useCallback(
    (visemes: VisemeData["visemes"]) => {
      const timeline = createVisemeTimeline(visemes, resolveSegmentPath);
      visemeTimelineRef.current = timeline;
      const merged = new Set(defaultVisemePaths);
      timeline.forEach((entry) => {
        if (entry.path) merged.add(entry.path);
      });
      visemePathsRef.current = merged;
      transitionCursorRef.current = 0;
      lastVisemePathRef.current = null;
      if (timeline.length > 0) {
        triggerTransitionsUpToTime(0);
      }
    },
    [defaultVisemePaths, resolveSegmentPath, triggerTransitionsUpToTime],
  );

  const handleSpeak = useCallback(
    async (textOverride?: string) => {
      if (!runtimeReady || isLoading) return;
      const trimmed = (textOverride ?? script).trim();
      if (!trimmed) {
        setError("Please enter something to speak.");
        return;
      }
      const cacheKey = `${selectedVoice}::${trimmed}`;
      setError(null);
      stopPlayback(false);
      setStatus("preparing");
      setIsLoading(true);
      console.log(`[speech-playback] handleSpeak voice=${selectedVoice} text="${trimmed.slice(0, 60)}..." apiBaseUrl=${apiBaseUrl}`);

      const cached = speechCacheRef.current.get(cacheKey);
      if (cached) {
        console.log("[speech-playback] Using cached speech, visemes:", cached.visemeData.visemes.length);
        const audioUrl = URL.createObjectURL(cached.audioBlob);
        audioSrcRef.current = audioUrl;
        updateTimeline(cached.visemeData.visemes);
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.currentTime = 0;
          autoplayRef.current = true;
          audioRef.current.play().catch((e) => {
            console.error("[speech-playback] Cached audio play failed:", e);
            setStatus("idle");
          });
        }
        setIsLoading(false);
        return;
      }

      try {
        console.log("[speech-playback] Fetching TTS from API...");
        const { visemeData, audioBlob } = await fetchVisemeData(
          trimmed,
          selectedVoice,
          apiBaseUrl,
        );
        console.log(`[speech-playback] TTS response: ${visemeData.visemes.length} visemes, audio ${audioBlob.size} bytes`);
        speechCacheRef.current.set(cacheKey, { visemeData, audioBlob });
        const audioUrl = URL.createObjectURL(audioBlob);
        audioSrcRef.current = audioUrl;
        updateTimeline(visemeData.visemes);
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.currentTime = 0;
          autoplayRef.current = true;
          audioRef.current.play().catch((e) => {
            console.error("[speech-playback] Audio play failed:", e);
            setStatus("idle");
          });
        }
      } catch (err) {
        console.error("[speech-playback] TTS fetch error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch speech data.",
        );
        setStatus("idle");
      } finally {
        setIsLoading(false);
      }
    },
    [
      apiBaseUrl,
      isLoading,
      runtimeReady,
      script,
      selectedVoice,
      stopPlayback,
      updateTimeline,
    ],
  );

  const handleStop = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  const handleAudioPlay = useCallback(() => {
    console.log("[speech-playback] Audio playing, timeline entries:", visemeTimelineRef.current.length);
    startRAF();
    setStatus("speaking");
    if (speakingInputPathRef.current && stageRuntimeInput && runtimeReady) {
      stageRuntimeInput(
        buildRigInputPath(
          faceIdRef.current?.trim() || "face",
          speakingInputPathRef.current,
        ),
        1,
      );
    }
  }, [startRAF, stageRuntimeInput, runtimeReady]);

  const handleAudioPause = useCallback(() => {
    stopRAF();
  }, [stopRAF]);

  const handleAudioEnded = useCallback(() => {
    console.log("[speech-playback] Audio ended");
    stopPlayback();
  }, [stopPlayback]);

  return {
    status,
    script,
    setScript,
    selectedVoice,
    setSelectedVoice,
    error,
    audioRef,
    handleSpeak,
    handleStop,
    handleAudioPlay,
    handleAudioPause,
    handleAudioEnded,
    selectedGroupId: effectiveGroupId,
    setSelectedGroupId,
    groupOptions,
  };
}

const createVisemeTimeline = (
  visemes: VisemeData["visemes"],
  resolveSegmentPath: (segment: string) => string | null,
): VisemeTimelineEntry[] => {
  const entries: VisemeTimelineEntry[] = [];
  visemes.forEach((viseme) => {
    const resolved = mapPollyViseme(viseme.value);
    const start = Number(viseme.time);
    if (!resolved || !Number.isFinite(start)) return;
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

  if (entries.length === 0) return entries;

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
