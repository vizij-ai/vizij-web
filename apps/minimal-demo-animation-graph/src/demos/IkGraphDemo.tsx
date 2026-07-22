import React, { useCallback, useEffect, useEffectEvent, useMemo } from "react";
import {
  GraphProvider,
  useGraphRuntime,
  useGraphOutputs,
  valueAsNumber,
  valueAsVec3,
  valueAsVector,
  useGraphLoaded,
} from "@vizij/node-graph-react";
import {
  toValueJSON,
  valueAsNumber as animationValueAsNumber,
} from "@vizij/value-json";
import { minimalDemoTheme } from "@vizij/minimal-demo-ui";
import { useAnimationRuntime } from "../animationRuntime";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import {
  UrdfIkPanel,
  type AppliedParams as IkPanelAppliedParams,
} from "../components/UrdfIkPanel";
import { useSyncedSeries } from "../utils/useSyncedSeries";
import {
  ikAnimation,
  ikPaths,
  JOINT_IDS,
  JOINT_COLORS,
  type JointId,
} from "../data/ikAnimation";
import { ikGraphSpec } from "../data/ikGraph";
import { sampleUrdf } from "../data/urdf-samples/sampleUrdf";

type FkPositionKey = "x" | "y" | "z";
type FkRotationKey = "qx" | "qy" | "qz" | "qw";

interface FrameSnapshot {
  version: number;
  fkPosition: [number, number, number];
  fkRotation: [number, number, number, number];
  jointOutputs: (number | undefined)[];
}

