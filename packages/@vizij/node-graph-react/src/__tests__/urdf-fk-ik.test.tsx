/* @vitest-environment node */

import React, { useEffect, useRef } from "react";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { render, cleanup, waitFor, act } from "@testing-library/react";
import { JSDOM } from "jsdom";

import {
  NodeGraphProvider,
  useGraphRuntime,
  valueAsVector,
  init as initGraphWasm,
} from "../index";
import type { GraphRuntimeContextValue } from "../types";
import type { GraphSpec, ValueJSON } from "@vizij/node-graph-wasm";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { readFile } from "node:fs/promises";

const urdfXml = `
<robot name="planar_arm">
  <link name="base_link" />
  <link name="link1" />
  <link name="link2" />
  <link name="link3" />
  <link name="link4" />
  <link name="link5" />
  <link name="link6" />
  <link name="tool" />

  <joint name="joint1" type="revolute">
    <parent link="base_link" />
    <child link="link1" />
    <origin xyz="0 0 0.1" rpy="0 0 0" />
    <axis xyz="0 0 1" />
    <limit lower="-3.1416" upper="3.1416" effort="1" velocity="1" />
  </joint>

  <joint name="joint2" type="revolute">
    <parent link="link1" />
    <child link="link2" />
    <origin xyz="0.2 0 0" rpy="0 0 0" />
    <axis xyz="0 1 0" />
    <limit lower="-3.1416" upper="3.1416" effort="1" velocity="1" />
  </joint>

  <joint name="joint3" type="revolute">
    <parent link="link2" />
    <child link="link3" />
    <origin xyz="0.2 0 0" rpy="0 0 0" />
    <axis xyz="1 0 0" />
    <limit lower="-3.1416" upper="3.1416" effort="1" velocity="1" />
  </joint>

  <joint name="joint4" type="revolute">
    <parent link="link3" />
    <child link="link4" />
    <origin xyz="0.2 0 0" rpy="0 0 0" />
    <axis xyz="0 0 1" />
    <limit lower="-3.1416" upper="3.1416" effort="1" velocity="1" />
  </joint>

  <joint name="joint5" type="revolute">
    <parent link="link4" />
    <child link="link5" />
    <origin xyz="0.15 0 0" rpy="0 0 0" />
    <axis xyz="0 1 0" />
    <limit lower="-3.1416" upper="3.1416" effort="1" velocity="1" />
  </joint>

  <joint name="joint6" type="revolute">
    <parent link="link5" />
    <child link="link6" />
    <origin xyz="0.1 0 0" rpy="0 0 0" />
    <axis xyz="1 0 0" />
    <limit lower="-3.1416" upper="3.1416" effort="1" velocity="1" />
  </joint>

  <joint name="tool_joint" type="fixed">
    <parent link="link6" />
    <child link="tool" />
    <origin xyz="0.1 0 0" rpy="0 0 0" />
  </joint>
</robot>
`.trim();

const fkIkGraph: GraphSpec = {
  nodes: [
    {
      id: "joint_input",
      type: "input",
      params: {
        path: "tests/urdf.joints",
        value: { vector: [0, 0, 0, 0, 0, 0] },
      },
    },
    {
      id: "fk",
      type: "urdffk",
      params: {
        urdf_xml: urdfXml,
        root_link: "base_link",
        tip_link: "tool",
      },
      inputs: { joints: { node_id: "joint_input" } },
    },
    {
      id: "ik",
      type: "urdfikposition",
      params: {
        urdf_xml: urdfXml,
        root_link: "base_link",
        tip_link: "tool",
        max_iters: 256,
        tol_pos: 0.0005,
      },
      inputs: {
        target_pos: { node_id: "fk", output_key: "position" },
        seed: { node_id: "joint_input" },
      },
    },
  ],
};

const JOINT_IDS = [
  "joint1",
  "joint2",
  "joint3",
  "joint4",
  "joint5",
  "joint6",
] as const;

