import { describe, expect, it } from "vitest";
import {
  buildImportedBundleAnimationTargets,
  buildImportedBundleProgramTargets,
  filterImportedBundleProgramEntries,
  isImportedBundleAnimationTargetId,
  isImportedBundleProgramTargetId,
  parseImportedBundleAnimationTargetIndex,
  parseImportedBundleProgramTargetIndex,
  resolveImportedBundleAnimationBaseClip,
  resolveImportedBundleAnimationClip,
  resolveImportedBundleAnimationEntry,
  resolveImportedBundleProgramBaseSnapshot,
  resolveImportedBundleProgramEntry,
  resolveImportedBundleProgramSnapshot,
} from "../utils/importedBundleTargets";
import type {
  VizijBundleAnimationEntry,
  VizijBundleGraphEntry,
} from "../types";
import type { AnimationClipIR } from "../types/animationClipIr";

function animationEntry(
  id: string,
  name: string | undefined,
): VizijBundleAnimationEntry {
  return {
    id,
    clip: {
      id,
      name,
      duration: 2,
      tracks: [
        {
          channel: "controls/jaw/open",
          interpolation: "linear",
          keyframes: [
            {
              time: 0,
              value: 0,
            },
            {
              time: 1,
              value: 1,
            },
          ],
        },
      ],
    },
  };
}

function graphEntry(
  id: string,
  label: string | undefined,
  kind = "motiongraph",
): VizijBundleGraphEntry {
  return {
    id,
    kind,
    label,
    spec: {
      nodes: [
        {
          id: "input-1",
          type: "input",
          params: {
            path: "rig/face/standard/smile",
          },
        },
        {
          id: "output-1",
          type: "output",
          params: {
            path: "rig/face/standard/jaw/open",
          },
        },
      ],
      edges: [
        {
          from: {
            node_id: "input-1",
            output: "out",
          },
          to: {
            node_id: "output-1",
            input: "in",
          },
        },
      ],
    },
  };
}

describe("imported bundle target helpers", () => {
  it("builds animation target labels from bundle entries, overrides, and hidden state", () => {
    const entries = [
      animationEntry("bundle.clip.one", "Blink"),
      animationEntry("bundle.clip.two", undefined),
    ];

    expect(
      buildImportedBundleAnimationTargets({
        bundleSessionKey: "face:session",
        entries,
        nameOverrides: {
          "bundle-animation:face:session:1": "Renamed Import",
        },
        hiddenTargetIds: {
          "bundle-animation:face:session:0": true,
        },
      }),
    ).toEqual([
      {
        value: "bundle-animation:face:session:1",
        label: "Renamed Import",
      },
    ]);
  });

  it("builds program target labels from filtered motion graph entries", () => {
    const entries = filterImportedBundleProgramEntries([
      graphEntry("pose-graph", "Pose", "pose"),
      graphEntry("program.one", "Program One"),
      graphEntry("program.two", undefined),
    ]);

    expect(
      buildImportedBundleProgramTargets({
        bundleSessionKey: "face-1",
        entries,
        hiddenTargetIds: {
          "bundle-procedural:face-1:0": true,
        },
      }),
    ).toEqual([
      {
        value: "bundle-procedural:face-1:1",
        label: "program.two",
      },
    ]);
  });

  it("parses target ids and resolves entries by the trailing imported index", () => {
    const animationEntries = [
      animationEntry("bundle.clip.one", "Blink"),
      animationEntry("bundle.clip.two", "Smile"),
    ];
    const programEntries = [
      graphEntry("program.one", "Program One"),
      graphEntry("program.two", "Program Two"),
    ];

    expect(
      isImportedBundleAnimationTargetId("bundle-animation:face:session:1"),
    ).toBe(true);
    expect(isImportedBundleProgramTargetId("bundle-procedural:face:1")).toBe(
      true,
    );
    expect(
      parseImportedBundleAnimationTargetIndex(
        "bundle-animation:face:session:1",
      ),
    ).toBe(1);
    expect(
      parseImportedBundleProgramTargetIndex("bundle-procedural:face:session:0"),
    ).toBe(0);
    expect(
      resolveImportedBundleAnimationEntry({
        targetId: "bundle-animation:face:session:1",
        entries: animationEntries,
      })?.id,
    ).toBe("bundle.clip.two");
    expect(
      resolveImportedBundleProgramEntry({
        targetId: "bundle-procedural:face:session:0",
        entries: programEntries,
      })?.id,
    ).toBe("program.one");
  });

  it("resolves animation clips with base metadata and editor overrides", () => {
    const entries = [animationEntry("bundle.clip.one", "Blink")];
    const targetId = "bundle-animation:face-1:0";
    const overrideClip: AnimationClipIR = {
      schemaVersion: 1,
      id: "bundle.clip.one",
      name: "Edited Blink",
      duration: 3,
      tracks: [],
    };

    expect(
      resolveImportedBundleAnimationBaseClip({
        targetId,
        entries,
        nameOverrides: {
          [targetId]: "Renamed Blink",
        },
        durationOverrides: {
          [targetId]: 4,
        },
      }),
    ).toMatchObject({
      id: "bundle.clip.one",
      name: "Renamed Blink",
      duration: 4,
    });
    expect(
      resolveImportedBundleAnimationClip({
        targetId,
        entries,
        clipOverrides: {
          [targetId]: overrideClip,
        },
        nameOverrides: {
          [targetId]: "Renamed Again",
        },
        durationOverrides: {
          [targetId]: 5,
        },
      }),
    ).toEqual({
      ...overrideClip,
      name: "Renamed Again",
      duration: 5,
    });
  });

  it("resolves program snapshots from bundle specs and snapshot overrides", () => {
    const entries = [graphEntry("program.one", "Program One")];
    const targetId = "bundle-procedural:face-1:0";
    const baseSnapshot = resolveImportedBundleProgramBaseSnapshot({
      targetId,
      entries,
    });

    expect(baseSnapshot?.nodes.map((node) => node.id)).toEqual([
      "input-1",
      "output-1",
    ]);
    expect(baseSnapshot?.enabledInputs).toEqual(["rig/face/standard/smile"]);
    expect(baseSnapshot?.enabledOutputs).toEqual([
      "rig/face/standard/jaw/open",
    ]);

    expect(
      resolveImportedBundleProgramSnapshot({
        targetId,
        entries,
        snapshotOverrides: {
          [targetId]: {
            nodes: [],
            edges: [],
            enabledOutputs: ["override/output"],
            enabledInputs: [],
            customInputPaths: [],
          },
        },
      }),
    ).toEqual({
      nodes: [],
      edges: [],
      enabledOutputs: ["override/output"],
      enabledInputs: [],
      customInputPaths: [],
    });
  });
});