function IkGraphInner() {
  const runtime = useGraphRuntime();
  const { graphLoaded, waitForGraphReady } = useGraphLoaded();

  const anim = useAnimationRuntime(ikAnimation);
  const joint1Anim = anim.values[ikPaths.jointAnimation.joint1];
  const joint2Anim = anim.values[ikPaths.jointAnimation.joint2];
  const joint3Anim = anim.values[ikPaths.jointAnimation.joint3];
  const joint4Anim = anim.values[ikPaths.jointAnimation.joint4];
  const joint5Anim = anim.values[ikPaths.jointAnimation.joint5];
  const joint6Anim = anim.values[ikPaths.jointAnimation.joint6];

  const jointInputs = useMemo(() => {
    const values = [
      animationValueAsNumber(joint1Anim) ?? 0,
      animationValueAsNumber(joint2Anim) ?? 0,
      animationValueAsNumber(joint3Anim) ?? 0,
      animationValueAsNumber(joint4Anim) ?? 0,
      animationValueAsNumber(joint5Anim) ?? 0,
      animationValueAsNumber(joint6Anim) ?? 0,
    ];
    return values.map((entry) => (Number.isFinite(entry) ? entry : 0));
  }, [joint1Anim, joint2Anim, joint3Anim, joint4Anim, joint5Anim, joint6Anim]);

  const frame = useGraphOutputs<FrameSnapshot>(
    (snap) => {
      const version = snap?.version ?? 0;
      const nodes = snap?.evalResult?.nodes ?? {};

      const readOut = (nodeId: string) => {
        const entry = nodes?.[nodeId];
        if (!entry) return undefined;
        const outputs = (entry as any)?.outputs ?? entry;
        return outputs?.out ?? null;
      };

      const fkPos = valueAsVec3(readOut("fk_position_out")) ?? [0, 0, 0];
      const fkRotRaw = valueAsVector(readOut("fk_rotation_out"));
      const fkRot: [number, number, number, number] =
        fkRotRaw && fkRotRaw.length >= 4
          ? [fkRotRaw[0], fkRotRaw[1], fkRotRaw[2], fkRotRaw[3]]
          : [0, 0, 0, 1];

      const jointOutputs = JOINT_IDS.map((jointId) => {
        const value = valueAsNumber(readOut(`${jointId}_out`));
        return typeof value === "number" && Number.isFinite(value)
          ? value
          : undefined;
      });

      return {
        version,
        fkPosition: fkPos,
        fkRotation: fkRot,
        jointOutputs,
      };
    },
    (prev, next) => prev?.version === next?.version,
  );

  const syncJointInputs = useEffectEvent(
    async (nextJointInputs: number[], isCancelled: () => boolean) => {
      try {
        await waitForGraphReady();
        if (isCancelled()) return;
        runtime.stageInput?.(
          ikPaths.jointInput,
          toValueJSON(nextJointInputs),
          undefined,
          false,
        );
        runtime.evalAll?.();
      } catch (err) {
        console.error("[IkGraphDemo] Failed to stage joint inputs", err);
      }
    },
  );

  useEffect(() => {
    let cancelled = false;
    void syncJointInputs(jointInputs, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [jointInputs]);

  const handleIkParamsApplied = useCallback(
    (params: IkPanelAppliedParams) => {
      if (!runtime.ready || !graphLoaded) return;
      try {
        runtime.setParam("fk", "urdf_xml", params.urdf);
        runtime.setParam("fk", "root_link", params.root);
        runtime.setParam("fk", "tip_link", params.tip);
      } catch (err) {
        console.error(
          "[IkGraphDemo] Failed to mirror IK params onto FK node",
          err,
        );
      }
    },
    [runtime, graphLoaded],
  );

  const jointInputRecord = useMemo(() => {
    const record = {} as Record<JointId, number | undefined>;
    JOINT_IDS.forEach((jointId, index) => {
      record[jointId] = jointInputs[index];
    });
    return record;
  }, [jointInputs]);

  const ikOutputRecord = useMemo(() => {
    const record = {} as Record<JointId, number | undefined>;
    JOINT_IDS.forEach((jointId, index) => {
      record[jointId] = frame.jointOutputs[index];
    });
    return record;
  }, [frame.jointOutputs]);

  const fkPositionRecord = useMemo(() => {
    const [x, y, z] = frame.fkPosition;
    return { x, y, z } as Record<FkPositionKey, number | undefined>;
  }, [frame.fkPosition]);

  const fkRotationRecord = useMemo(() => {
    const [qx, qy, qz, qw] = frame.fkRotation;
    return { qx, qy, qz, qw } as Record<FkRotationKey, number | undefined>;
  }, [frame.fkRotation]);

  const jointInputSeries = useSyncedSeries<JointId>(
    jointInputRecord,
    frame.version,
  );
  const ikOutputSeries = useSyncedSeries<JointId>(
    ikOutputRecord,
    frame.version,
  );
  const fkPositionSeries = useSyncedSeries<FkPositionKey>(
    fkPositionRecord,
    frame.version,
  );
  const fkRotationSeries = useSyncedSeries<FkRotationKey>(
    fkRotationRecord,
    frame.version,
  );

  const latestFkPosition = frame.fkPosition;
  const latestFkRotation = frame.fkRotation;
  const latestIkOutputs = frame.jointOutputs;

  if (!runtime.ready || !graphLoaded) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 240,
          gap: 12,
          color: minimalDemoTheme.text,
        }}
      >
        <strong>Loading IK graph…</strong>
        <span style={{ fontSize: 14, color: minimalDemoTheme.muted }}>
          Preparing wasm runtime and node schemas.
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <UrdfIkPanel
        nodeId="ik_solver"
        sampleUrdf={sampleUrdf}
        onParamsApplied={handleIkParamsApplied}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        <div
          style={{
            background: minimalDemoTheme.card,
            borderRadius: 12,
            padding: 16,
            border: `1px solid ${minimalDemoTheme.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <strong style={{ color: minimalDemoTheme.text }}>
            Latest samples
          </strong>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 13,
              lineHeight: 1.6,
              color: minimalDemoTheme.text,
            }}
          >
            <div>
              <span style={{ color: minimalDemoTheme.muted }}>
                Anim joints:
              </span>{" "}
              {jointInputs
                .map((value, idx) => `${JOINT_IDS[idx]}=${value.toFixed(3)}`)
                .join(", ")}
            </div>
            <div>
              <span style={{ color: minimalDemoTheme.muted }}>
                FK position:
              </span>{" "}
              {latestFkPosition.map((value) => value.toFixed(3)).join(", ")}
            </div>
            <div>
              <span style={{ color: minimalDemoTheme.muted }}>
                FK rotation (quat):
              </span>{" "}
              {latestFkRotation.map((value) => value.toFixed(3)).join(", ")}
            </div>
            <div>
              <span style={{ color: minimalDemoTheme.muted }}>IK joints:</span>{" "}
              {latestIkOutputs
                .map(
                  (value, idx) =>
                    `${JOINT_IDS[idx]}=${
                      typeof value === "number" ? value.toFixed(3) : "…"
                    }`,
                )
                .join(", ")}
            </div>
          </div>
        </div>
      </div>

      <TimeSeriesChart
        title="Animation joint inputs"
        series={JOINT_IDS.map((jointId, index) => ({
          label: jointId,
          color: JOINT_COLORS[index % JOINT_COLORS.length],
          values: jointInputSeries[jointId] ?? [],
        }))}
      />

      <TimeSeriesChart
        title="FK position (meters)"
        series={[
          { label: "x", color: "#60a5fa", values: fkPositionSeries.x ?? [] },
          { label: "y", color: "#34d399", values: fkPositionSeries.y ?? [] },
          { label: "z", color: "#facc15", values: fkPositionSeries.z ?? [] },
        ]}
      />

      <TimeSeriesChart
        title="FK rotation (quaternion)"
        series={[
          { label: "qx", color: "#38bdf8", values: fkRotationSeries.qx ?? [] },
          { label: "qy", color: "#22d3ee", values: fkRotationSeries.qy ?? [] },
          { label: "qz", color: "#a855f7", values: fkRotationSeries.qz ?? [] },
          { label: "qw", color: "#f472b6", values: fkRotationSeries.qw ?? [] },
        ]}
      />

      <TimeSeriesChart
        title="IK solved joints"
        series={JOINT_IDS.map((jointId, index) => ({
          label: jointId,
          color: JOINT_COLORS[index % JOINT_COLORS.length],
          values: ikOutputSeries[jointId] ?? [],
        }))}
      />
    </div>
  );
}

export function IkGraphDemo() {
  return (
    <GraphProvider
      spec={ikGraphSpec}
      waitForGraph
      initialParams={{
        fk: {
          urdf_xml: sampleUrdf,
          root_link: "base_link",
          tip_link: "tool",
        },
        ik_solver: {
          urdf_xml: sampleUrdf,
          root_link: "base_link",
          tip_link: "tool",
        },
      }}
      initialInputs={{
        [ikPaths.jointInput]: { vector: [0, 0, 0, 0, 0, 0] },
      }}
      autoStart={false}
      updateHz={60}
    >
      <IkGraphInner />
    </GraphProvider>
  );
}
