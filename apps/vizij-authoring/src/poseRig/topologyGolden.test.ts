import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import { buildPoseGraphSpecFromIr } from "./graphBuilder";
import type { PoseDiagnostic, PoseRigConfigFile } from "./types";
import { PoseIrService } from "./services/poseIrService";

const FIXTURE_TIMESTAMP = "2026-02-19T00:00:00.000Z";

type StableTopologyNode = {
  id: string;
  type: string;
  params?: unknown;
};

type StableTopologyEdge = {
  from: string | null;
  fromOutput: string | null;
  to: string | null;
  toInput: string | null;
  selector?: unknown;
};

type StableTopologySnapshot = {
  nodes: StableTopologyNode[];
  edges: StableTopologyEdge[];
  neutralRecord: Record<string, number>;
  outputPaths: string[];
};

type RawTopologyNode = {
  id?: string;
  type?: string;
  params?: Record<string, unknown>;
};

type RawTopologyEdge = {
  from?: { node_id?: string | null; output?: string | null } | null;
  to?: { node_id?: string | null; input?: string | null } | null;
  selector?: unknown;
};

type StableDiagnostic = {
  severity: PoseDiagnostic["severity"];
  code: PoseDiagnostic["code"];
  source: PoseDiagnostic["source"];
  message: string;
  location?: PoseDiagnostic["location"];
  metadata?: PoseDiagnostic["metadata"];
};

type GoldenFixture = {
  id: string;
  config: PoseRigConfigFile;
  standardInputs: StandardRigInput[];
  expectedTopologyHash: string;
  expectedDiagnosticCodes: string[];
};

function buildInput(
  id: string,
  path: string,
  defaultValue = 0,
): StandardRigInput {
  return {
    id,
    path,
    sourceId: id,
    label: id,
    group: "test",
    defaultValue,
    range: { min: -1, max: 1 },
  };
}

function buildPose(
  id: string,
  name: string,
  groupIds: string[],
  values: Record<string, number>,
) {
  return {
    id,
    name,
    group: null,
    groupId: groupIds[0] ?? null,
    groupIds,
    values,
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return Object.fromEntries(
    entries.map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function hashStable(value: unknown): string {
  const payload = JSON.stringify(canonicalize(value));
  return createHash("sha256").update(payload).digest("hex");
}

function extractNeutralRecord(spec: GraphSpec): Record<string, number> {
  const rawNodes = (spec.nodes ?? []) as RawTopologyNode[];
  const neutralNode = rawNodes.find(
    (node) => node.id === "pose_neutral_record",
  );
  const neutralValue = (neutralNode?.params?.value ?? null) as {
    record?: {
      values?: {
        record?: Record<string, unknown>;
      };
    };
  } | null;
  const record = neutralValue?.record?.values?.record ?? {};
  const recordEntries = Object.entries(record as Record<string, unknown>);
  const entries = recordEntries
    .flatMap(([inputId, value]) => {
      const floatValue = (value as { float?: unknown } | undefined)?.float;
      if (!Number.isFinite(floatValue)) {
        return [];
      }
      return [[inputId, floatValue as number] as const];
    })
    .sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries);
}

function snapshotTopology(spec: GraphSpec): StableTopologySnapshot {
  const rawNodes = (spec.nodes ?? []) as RawTopologyNode[];
  const rawEdges = (spec.edges ?? []) as RawTopologyEdge[];

  const nodes: StableTopologyNode[] = rawNodes.map((node) => ({
    id: node.id ?? "",
    type: node.type ?? "",
    params: node.params ? canonicalize(node.params) : undefined,
  }));

  const edges: StableTopologyEdge[] = rawEdges.map((edge) => ({
    from: edge.from?.node_id ?? null,
    fromOutput: edge.from?.output ?? null,
    to: edge.to?.node_id ?? null,
    toInput: edge.to?.input ?? null,
    selector: edge.selector ? canonicalize(edge.selector) : undefined,
  }));

  const outputPaths = nodes
    .filter((node) => node.type === "output")
    .map((node) =>
      typeof (node.params as { path?: unknown } | undefined)?.path === "string"
        ? ((node.params as { path: string }).path as string)
        : "",
    );

  return {
    nodes,
    edges,
    neutralRecord: extractNeutralRecord(spec),
    outputPaths,
  };
}

function snapshotDiagnostics(
  diagnostics: PoseDiagnostic[],
): StableDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity,
    code: diagnostic.code,
    source: diagnostic.source,
    message: diagnostic.message,
    location: diagnostic.location
      ? (canonicalize(diagnostic.location) as PoseDiagnostic["location"])
      : undefined,
    metadata: diagnostic.metadata
      ? (canonicalize(diagnostic.metadata) as PoseDiagnostic["metadata"])
      : undefined,
  }));
}

