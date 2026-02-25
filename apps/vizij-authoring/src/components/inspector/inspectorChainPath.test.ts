import { describe, expect, it } from "vitest";
import {
  appendOrRevisitInspectorChainPath,
  type InspectorChainNode,
} from "./inspectorChainPath";

describe("appendOrRevisitInspectorChainPath", () => {
  it("appends a new chain node when it is not in the path yet", () => {
    const current: InspectorChainNode[] = [
      { mode: "pose", id: "pose_1", label: "Smile" },
      { mode: "rig", id: "rig_parent", label: "Jaw Open", view: "quick" },
    ];
    const nextNode: InspectorChainNode = {
      mode: "rig",
      id: "propsrig_mouth_open",
      label: "Mouth Open",
      view: "quick",
    };

    expect(appendOrRevisitInspectorChainPath(current, nextNode)).toEqual([
      { mode: "pose", id: "pose_1", label: "Smile" },
      { mode: "rig", id: "rig_parent", label: "Jaw Open", view: "quick" },
      {
        mode: "rig",
        id: "propsrig_mouth_open",
        label: "Mouth Open",
        view: "quick",
      },
    ]);
  });

  it("truncates to existing node and refreshes its selection context", () => {
    const current: InspectorChainNode[] = [
      { mode: "pose", id: "pose_1", label: "Smile" },
      { mode: "rig", id: "rig_parent", label: "Jaw Open", view: "quick" },
      {
        mode: "scene",
        id: "shape_1",
        label: "Face Mesh",
        view: "quick",
        targetId: "anim://mouth/open",
      },
    ];
    const revisitedNode: InspectorChainNode = {
      mode: "rig",
      id: "rig_parent",
      label: "Jaw Open",
      view: "quick",
    };

    expect(appendOrRevisitInspectorChainPath(current, revisitedNode)).toEqual([
      { mode: "pose", id: "pose_1", label: "Smile" },
      {
        mode: "rig",
        id: "rig_parent",
        label: "Jaw Open",
        view: "quick",
      },
    ]);
  });
});
