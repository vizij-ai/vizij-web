import type { GraphSpec } from "@vizij/node-graph";
import {
  createExportAnimation,
  type ExportAnimationIssue,
  type ExportAnimationRoot,
} from "@vizij/render";
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
import type { SampledOutputSpec } from "./bakeChannelIndex";
import { inputPathsOfSpec } from "./bakeGraphSources";
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

/**
 * The whole bake, from authored clips to the animations `exportScene` writes
 * into the GLB.
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
  bindingIssues: ExportAnimationIssue[];
  /** Null when nothing survived, so the clip is not exported at all. */
  clip: unknown;
}

export type ClipSkipReason = "no-keyframes" | "all-tracks-detached";

export interface SkippedClip {
  clipId: string;
  clipName: string;
  reason: ClipSkipReason;
}

export interface BakeAuthoredClipsReport {
  fps: number;
  tolerance: number;
  propagationTicks: number;
  outcomes: ClipBakeOutcome[];
  /** Clip ids handed to the bake, so a missing clip is traceable. */
  consideredClipIds: string[];
  /**
   * Clips dropped before sampling. Reported by name: a clip silently absent
   * from the exported GLB is indistinguishable from a bake that failed.
   */
  skippedClips: SkippedClip[];
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
  /** `createExportAnimation`'s animations, for `exportScene({ animations })`. */
  animations: unknown[];
  report: BakeAuthoredClipsReport;
}

/**
 * Bake every authored clip through `spec`.
 *
 * `spec` is the exported bundle's graph as the face composes it
 * (`composeBakeGraph`), so the baked motion is produced by the graph the
 * face runs. Composing a different graph here would let the GLB and the
 * bundle disagree about what the face does.
 */
export async function bakeAuthoredClips(options: {
  clips: ReadonlyArray<AnimationClipIR>;
  /** The graph the bake device steps: `composeBakeGraph` of the bundle. */
  spec: GraphSpec;
  /**
   * What to record: the store paths the graph writes and each component's
   * canonical channel name. Built by `buildBakeChannelIndex` from the world,
   * restricted to the paths the exported graph declares.
   */
  outputs: ReadonlyArray<SampledOutputSpec>;
  /**
   * Each track channel -> the store key it drives on the exported face
   * (`bakeChannelKeys`): the key the face plays the track on. A channel is a
   * rig-relative path or an input's id, not a graph input path, so staging
   * it raw would write a key nothing reads.
   */
  channelKeys: ReadonlyMap<string, string>;
  targets: BakeTargetIndex;
  /** The tree the clips will be exported against, for binding validation. */
  root: ExportAnimationRoot;
  fps?: number;
  tolerance?: number;
  /** Overrides the measured hop cost; measured when omitted. */
  propagationTicks?: number;
}): Promise<BakeAuthoredClipsResult> {
  const fps = options.fps ?? DEFAULT_BAKE_FPS;
  const tolerance = options.tolerance ?? DEFAULT_DECIMATE_TOLERANCE;

  const bakeable: AnimationClipIR[] = [];
  const skippedClips: SkippedClip[] = [];
  for (const clip of options.clips) {
    const live = clip.tracks.filter((track) => !track.detached);
    if (live.some((track) => track.keyframes.length > 0)) {
      bakeable.push(clip);
      continue;
    }
    skippedClips.push({
      clipId: clip.id,
      clipName: clip.name ?? clip.id,
      reason:
        live.length === 0 && clip.tracks.length > 0
          ? "all-tracks-detached"
          : "no-keyframes",
    });
  }
  const consideredClipIds = options.clips.map((clip) => clip.id);

  if (bakeable.length === 0 || options.outputs.length === 0) {
    return {
      animations: [],
      report: {
        fps,
        tolerance,
        propagationTicks: 0,
        outcomes: [],
        consideredClipIds,
        skippedClips,
        droppedChannels: [],
        hazards: [],
      },
    };
  }

  // A track drives the key the face plays it on, where the graph declares
  // that key as an input. A channel whose key the graph does not read cannot
  // drive anything, and is reported by the sampler rather than staged into
  // the void.
  const declaredInputPaths = new Set(inputPathsOfSpec(options.spec));
  const resolveInputPath = (track: { channel: string }) => {
    const key = options.channelKeys.get(track.channel);
    return key && declaredInputPaths.has(key) ? key : null;
  };

  // Measure the hop cost from a channel the graph actually drives, rather
  // than assuming it: it depends on how many sources the value crosses.

  let propagationTicks = options.propagationTicks;
  if (propagationTicks === undefined) {
    const probeTrack = bakeable[0]!.tracks.find((track) => !track.detached);
    const probeInput = probeTrack ? resolveInputPath(probeTrack) : null;
    const measured = probeInput
      ? await measurePropagationTicks({
          spec: options.spec,
          inputPath: probeInput,
          outputPath: options.outputs[0]!.path,
        })
      : null;
    propagationTicks = measured ?? 1;
  }

  const animations: unknown[] = [];
  const outcomes: ClipBakeOutcome[] = [];
  const dropped = new Map<string, BakeSkippedChannel>();

  for (const authored of bakeable) {
    // One evaluator per clip. The graph carries state across ticks — that is
    // the whole reason the sampler steps a fixed grid rather than jumping to
    // each frame — so a shared evaluator would start each clip from the
    // previous clip's slew/spring/oscillator state at an already-advanced
    // clock. Baking [A, B] would then produce a different B than baking [B],
    // making the output depend on clip order.
    const evaluator = await createDeviceGraphEvaluator({
      spec: options.spec,
      propagationTicks,
    });

    try {
      const sampled = await sampleClipThroughGraph({
        clip: authored,
        evaluator,
        outputs: options.outputs,
        fps,
        resolveInputPath,
      });
      const decimated = decimateClip({ clip: sampled.clip, tolerance });
      const baked = await bakeClipToTrackSpecs({
        clip: decimated.clip,
        targets: options.targets,
      });
      const built = createExportAnimation({
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

      if (built.animation) {
        animations.push(built.animation);
      }
      outcomes.push({
        clipId: authored.id,
        clipName: authored.name ?? authored.id,
        sample: sampled.report,
        decimate: decimated.report,
        bake: baked.report,
        bindingIssues: built.issues,
        clip: built.animation,
      });
    } finally {
      evaluator.dispose();
    }
  }

  return {
    animations,
    report: {
      fps,
      tolerance,
      propagationTicks,
      outcomes,
      consideredClipIds,
      skippedClips,
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
      if (warning.kind === "input-unresolved") {
        lines.push(
          `  ${warning.channels.length} channel(s) the graph does not drive: ` +
            warning.channels.slice(0, 8).join(", ") +
            (warning.channels.length > 8 ? ", …" : ""),
        );
      }
      if (warning.kind === "no-input-tracks") {
        lines.push("  no track in this clip drives anything in the graph");
      }
    }
    if (outcome.bake.bakedChannels.length === 0) {
      lines.push("  nothing baked, so this clip is not in the exported GLB");
    }
    for (const issue of outcome.bindingIssues) {
      lines.push(`  dropped track ${issue.trackName} (${issue.reason})`);
    }
  }
  lines.push(...describeBakeHazards(report.hazards, report.fps));
  for (const skipped of report.skippedClips) {
    lines.push(`${skipped.clipName}: skipped (${skipped.reason})`);
  }
  if (report.droppedChannels.length > 0) {
    lines.push("Channels with no glTF equivalent:");
    for (const entry of report.droppedChannels) {
      lines.push(`  ${entry.channel} (${entry.reason})`);
    }
  }
  return lines;
}
