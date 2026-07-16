import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnimatableValue } from "@vizij/utils";
import { useVizijStore, type World } from "@vizij/render";
import { useBindingAuthoring } from "../state/RigControllerProvider";
import { usePoseRigStore, NEUTRAL_POSE_ID } from "../poseRig/store";
import { PoseSnapshotService } from "../poseRig/services/poseSnapshotService";
import { resolveDeterministicPoseId } from "../poseRig/utils";
import { DEFAULT_NAMESPACE } from "../utils/constants";
import {
  indexRawChannels,
  sampleFrameToInputValues,
  sampleFrameToRenderWrites,
  summarizeClips,
  type AnimationClipLike,
  type Object3DLike,
  type RawChannelBinding,
  type RawClipSummary,
} from "./fbxFrameExtraction";

export interface FbxPoseExtractionApi {
  /** True when raw (FBX-derived) clips are present to extract from. */
  isAvailable: boolean;
  clips: RawClipSummary[];
  activeClipId: string | null;
  activeClip: RawClipSummary | null;
  time: number;
  /** True while the active clip is playing back in the viewport. */
  isPlaying: boolean;
  setActiveClip: (clipId: string) => void;
  /** Seek the active clip to `t` seconds and preview the frame in the viewport. */
  seek: (t: number) => void;
  /** Start/stop looped playback of the active clip in the viewport. */
  togglePlay: () => void;
  /** Capture the current frame as a pose in the pose-rig store. Returns the pose id. */
  captureFrame: (opts: {
    name: string;
    group?: string | null;
  }) => string | null;
  /** Number of channels in the active clip that map to a rig input. */
  channelCount: number;
  /** Active-clip channels that couldn't be mapped (bones, morph weights, …). */
  unmappedChannels: RawChannelBinding[];
}

export interface UseFbxPoseExtractionArgs {
  world: World;
  animatables: Record<string, AnimatableValue>;
  rawClips: AnimationClipLike[];
  scene: Object3DLike | null;
  /** Render namespace the viewport uses (defaults to the app default). */
  namespace?: string;
}

/**
 * Orchestrates scrub-and-capture pose extraction from raw FBX-derived clips.
 *
 * The renderer auto-generates a StandardInput per animatable component on load
 * (see `useRigController` `rebuildAutoInputs`), and those managed inputs carry a
 * `componentId` matching the `<animatableId>:<axis>` ids our sampler emits. So
 * capture needs no bespoke binding — it maps sampled components onto the
 * existing auto-inputs and reuses `PoseSnapshotService.capture` unchanged.
 */