function compileFixture(fixture: GoldenFixture) {
  const { ir, diagnostics } = PoseIrService.fromConfig(
    fixture.config,
    fixture.standardInputs,
    fixture.config.faceId ?? null,
  );
  const { spec } = buildPoseGraphSpecFromIr({
    poseIr: ir,
    standardInputs: fixture.standardInputs,
    faceId: ir.faceId,
    rigKind: ir.rigKind ?? "face-specific",
  });
  const topologySnapshot = snapshotTopology(spec);
  return {
    topologySnapshot,
    topologyHash: hashStable(topologySnapshot),
    diagnostics: snapshotDiagnostics(diagnostics),
  };
}

const GOLDEN_FIXTURES: GoldenFixture[] = [
  {
    id: "shared-channel-overlaps",
    standardInputs: [
      buildInput("smile", "/face/smile"),
      buildInput("jaw_open", "/face/jaw/open"),
    ],
    config: {
      version: 1,
      faceId: "robot",
      rigKind: "face-specific",
      neutralMode: "explicit",
      neutralInputs: {
        smile: 0,
        jaw_open: 0,
      },
      poseGroups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
          blendMode: "average",
        },
        {
          id: "viseme",
          name: "Viseme",
          path: "viseme",
          blendMode: "average",
        },
      ],
      crossGroupBlendMode: "additive",
      poses: [
        buildPose("pose_smile", "Smile", ["emotion"], {
          smile: 0.85,
          jaw_open: 0.2,
        }),
        buildPose("pose_talk", "Talk", ["viseme"], {
          smile: -0.3,
          jaw_open: 0.7,
        }),
      ],
    },
    expectedTopologyHash:
      "345f950518a15b8213847bd19d2a7383838f2b85fc1f36d2a0f7f23bba83f225",
    expectedDiagnosticCodes: [],
  },
  {
    id: "neutral-fallback-behavior",
    standardInputs: [
      buildInput("smile", "/face/smile", 0.15),
      buildInput("brow_raise", "/face/brow/raise", -0.1),
    ],
    config: {
      version: 1,
      faceId: "robot",
      rigKind: "face-specific",
      neutralMode: "explicit",
      neutralInputs: {
        smile: 0.25,
      },
      poseGroups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
          blendMode: "average",
        },
      ],
      crossGroupBlendMode: "average",
      poses: [
        buildPose("pose_brow", "Brow Raise", ["emotion"], {
          brow_raise: 0.45,
        }),
        buildPose("pose_smile", "Smile", ["emotion"], {
          smile: 0.8,
        }),
      ],
    },
    expectedTopologyHash:
      "a783427cdaf5d5346f915b023111920024133128b66e221bc6f9ead3c29f366c",
    expectedDiagnosticCodes: ["implicit-neutral-fallback"],
  },
  {
    id: "multi-stage-blend-chains",
    standardInputs: [
      buildInput("smile", "/face/smile"),
      buildInput("blink", "/face/blink"),
    ],
    config: {
      version: 1,
      faceId: "robot",
      rigKind: "face-specific",
      neutralMode: "explicit",
      neutralInputs: {
        smile: 0,
        blink: 0,
      },
      poseGroups: [
        {
          id: "base",
          name: "Base",
          path: "base",
          blendMode: "average",
        },
        {
          id: "viseme",
          name: "Viseme",
          path: "viseme",
          blendMode: "average",
        },
        {
          id: "accent",
          name: "Accent",
          path: "accent",
          blendMode: "average",
        },
      ],
      crossGroupBlendMode: "additive",
      blendStages: [
        {
          id: "stage_primary",
          name: "Primary",
          mode: "average",
          sources: [
            { kind: "group", id: "base" },
            { kind: "group", id: "viseme" },
          ],
        },
        {
          id: "stage_emphasis",
          name: "Emphasis",
          mode: "add",
          sources: [
            { kind: "stage", id: "stage_primary" },
            { kind: "group", id: "accent" },
          ],
        },
        {
          id: "stage_final",
          name: "Final",
          mode: "average",
          sources: [
            { kind: "stage", id: "stage_emphasis" },
            { kind: "group", id: "base" },
          ],
        },
      ],
      poses: [
        buildPose("pose_base", "Base", ["base"], {
          smile: 0.5,
          blink: 0.1,
        }),
        buildPose("pose_viseme", "Viseme", ["viseme"], {
          smile: -0.2,
          blink: 0.65,
        }),
        buildPose("pose_accent", "Accent", ["accent"], {
          smile: 0.3,
          blink: -0.35,
        }),
      ],
    },
    expectedTopologyHash:
      "d78d42fb24c14cb217752d5bc2771a6468d050dba945eeaa64aced1a3ef4b636",
    expectedDiagnosticCodes: [],
  },
];

