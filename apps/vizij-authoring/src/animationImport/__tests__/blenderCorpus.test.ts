import path from "node:path";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCatalogFromRobotData,
  collectRobotDataElementNames,
  extractGltfAnimationChannels,
  resolveGltfAnimationChannels,
} from "..";
import {
  HUGO_RESOLVED,
  QUORI_RESOLVED,
  TOASTY_RESOLVED,
} from "./blenderCorpusGolden";
import { readGlbJson } from "./readGlbJson";

/**
 * Regression guard for the Blender GLB animation corpus.
 *
 * The three `*_Latest_Blender_Export.glb` assets are real Blender output
 * (per-Action animation mode, no `RobotData`). Their animation channels resolve
 * onto the propsrig inputs of the matching `*_Current.glb` face purely by name.
 *
 * Resolved paths are compared against committed golden values rather than
 * against a catalog rebuilt with the same helpers. That asymmetry is the point:
 * a symmetric comparison moves both sides together and can never fail when a
 * normalization rule changes.
 *
 * See docs/plans/GLB_ANIMATION_ROUNDTRIP_PLAN_2026-09-02.md.
 */

const ASSET_DIR = path.resolve(__dirname, "../../../public/assets");

interface CorpusCase {
  face: string;
  blenderExport: string;
  targetFace: string;
  /** glTF animations in the Blender export. */
  animations: number;
  /** Scalar curves those animations carry. */
  scalarChannels: number;
  /** Expected `<animationName>|<propsRigPath>` rows, in resolution order. */
  resolved: ReadonlyArray<string>;
}

const CORPUS: CorpusCase[] = [
  {
    face: "Quori",
    blenderExport: "Quori_Latest_Blender_Export.glb",
    targetFace: "Quori_Current.glb",
    animations: 13,
    scalarChannels: 37,
    resolved: QUORI_RESOLVED,
  },
  {
    face: "Hugo",
    blenderExport: "Hugo_Latest_Blender_Export.glb",
    targetFace: "Hugo_Current.glb",
    animations: 11,
    scalarChannels: 31,
    resolved: HUGO_RESOLVED,
  },
  {
    face: "Toasty",
    blenderExport: "Toasty_Latest_Blender_Export.glb",
    targetFace: "Toasty_Current.glb",
    animations: 3,
    scalarChannels: 8,
    resolved: TOASTY_RESOLVED,
  },
];

function assetPath(fileName: string): string {
  return path.join(ASSET_DIR, fileName);
}

const corpusAvailable = CORPUS.every(
  (entry) =>
    existsSync(assetPath(entry.blenderExport)) &&
    existsSync(assetPath(entry.targetFace)),
);

describe.runIf(corpusAvailable)("Blender GLB animation corpus", () => {
  describe.each(CORPUS)(
    "$face",
    ({ blenderExport, targetFace, animations, scalarChannels, resolved }) => {
      it("resolves every animated channel onto the expected propsrig input", () => {
        const source = readGlbJson(assetPath(blenderExport));
        const target = readGlbJson(assetPath(targetFace));

        const channels = extractGltfAnimationChannels(source);
        const catalog = buildCatalogFromRobotData(target);
        const result = resolveGltfAnimationChannels({ channels, catalog });

        expect(source.animations ?? []).toHaveLength(animations);
        // Every scalar is accounted for: nothing dropped silently.
        expect(result.resolved.length + result.unresolved.length).toBe(
          scalarChannels,
        );
        // Report which channels failed, not just that some did.
        expect(
          result.unresolved.map(
            (entry) =>
              `${entry.target.channel.nodeName}.${entry.target.channel.path}` +
              ` -> ${entry.attemptedPath ?? entry.reason}`,
          ),
        ).toEqual([]);
        // Compared against golden literals, not a symmetric rebuild.
        expect(
          result.resolved.map(
            (entry) =>
              `${entry.target.channel.animationName}|${entry.propsRigPath}`,
          ),
        ).toEqual([...resolved]);
      });

      it("carries no RobotData in the Blender export", () => {
        // The premise of name-mode resolution: Blender drops the extension, so
        // identity mode is unavailable and names are all we have.
        const source = readGlbJson(assetPath(blenderExport));
        const withRobotData = (source.nodes ?? []).filter((node) =>
          Boolean(
            (node as { extensions?: Record<string, unknown> } | null)
              ?.extensions?.RobotData,
          ),
        );
        expect(withRobotData).toHaveLength(0);
      });

      it("has no element-name normalization collisions in the target face", () => {
        // A collision would make `ensureUniquePath` suffixes load-bearing and
        // break the assumption that a path is a pure function of the name.
        const target = readGlbJson(assetPath(targetFace));
        const collisions = [...collectRobotDataElementNames(target)]
          .filter(([, names]) => names.size > 1)
          .map(([segment, names]) => `${segment}: ${[...names].join(", ")}`);
        expect(collisions).toEqual([]);
      });

      it("has uniquely named glTF nodes in the target face", () => {
        // Baking binds tracks by name via THREE.PropertyBinding.findNode, so
        // duplicate node names would make bake targets ambiguous.
        const target = readGlbJson(assetPath(targetFace));
        const names = (target.nodes ?? [])
          .map((node) => (typeof node?.name === "string" ? node.name : ""))
          .filter((name) => name.length > 0);
        const duplicates = [
          ...new Set(names.filter((name, i) => names.indexOf(name) !== i)),
        ];
        expect(duplicates).toEqual([]);
      });
    },
  );

  it("reassembles Quori's per-Action animations onto one shared timeline", () => {
    // Blender's default per-Action mode fragments one performance across many
    // animations. Their time ranges are disjoint sub-ranges of a single
    // timeline, which is why import must NOT shift each animation to zero.
    const source = readGlbJson(assetPath("Quori_Latest_Blender_Export.glb"));
    const channels = extractGltfAnimationChannels(source);

    const animationNames = new Set(channels.map((c) => c.animationName));
    expect(animationNames.size).toBe(13);

    // Every animation name follows Blender's auto-action naming, which is the
    // signal used to detect per-Action mode.
    for (const name of animationNames) {
      expect(name).toMatch(/Action(\.\d+)?$/);
    }

    // Per-object fragments: no animation covers more than two channels.
    const channelsPerAnimation = new Map<string, number>();
    for (const channel of channels) {
      channelsPerAnimation.set(
        channel.animationName,
        (channelsPerAnimation.get(channel.animationName) ?? 0) + 1,
      );
    }
    expect(Math.max(...channelsPerAnimation.values())).toBeLessThanOrEqual(2);
  });

  it("preserves CUBICSPLINE detection while the corpus is entirely LINEAR", () => {
    // Documents a coverage gap: cubic handling ships unexercised by real data.
    for (const entry of CORPUS) {
      const source = readGlbJson(assetPath(entry.blenderExport));
      const interpolations = new Set(
        extractGltfAnimationChannels(source).map(
          (channel) => channel.interpolation,
        ),
      );
      expect([...interpolations]).toEqual(["LINEAR"]);
    }
  });
});
