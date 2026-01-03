import type { RefObject } from "react";
import { describe, expect, it } from "vitest";
import type { World } from "@vizij/render";
import type { AnimatableValue } from "@vizij/utils";
import { auditRobotData, createRobotDataAuditTask } from "./robotDataAudit";

function buildWorld(): {
  world: World;
  animatables: Record<string, AnimatableValue>;
} {
  const animatables: Record<string, AnimatableValue> = {
    existing_anim: {
      id: "existing_anim",
      type: "number",
      name: "Existing",
      default: 0,
      constraints: { min: -1, max: 1 },
      pub: { public: true, output: "Existing" },
    },
  };

  const world: World = {
    node_a: {
      id: "node_a",
      name: "Node A",
      tags: [],
      type: "group",
      refs: {
        default: {
          current: createSceneObject({
            name: "Node A",
            hasRobotData: true,
            position: { x: 0, y: 0, z: 0 },
          }),
        } as RefObject<any>,
      },
      root: true,
      features: {
        translation: { animated: false, value: { x: 0, y: 0, z: 0 } },
        rotation: { animated: false, value: { x: 0, y: 0, z: 0 } },
        scale: { animated: false, value: { x: 1, y: 1, z: 1 } },
      },
      children: [],
    },
    node_b: {
      id: "node_b",
      name: "Node B",
      tags: [],
      type: "group",
      refs: {
        default: {
          current: createSceneObject({
            name: "Node B",
            hasRobotData: false,
            position: { x: 1, y: 0, z: 0 },
          }),
        } as RefObject<any>,
      },
      root: false,
      features: {
        translation: { animated: false, value: { x: 0, y: 0, z: 0 } },
        rotation: { animated: false, value: { x: 0, y: 0, z: 0 } },
        scale: { animated: false, value: { x: 1, y: 1, z: 1 } },
      },
      children: [],
    },
    node_c: {
      id: "node_c",
      name: "Node C",
      tags: [],
      type: "group",
      refs: {
        default: {
          current: createSceneObject({
            name: "Node C",
            hasRobotData: true,
            position: { x: 0, y: 2, z: 0 },
          }),
        } as RefObject<any>,
      },
      root: false,
      features: {
        translation: { animated: true, value: "missing_anim" },
        rotation: { animated: false, value: { x: 0, y: 0, z: 0 } },
        scale: { animated: false, value: { x: 1, y: 1, z: 1 } },
      },
      children: [],
    },
  };

  return { world, animatables };
}

describe("createRobotDataAuditTask", () => {
  it("matches the synchronous audit output when stepped", () => {
    const { world, animatables } = buildWorld();
    const task = createRobotDataAuditTask(world, animatables, {
      namespace: "default",
    });
    expect(task.done).toBe(false);
    while (!task.done) {
      task.step(1);
    }
    const incremental = task.result;
    const synchronous = auditRobotData(world, animatables, {
      namespace: "default",
    });
    expect(incremental).toEqual(synchronous);
    expect(task.processedNodes).toBe(synchronous.totalNodes);
  });

  it("updates processedNodes as batches advance", () => {
    const { world, animatables } = buildWorld();
    const task = createRobotDataAuditTask(world, animatables);
    task.step(1);
    const firstProcessed = task.processedNodes;
    task.step(1);
    expect(task.processedNodes).toBeGreaterThan(firstProcessed);
  });
});

function createSceneObject({
  name,
  hasRobotData,
  position,
}: {
  name: string;
  hasRobotData: boolean;
  position: { x: number; y: number; z: number };
}) {
  return {
    name,
    position,
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    isMesh: false,
    userData: hasRobotData
      ? { gltfExtensions: { RobotData: {} } }
      : { gltfExtensions: {} },
  };
}