const GOLDEN_CASES = GOLDEN_FIXTURES.map(
  (fixture) => [fixture.id, fixture] as const,
);

describe("pose rig topology golden fixtures", () => {
  it.each(GOLDEN_CASES)(
    "%s compiles deterministically across repeated runs",
    (_fixtureId, fixture) => {
      const first = compileFixture(fixture);
      const second = compileFixture(fixture);

      expect(second.topologySnapshot).toEqual(first.topologySnapshot);
      expect(second.topologyHash).toBe(first.topologyHash);
      expect(second.diagnostics).toEqual(first.diagnostics);

      const diagnosticCodes = first.diagnostics.map(
        (diagnostic) => diagnostic.code,
      );
      expect(diagnosticCodes).toEqual(fixture.expectedDiagnosticCodes);
    },
  );

  it.each(GOLDEN_CASES)(
    "%s matches the locked golden topology hash",
    (_fixtureId, fixture) => {
      const result = compileFixture(fixture);
      expect(result.topologyHash).toBe(fixture.expectedTopologyHash);
    },
  );

  it("includes neutral fallback diagnostics and fallback neutral values", () => {
    const fixture = GOLDEN_FIXTURES.find(
      (candidate) => candidate.id === "neutral-fallback-behavior",
    );
    expect(fixture, "neutral fallback fixture should exist").toBeDefined();
    const result = compileFixture(fixture!);
    const fallbackDiagnostic = result.diagnostics.find(
      (diagnostic) => diagnostic.code === "implicit-neutral-fallback",
    );

    expect(fallbackDiagnostic).toMatchObject({
      severity: "warning",
      source: "pose-config",
    });
    expect(fallbackDiagnostic?.message).toContain("Neutral mode is explicit");
    expect(fallbackDiagnostic?.metadata).toMatchObject({
      neutralMode: "explicit",
      missingNeutralIds: ["brow_raise"],
    });
    expect(result.topologySnapshot.neutralRecord).toMatchObject({
      smile: 0.25,
      brow_raise: -0.1,
    });
  });
});
