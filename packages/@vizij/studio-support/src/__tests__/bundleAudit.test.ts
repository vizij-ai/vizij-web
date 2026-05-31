import { describe, expect, it } from "vitest";
import type { VizijBundleExtension } from "@vizij/render";
import {
  auditBundleGraphs,
  resolveBundleContractViolationMessage,
  type BundleGraphAuditEntry,
} from "../utils/bundleAudit";

describe("auditBundleGraphs", () => {
  it("reports missing IR graphs without compiling", async () => {
    const bundle: VizijBundleExtension = {
      version: 1,
      graphs: [
        {
          id: "rig",
          kind: "rig",
          label: "Rig",
          spec: {
            metadata: {
              vizij: {
                faceId: "face",
              },
            },
          },
          ir: null,
        },
      ],
    };

    await expect(auditBundleGraphs(bundle)).resolves.toEqual([
      {
        id: "rig",
        label: "Rig",
        kind: "rig",
        faceId: "face",
        status: "missing-ir",
        diff: undefined,
        diffCount: 0,
        diffLimitReached: false,
        issues: [],
        outputs: [],
      },
    ]);
  });
});

describe("resolveBundleContractViolationMessage", () => {
  it("reports rig contract diffs", () => {
    const audits: BundleGraphAuditEntry[] = [
      {
        id: "face",
        kind: "rig",
        status: "diff",
        faceId: "face",
        diffCount: 2,
        diffLimitReached: false,
        issues: [],
        outputs: [],
      },
    ];

    expect(resolveBundleContractViolationMessage(audits)).toBe(
      'Export blocked: graph "face" does not match compiled IR (2 diffs).',
    );
  });

  it("reports unmapped rig output targets", () => {
    const audits: BundleGraphAuditEntry[] = [
      {
        id: "face",
        kind: "rig",
        status: "match",
        faceId: "face",
        diffCount: 0,
        diffLimitReached: false,
        issues: [],
        outputs: [
          {
            nodeId: "out_1",
            path: "/unknown/output/path",
            status: "missing-target",
          },
        ],
      },
    ];

    expect(resolveBundleContractViolationMessage(audits)).toBe(
      'Export blocked: graph "face" has output path "/unknown/output/path" that does not map to a runtime target.',
    );
  });

  it("ignores non-rig missing IR entries", () => {
    const audits: BundleGraphAuditEntry[] = [
      {
        id: "face",
        kind: "rig",
        status: "match",
        faceId: "face",
        diffCount: 0,
        diffLimitReached: false,
        issues: [],
        outputs: [],
      },
      {
        id: "face_pose_graph",
        kind: "pose-driver",
        status: "missing-ir",
        faceId: "face",
        diffCount: 0,
        diffLimitReached: false,
        issues: [],
        outputs: [],
      },
    ];

    expect(resolveBundleContractViolationMessage(audits)).toBeNull();
  });
});
