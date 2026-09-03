import type { GraphSpec } from "@vizij/node-graph";
import type { AnimationClipIR } from "../types/animationClipIr";
import {
  bakeClipToTrackSpecs,
  type BakeReport,
  type BakeSkippedChannel,
} from "./bakeClip";
import type { BakeTargetIndex } from "./bakeTargets";
import {
  decimateClip,
  DEFAULT_DECIMATE_TOLERANCE,
  type DecimateReport,
} from "./decimateClip";
import {
  describeBakeHazards,
  detectBakeHazards,
  type BakeHazard,
} from "./bakeHazards";
import {
  createDeviceGraphEvaluator,
  measurePropagationTicks,
} from "./graphEvaluatorDevice";
import {
  sampleClipThroughGraph,
  type GraphSampleReport,
} from "./sampleClipThroughGraph";
import {
  toThreeAnimationClip,
  type ThreeClipValidationIssue,
  type ThreeObject3DLike,
} from "./toThreeAnimationClip";

/**
 * The whole bake, from authored clips to `THREE.AnimationClip`s that
 * `exportScene` can hand to `GLTFExporter`.
 *
 * Sequenced as: sample the graph -> decimate -> recombine to glTF track
 * shapes -> validate bindings. Each stage has its own tests; this composes
 * them and keeps one report per clip so the export preflight can *name* what
 * did not survive rather than only counting it.
 */

export const DEFAULT_BAKE_FPS = 30;

export interface ClipBakeOutcome {
  clipId: string;
  clipName: string;
  sample: GraphSampleReport;
  decimate: DecimateReport;
  bake: BakeReport;
  bindingIssues: ThreeClipValidationIssue[];
  /** Null when nothing survived, so the clip is not exported at all. */
  clip: unknown;
}

export interface BakeAuthoredClipsReport {
  fps: number;
  tolerance: number;
  propagationTicks: number;
  outcomes: ClipBakeOutcome[];
  /**
   * Channels dropped across every clip, deduped and named.
   *
   * Material channels (colour, opacity, emissive) are the expected members:
   * they are drivable in Vizij and have no glTF animation channel at all, so
   * the bundle keeps them losslessly while the baked GLB cannot.
   */
  droppedChannels: BakeSkippedChannel[];
  /**
   * Nodes that make the bake approximate rather than exact — rate-dependent
   * or clock-driven. Reported so the preflight can say so, since the result
   * still looks like a clean bake.
   */
  hazards: BakeHazard[];
}

export interface BakeAuthoredClipsResult {
  /** `THREE.AnimationClip[]`, ready for `exportScene({ animations })`. */
  animations: unknown[];
  report: BakeAuthoredClipsReport;
}

/**
 * Bake every authored clip against `graphSources`.
 *
 * `graphSources` should be the specs actually being exported, so the baked
 * motion is produced by the same graph the bundle ships. Composing a
 * different set here would let the GLB and the bundle disagree about what the
 * face does.
 */
export async function bakeAuthoredClips(options: {
  clips: ReadonlyArray<AnimationClipIR>;
  /** Composed spec for the bake device, built from the exported specs. */
  spec: GraphSpec;
  /** Node channels to record — the graph's animatable outputs. */
  outputPaths: ReadonlyArray<string>;
  targets: BakeTargetIndex;
  /** The tree the clips will be exported against, for binding validation. */
  root: ThreeObject3DLike;
  fps?: number;
  tolerance?: number;
  /** Overrides the measured hop cost; measured when omitted. */
  propagationTicks?: number;
}): Promise<BakeAuthoredClipsResult> {
  const fps = options.fps ?? DEFAULT_BAKE_FPS;
  const tolerance = options.tolerance ?? DEFAULT_DECIMATE_TOLERANCE;

  const bakeable = options.clips.filter((clip) =>
    clip.tracks.some((track) => !track.detached && track.keyframes.length > 0),
  );

  if (bakeable.length === 0 || options.outputPaths.length === 0) {
    return {
      animations: [],
      report: {
        fps,
        tolerance,
        propagationTicks: 0,
        outcomes: [],
        droppedChannels: [],
        hazards: [],
      },
    };
  }

  // Measure the hop cost from a channel the graph actually drives, rather
  // than assuming it: it depends on how many sources the value crosses.
  let propagationTicks = options.propagationTicks;
  if (propagationTicks === undefined) {
    const probeInput = bakeable[0]!.tracks.find(
      (track) => !track.detached,
    )?.channel;
    const measured = probeInput
      ? await measurePropagationTicks({
          spec: options.spec,
          inputPath: probeInput,
          outputPath: options.outputPaths[0]!,
        })
      : null;
    propagationTicks = measured ?? 1;
  }

  const evaluator = await createDeviceGraphEvaluator({
    spec: options.spec,
    propagationTicks,
  });

  const animations: unknown[] = [];
  const outcomes: ClipBakeOutcome[] = [];
  const dropped = new Map<string, BakeSkippedChannel>();

  try {
    for (const authored of bakeable) {
      const sampled = sampleClipThroughGraph({
        clip: authored,
        evaluator,
        outputPaths: options.outputPaths,
        fps,
      });
      const decimated = decimateClip({ clip: sampled.clip, tolerance });
      const baked = bakeClipToTrackSpecs({
        clip: decimated.clip,
        targets: options.targets,
      });
      const built = toThreeAnimationClip({
        name: authored.name ?? authored.id,
        duration: decimated.clip.duration,
        tracks: baked.tracks,
        root: options.root,
      });

      for (const entry of baked.report.skipped) {
        if (!dropped.has(entry.channel)) {
          dropped.set(entry.channel, entry);
        }
      }

      if (built.clip) {
        animations.push(built.clip);
      }
      outcomes.push({
        clipId: authored.id,
        clipName: authored.name ?? authored.id,
        sample: sampled.report,
        decimate: decimated.report,
        bake: baked.report,
        bindingIssues: built.issues,
        clip: built.clip,
      });
    }
  } finally {
    evaluator.dispose();
  }

  return {
    animations,
    report: {
      fps,
      tolerance,
      propagationTicks,
      outcomes,
      droppedChannels: [...dropped.values()],
      hazards: detectBakeHazards(options.spec),
    },
  };
}

/** One-line-per-clip preflight summary, naming what did not survive. */
export function summarizeBakeReport(report: BakeAuthoredClipsReport): string[] {
  const lines: string[] = [];
  for (const outcome of report.outcomes) {
    const kept = outcome.decimate.keyframesAfter;
    const before = outcome.decimate.keyframesBefore;
    lines.push(
      `${outcome.clipName}: ${outcome.bake.bakedChannels.length} channels, ` +
        `${kept} keyframes (from ${before} sampled at ${report.fps}fps)`,
    );
    for (const warning of outcome.sample.warnings) {
      if (warning.kind === "graph-tick-failed") {
        lines.push(
          `  graph evaluation failed at frame ${warning.frame}: ${warning.message}`,
        );
      }
    }
    for (const issue of outcome.bindingIssues) {
      lines.push(`  dropped track ${issue.trackName} (${issue.reason})`);
    }
  }
  lines.push(...describeBakeHazards(report.hazards, report.fps));
  if (report.droppedChannels.length > 0) {
    lines.push("Channels with no glTF equivalent:");
    for (const entry of report.droppedChannels) {
      lines.push(`  ${entry.channel} (${entry.reason})`);
    }
  }
  return lines;
}
