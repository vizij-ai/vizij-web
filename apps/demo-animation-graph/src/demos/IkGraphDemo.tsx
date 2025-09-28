import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnimationProvider,
  useAnimTarget,
  valueAsNumber as animationValueAsNumber,
} from "@vizij/animation-react";
import {
  GraphProvider,
  useGraphRuntime,
  useGraphOutputs,
  valueAsNumber,
  valueAsVec3,
  valueAsVector,
} from "@vizij/node-graph-react";
import { TimeSeriesChart } from "../components/TimeSeriesChart";
import { UrdfIkPanel, type AppliedParams as IkPanelAppliedParams } from "../components/UrdfIkPanel";
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
  const seededRef = useRef(false);
  const loadingRef = useRef(false);
  const [graphLoaded, setGraphLoaded] = useState(false);

  const joint1Anim = useAnimTarget(ikPaths.jointAnimation.joint1);
  const joint2Anim = useAnimTarget(ikPaths.jointAnimation.joint2);
  const joint3Anim = useAnimTarget(ikPaths.jointAnimation.joint3);
  const joint4Anim = useAnimTarget(ikPaths.jointAnimation.joint4);
  const joint5Anim = useAnimTarget(ikPaths.jointAnimation.joint5);
  const joint6Anim = useAnimTarget(ikPaths.jointAnimation.joint6);

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

  useEffect(() => {
    if (!runtime.ready || graphLoaded || loadingRef.current) return;
    if (!runtime.loadGraph) return;
    let cancelled = false;
    loadingRef.current = true;
    (async () => {
      try {
        await runtime.loadGraph(ikGraphSpec);
        if (!cancelled) {
          setGraphLoaded(true);
        }
      } catch (err) {
        console.error("[IkGraphDemo] Failed to load IK graph spec", err);
      } finally {
        loadingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runtime, runtime.ready, graphLoaded]);

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
      const fkRot: [number, number, number, number] = fkRotRaw && fkRotRaw.length >= 4
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

  useEffect(() => {
    if (!runtime.ready || !graphLoaded || seededRef.current) return;
    try {
      runtime.setParam("fk", "urdf_xml", sampleUrdf);
      runtime.setParam("fk", "root_link", "base_link");
      runtime.setParam("fk", "tip_link", "tool");
      runtime.setParam("ik_solver", "urdf_xml", sampleUrdf);
      runtime.setParam("ik_solver", "root_link", "base_link");
      runtime.setParam("ik_solver", "tip_link", "tool");
      seededRef.current = true;
      runtime.evalAll?.();
    } catch (err) {
      console.error("[IkGraphDemo] Failed to seed URDF params", err);
    }
  }, [runtime, runtime.ready, graphLoaded]);

  useEffect(() => {
    if (!runtime.ready || !graphLoaded) return;
    try {
      runtime.stageInput(ikPaths.jointInput, { vector: jointInputs });
      if (seededRef.current) {
        runtime.evalAll?.();
      }
    } catch (err) {
      console.error("[IkGraphDemo] Failed to stage joint inputs", err);
    }
  }, [runtime, runtime.ready, graphLoaded, jointInputs]);

  const handleIkParamsApplied = useCallback(
    (params: IkPanelAppliedParams) => {
      if (!runtime.ready || !graphLoaded) return;
      try {
        runtime.setParam("fk", "urdf_xml", params.urdf);
        runtime.setParam("fk", "root_link", params.root);
        runtime.setParam("fk", "tip_link", params.tip);
      } catch (err) {
        console.error("[IkGraphDemo] Failed to mirror IK params onto FK node", err);
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

  const jointInputSeries = useSyncedSeries<JointId>(jointInputRecord, frame.version);
  const ikOutputSeries = useSyncedSeries<JointId>(ikOutputRecord, frame.version);
  const fkPositionSeries = useSyncedSeries<FkPositionKey>(fkPositionRecord, frame.version);
  const fkRotationSeries = useSyncedSeries<FkRotationKey>(fkRotationRecord, frame.version);

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
          color: "#cbd5f5",
        }}
      >
        <strong>Loading IK graph…</strong>
        <span style={{ fontSize: 14, opacity: 0.8 }}>
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
        background: "#020617",
        borderRadius: 16,
        padding: 24,
        border: "1px solid #1f2937",
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ margin: 0, color: "#bfdbfe" }}>
          Animation-driven URDF FK / IK replay
        </h2>
        <p style={{ margin: 0, color: "#cbd5f5", lineHeight: 1.5 }}>
          The animation streams joint samples into the graph. A URDF FK node
          produces the target pose, and the URDF IK node solves joints that track
          that pose. Both the animation inputs and graph outputs are plotted for
          inspection.
        </p>
      </header>

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
            background: "#0f172a",
            borderRadius: 12,
            padding: 16,
            color: "#e2e8f0",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <strong>Latest samples</strong>
          <div style={{ fontFamily: "monospace", fontSize: 13, lineHeight: 1.6 }}>
            <div>
              <span style={{ opacity: 0.7 }}>Anim joints:</span>
              {" "}
              {jointInputs.map((value, idx) =>
                `${JOINT_IDS[idx]}=${value.toFixed(3)}`).join(", ")}
            </div>
            <div>
              <span style={{ opacity: 0.7 }}>FK position:</span>
              {" "}
              {latestFkPosition.map((value) => value.toFixed(3)).join(", ")}
            </div>
            <div>
              <span style={{ opacity: 0.7 }}>FK rotation (quat):</span>
              {" "}
              {latestFkRotation.map((value) => value.toFixed(3)).join(", ")}
            </div>
            <div>
              <span style={{ opacity: 0.7 }}>IK joints:</span>
              {" "}
              {latestIkOutputs
                .map((value, idx) =>
                  `${JOINT_IDS[idx]}=${
                    typeof value === "number" ? value.toFixed(3) : "…"
                  }`)
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
    <AnimationProvider
      animations={ikAnimation}
      prebind={(path) => path}
      autostart
      updateHz={60}
    >
      <GraphProvider autoStart={false} updateHz={60}>
        <IkGraphInner />
      </GraphProvider>
    </AnimationProvider>
  );
}