const JOINT_SAMPLES: number[][] = [
  [0, 0, 0, 0, 0, 0],
  [0.2, -0.1, 0.15, -0.2, 0.1, -0.05],
  [-0.25, 0.2, -0.18, 0.22, -0.12, 0.08],
  [0.35, -0.28, 0.24, 0.18, -0.16, 0.12],
  [-0.3, 0.18, 0.12, -0.26, 0.2, -0.14],
];

const EPSILON = 1e-2;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const runtimeRef: { current: GraphRuntimeContextValue | null } = {
  current: null,
};

const RuntimeTap: React.FC = () => {
  const runtime = useGraphRuntime();
  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);
  return null;
};

describe("URDF FK/IK integration", () => {
  beforeAll(async () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;
    (globalThis as any).navigator = {
      userAgent: "node.js",
    };

    const here = dirname(fileURLToPath(import.meta.url));
    const wasmPath = resolvePath(
      here,
      "../../../../../../vizij-rs/npm/@vizij/node-graph-wasm/pkg/vizij_graph_wasm_bg.wasm",
    );
    const wasmBytes = await readFile(wasmPath);
    await initGraphWasm(wasmBytes);
  });

  afterAll(() => {
    cleanup();
    delete (globalThis as any).window;
    delete (globalThis as any).document;
    delete (globalThis as any).navigator;
  });

  it("solves IK results that replay through FK via the React provider", async () => {
    const deferred = createDeferred<void>();

    render(
      <NodeGraphProvider spec={fkIkGraph} autoStart={false} autoMode="manual">
        <RuntimeTap />
      </NodeGraphProvider>,
    );

    await waitFor(() => {
      expect(runtimeRef.current?.ready).toBe(true);
      expect(runtimeRef.current?.graph).toBeTruthy();
    });

    const runtime = runtimeRef.current;
    if (!runtime) throw new Error("runtime not initialised");

    try {
      JOINT_SAMPLES.forEach((angles, sampleIdx) => {
        act(() => {
          runtime.stageInput("tests/urdf.joints", { vector: angles });
          const fkResult = runtime.evalAll();
          if (!fkResult) {
            throw new Error(`fk eval returned null for sample ${sampleIdx}`);
          }

          const fkNode = fkResult.nodes?.fk as
            | Record<string, { value: ValueJSON }>
            | undefined;
          if (!fkNode?.position)
            throw new Error(`fk position missing for sample ${sampleIdx}`);
          const fkPos = valueAsVector(fkNode.position);
          expect(
            fkPos,
            `fk position vector missing for sample ${sampleIdx}`,
          ).toBeTruthy();

          const ikNode = fkResult.nodes?.ik as any;
          const ikValue: ValueJSON | undefined = ikNode?.out?.value;
          if (!ikValue || !("record" in ikValue)) {
            throw new Error(`ik output missing record for sample ${sampleIdx}`);
          }

          const ikRecord = (ikValue as { record: Record<string, ValueJSON> })
            .record;
          const solvedAngles = JOINT_IDS.map((jointId) => {
            const entry = ikRecord[jointId] as ValueJSON | undefined;
            if (!entry || typeof (entry as any).float !== "number") {
              throw new Error(
                `ik joint '${jointId}' missing numeric value (sample ${sampleIdx})`,
              );
            }
            const angle = (entry as any).float as number;
            expect(Number.isFinite(angle)).toBe(true);
            return angle;
          });

          runtime.stageInput("tests/urdf.joints", { vector: solvedAngles });
          const validation = runtime.evalAll();
          if (!validation) {
            throw new Error(
              `validation eval returned null for sample ${sampleIdx}`,
            );
          }
          const validationFk = validation.nodes?.fk as
            | Record<string, { value: ValueJSON }>
            | undefined;
          const validationPos = validationFk?.position
            ? valueAsVector(validationFk.position)
            : undefined;
          if (!validationPos) {
            throw new Error(
              `validation fk position missing for sample ${sampleIdx}`,
            );
          }

          fkPos!.forEach((component, idx) => {
            expect(Math.abs(validationPos[idx] - component)).toBeLessThan(
              EPSILON,
            );
          });
        });
      });
      deferred.resolve();
    } catch (err) {
      deferred.reject(err);
    }

    await deferred.promise;
  }, 15000);
});