export function useFbxPoseExtraction(
  args: UseFbxPoseExtractionArgs,
): FbxPoseExtractionApi {
  const { world, rawClips, scene, namespace = DEFAULT_NAMESPACE } = args;

  const setValues = useVizijStore((state) => state.setValues);
  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const neutralInputs = usePoseRigStore((state) => state.neutralInputs);
  const poses = usePoseRigStore((state) => state.poses);
  const addPose = usePoseRigStore((state) => state.addPose);
  const createPoseGroup = usePoseRigStore((state) => state.createPoseGroup);
  const addPoseToGroup = usePoseRigStore((state) => state.addPoseToGroup);

  const clips = useMemo(() => summarizeClips(rawClips), [rawClips]);
  const bindings = useMemo(
    () => indexRawChannels(rawClips, scene, world),
    [rawClips, scene, world],
  );

  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const timeRef = useRef(time);
  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  // Default the active clip to the first available one and reset when clips change.
  useEffect(() => {
    if (clips.length === 0) {
      if (activeClipId !== null) {
        setActiveClipId(null);
        setTime(0);
      }
      return;
    }
    if (!activeClipId || !clips.some((clip) => clip.id === activeClipId)) {
      setActiveClipId(clips[0]!.id);
      setTime(0);
    }
  }, [clips, activeClipId]);

  const activeClip = useMemo(
    () => clips.find((clip) => clip.id === activeClipId) ?? null,
    [clips, activeClipId],
  );

  const activeBindings = useMemo(
    () => bindings.filter((binding) => binding.clipId === activeClipId),
    [bindings, activeClipId],
  );
  const mappedChannelCount = useMemo(
    () => activeBindings.filter((binding) => binding.animatableId).length,
    [activeBindings],
  );
  const unmappedChannels = useMemo(
    () => activeBindings.filter((binding) => !binding.animatableId),
    [activeBindings],
  );

  // componentId (`<animatableId>:<axis>`) -> standard input id, from auto-inputs.
  const resolveInputId = useMemo(() => {
    const map = new Map<string, string>();
    managedStandardInputs.forEach((entry) => {
      const componentId = entry.metadata?.componentId;
      if (componentId) {
        map.set(componentId, entry.input.id);
      }
    });
    return (componentId: string): string | null => map.get(componentId) ?? null;
  }, [managedStandardInputs]);

  const seek = useCallback(
    (nextTime: number) => {
      // Manual scrubbing takes over from playback.
      setIsPlaying(false);
      const clamped = activeClip
        ? Math.max(0, Math.min(nextTime, activeClip.duration))
        : Math.max(0, nextTime);
      setTime(clamped);
      if (!activeClipId) {
        return;
      }
      const writes = sampleFrameToRenderWrites(
        bindings,
        activeClipId,
        clamped,
        namespace,
      );
      if (writes.length > 0) {
        setValues(writes);
      }
    },
    [activeClip, activeClipId, bindings, namespace, setValues],
  );

  const setActiveClip = useCallback(
    (clipId: string) => {
      setIsPlaying(false);
      setActiveClipId(clipId);
      setTime(0);
      const writes = sampleFrameToRenderWrites(bindings, clipId, 0, namespace);
      if (writes.length > 0) {
        setValues(writes);
      }
    },
    [bindings, namespace, setValues],
  );

  const togglePlay = useCallback(() => {
    if (!activeClipId || (activeClip?.duration ?? 0) <= 0) {
      return;
    }
    setIsPlaying((previous) => !previous);
  }, [activeClipId, activeClip]);

  // Playback loop: advance `time` each animation frame and preview it, looping
  // at the clip's duration. Runs only while `isPlaying`.
  useEffect(() => {
    if (!isPlaying || !activeClipId) {
      return;
    }
    const duration = activeClip?.duration ?? 0;
    if (duration <= 0) {
      return;
    }
    let raf = 0;
    let lastTs: number | null = null;
    const tick = (ts: number) => {
      if (lastTs === null) {
        lastTs = ts;
      }
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      let next = timeRef.current + dt;
      if (next >= duration) {
        next = next % duration;
      }
      timeRef.current = next;
      setTime(next);
      const writes = sampleFrameToRenderWrites(
        bindings,
        activeClipId,
        next,
        namespace,
      );
      if (writes.length > 0) {
        setValues(writes);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, activeClipId, activeClip, bindings, namespace, setValues]);

  // Stop playback if clips disappear (e.g. a new asset is loaded).
  useEffect(() => {
    if (clips.length === 0 && isPlaying) {
      setIsPlaying(false);
    }
  }, [clips, isPlaying]);

  const captureFrame = useCallback(
    ({
      name,
      group,
    }: {
      name: string;
      group?: string | null;
    }): string | null => {
      if (!activeClipId) {
        return null;
      }
      setIsPlaying(false);
      const sampledInputValues = sampleFrameToInputValues(
        bindings,
        activeClipId,
        time,
        resolveInputId,
      );
      const pose = PoseSnapshotService.capture(
        sampledInputValues,
        neutralInputs,
        {
          name,
          group: group ?? null,
        },
      );
      // Finalize the id against existing poses so repeated captures don't collide
      // and the returned id stays valid for later rename.
      const finalId = resolveDeterministicPoseId({
        existingIds: poses.map((entry) => entry.id),
        preferredId: pose.id,
        name: pose.name,
        group: pose.group,
        reservedIds: [NEUTRAL_POSE_ID],
      });
      addPose({ ...pose, id: finalId });
      if (group) {
        createPoseGroup(group);
        addPoseToGroup(finalId, group);
      }
      return finalId;
    },
    [
      activeClipId,
      addPose,
      addPoseToGroup,
      bindings,
      createPoseGroup,
      neutralInputs,
      poses,
      resolveInputId,
      time,
    ],
  );

  return {
    isAvailable: clips.length > 0,
    clips,
    activeClipId,
    activeClip,
    time,
    isPlaying,
    setActiveClip,
    seek,
    togglePlay,
    captureFrame,
    channelCount: mappedChannelCount,
    unmappedChannels,
  };
}
