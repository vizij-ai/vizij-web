import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  type AnimationClipIR,
  type AnimationTrackIR,
} from "../types/animationClipIr";
import { sampleTrackAt } from "./sampleTrack";

/**
 * Baking authored clips is not a track-reformatting problem.
 *
 * Real authored clips drive *abstract rig inputs* and *pose weights* —
 * `lids_blink`, `gaze/left_right`, `poses/pose_d_concerned_d.weight` — not
 * `/propsrig/...` node channels. The path from an input to a node transform
 * runs through the rig and pose graphs at runtime, and glTF cannot express
 * "this input feeds a graph that computes node transforms". So baking has to
 * *evaluate the graph over time* and record what it writes, the way a DCC
 * bakes a rig down to raw transforms.
 *
 * This module is the evaluation loop, expressed against a narrow port so the
 * loop itself is testable without booting wasm. The device adapter is in
 * `graphEvaluatorDevice.ts`.
 *
 * The output is an `AnimationClipIR` whose tracks are node channels, which is
 * exactly what `bakeClipToTrackSpecs` already consumes — so sampling composes
 * in front of the existing bake path rather than replacing any of it.
 */

/** The evaluation primitives sampling needs. */
export interface GraphEvaluator {
  /** Stage a rig input for the next step. */
  stageInput(path: string, value: number): void;
  /** Advance the graph by `dtMs` and evaluate. */
  step(dtMs: number): void;
  /** Read the current value at each path; `null` when unset or non-numeric. */
  readOutputs(paths: ReadonlyArray<string>): ReadonlyMap<string, number | null>;
  /**
   * Set when the last tick failed. A failing tick stops *every* node, so a
   * sampler that ignores this records a whole clip of stale values.
   */
  readonly behaviorError?: string | undefined;
}

export type GraphSampleWarning =
  | { kind: "graph-tick-failed"; frame: number; message: string }
  | { kind: "output-never-written"; paths: string[] }
  | { kind: "no-input-tracks" };

export interface GraphSampleReport {
  fps: number;
  frameCount: number;
  duration: number;
  /** Rig input paths that were driven, from the clip's tracks. */
  drivenInputs: string[];
  /** Node channels that changed over the clip and became tracks. */
  sampledChannels: string[];
  /**
   * Node channels the graph wrote but never varied. Dropped, because a
   * constant channel is what the rest pose already says — emitting it would
   * pin the node and override any other clip that does animate it.
   */
  constantChannels: string[];
  warnings: GraphSampleWarning[];
}

export interface GraphSampleResult {
  clip: AnimationClipIR;
  report: GraphSampleReport;
}

/** Values that differ by less than this are treated as the same value. */
const CONSTANT_EPSILON = 1e-6;

/**
 * Drive `clip`'s tracks into the graph frame by frame and record every
 * animatable output, returning a node-channel clip.
 *
 * Time advances by a fixed `1/fps` step from zero rather than by seeking.
 * Seeking would be cheaper, but any graph node with memory (a slew limiter,
 * a filter, an integrator) depends on the sequence of steps it has seen, so a
 * seeking sampler silently bakes a different animation than the one that
 * plays. Fixed stepping reproduces playback; it does not make a stateful
 * graph rate-independent, which is why `detectStatefulNodes` exists.
 */
export function sampleClipThroughGraph(options: {
  clip: AnimationClipIR;
  evaluator: GraphEvaluator;
  /** Node channels to record — the graph's animatable outputs. */
  outputPaths: ReadonlyArray<string>;
  fps: number;
  /** Maps a clip track to the rig input path it drives. */
  resolveInputPath?: (track: AnimationTrackIR) => string | null;
}): GraphSampleResult {
  const { clip, evaluator, outputPaths, fps } = options;
  const resolveInputPath =
    options.resolveInputPath ?? ((track: AnimationTrackIR) => track.channel);

  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`sampleClipThroughGraph: fps must be positive, got ${fps}`);
  }

  const warnings: GraphSampleWarning[] = [];
  const driven: Array<{ path: string; track: AnimationTrackIR }> = [];
  for (const track of clip.tracks) {
    if (track.detached) {
      continue;
    }
    const path = resolveInputPath(track);
    if (path) {
      driven.push({ path, track });
    }
  }
  if (driven.length === 0) {
    warnings.push({ kind: "no-input-tracks" });
  }

  // `AnimationClipIR` times are SECONDS (the importer passes glTF seconds
  // through unchanged, and `bakeClip` hands them to three.js as seconds).
  // The evaluator's `step` takes milliseconds, like the device's.
  const dtMs = 1000 / fps;
  const duration = Math.max(0, clip.duration);
  // Inclusive of the final frame: a clip ending on a key must bake that key,
  // or the last pose is dropped.
  const frameCount = Math.max(1, Math.round(duration * fps) + 1);

  const paths = [...new Set(outputPaths)];
  const series = new Map<string, number[]>();
  const everWritten = new Set<string>();
  for (const path of paths) {
    series.set(path, []);
  }

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = Math.min(duration, frame / fps);
    for (const entry of driven) {
      evaluator.stageInput(entry.path, sampleTrackAt(entry.track, time));
    }
    evaluator.step(frame === 0 ? 0 : dtMs);

    if (evaluator.behaviorError) {
      warnings.push({
        kind: "graph-tick-failed",
        frame,
        message: evaluator.behaviorError,
      });
      break;
    }

    const observed = evaluator.readOutputs(paths);
    for (const path of paths) {
      const value = observed.get(path) ?? null;
      const track = series.get(path)!;
      if (value === null) {
        // Carry the previous value rather than injecting a zero: an output
        // the graph has not written yet is unknown, not zero, and a zero
        // here would bake a jump to origin on frame 0.
        track.push(track.length > 0 ? track[track.length - 1]! : 0);
        continue;
      }
      everWritten.add(path);
      track.push(value);
    }
  }

  const sampledChannels: string[] = [];
  const constantChannels: string[] = [];
  const tracks: AnimationTrackIR[] = [];

  for (const path of paths) {
    if (!everWritten.has(path)) {
      continue;
    }
    const values = series.get(path)!;
    const first = values[0] ?? 0;
    const varies = values.some(
      (value) => Math.abs(value - first) > CONSTANT_EPSILON,
    );
    if (!varies) {
      constantChannels.push(path);
      continue;
    }
    sampledChannels.push(path);
    tracks.push({
      id: `sampled:${path}`,
      variableId: path,
      channel: path,
      interpolation: "linear",
      keyframes: values.map((value, frame) => ({
        id: `sampled:${path}:${frame}`,
        time: Math.min(duration, frame / fps),
        value,
      })),
    });
  }

  const never = paths.filter((path) => !everWritten.has(path));
  if (never.length > 0) {
    warnings.push({ kind: "output-never-written", paths: never });
  }

  return {
    clip: {
      schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
      id: `${clip.id}::sampled`,
      name: clip.name,
      duration,
      tracks,
      metadata: {
        ...(clip.metadata ?? {}),
        bake: { sourceClipId: clip.id, fps, frameCount },
      },
    },
    report: {
      fps,
      frameCount,
      duration,
      drivenInputs: driven.map((entry) => entry.path),
      sampledChannels,
      constantChannels,
      warnings,
    },
  };
}
