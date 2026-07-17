import { describe, expect, it } from "vitest";
import {
  ANIMATION_MODULE_FIELD,
  ANIMATION_MODULE_FN,
  ANIMATION_MODULE_PARAM,
  ANIMATION_MODULE_TYPE,
  ANIMATIONS_OUT_PATH,
  ANIMATIONS_SOURCE_ID,
  addInstanceCall,
  animationsGraphSource,
  callResultU32,
  createPlayerCall,
  decodeTrackOutputs,
  loadAnimationCall,
  storedClipToModuleValue,
  type AroraField,
  type AroraStruct,
} from "../engine/animationModule";

const rampStoredClip = {
  id: "ramp",
  name: "ramp",
  duration: 1000,
  groups: {},
  tracks: [
    {
      id: "t0",
      name: "ramp",
      animatableId: "node/x",
      points: [
        {
          id: "k0",
          stamp: 0,
          value: 0,
          // Authored timing metadata the module's Keypoint cannot carry.
          // The converter must drop it (documented capability gap), not
          // approximate it.
          transitions: { in: { x: 1, y: 1 }, out: { x: 0, y: 0 } },
        },
        { id: "k1", stamp: 1, value: 1 },
      ],
    },
  ],
};

function fieldsById(fields: AroraField[]): Map<string, unknown> {
  return new Map(fields.map((entry) => [entry.id, entry.value]));
}

describe("storedClipToModuleValue", () => {
  it("emits the module's declared AnimationClip structure", () => {
    const value = storedClipToModuleValue(rampStoredClip) as {
      struct: AroraStruct;
    };
    expect(value.struct.id).toBe(ANIMATION_MODULE_TYPE.clip);

    const clipFields = fieldsById(value.struct.fields);
    expect(clipFields.get(ANIMATION_MODULE_FIELD.clipName)).toEqual({
      str: "ramp",
    });
    expect(clipFields.get(ANIMATION_MODULE_FIELD.clipDuration)).toEqual({
      u32: 1000,
    });

    const tracks = clipFields.get(ANIMATION_MODULE_FIELD.clipTracks) as {
      structs: { id: string; elements: Array<{ fields: AroraField[] }> };
    };
    expect(tracks.structs.id).toBe(ANIMATION_MODULE_TYPE.track);
    expect(tracks.structs.elements).toHaveLength(1);

    const trackFields = fieldsById(tracks.structs.elements[0].fields);
    expect(trackFields.get(ANIMATION_MODULE_FIELD.trackId)).toEqual({
      str: "t0",
    });
    expect(trackFields.get(ANIMATION_MODULE_FIELD.trackAnimatable)).toEqual({
      str: "node/x",
    });

    const points = trackFields.get(ANIMATION_MODULE_FIELD.trackPoints) as {
      structs: { id: string; elements: Array<{ fields: AroraField[] }> };
    };
    expect(points.structs.id).toBe(ANIMATION_MODULE_TYPE.keypoint);
    expect(points.structs.elements).toHaveLength(2);

    const firstPoint = fieldsById(points.structs.elements[0].fields);
    expect(firstPoint.get(ANIMATION_MODULE_FIELD.keypointId)).toEqual({
      str: "k0",
    });
    expect(firstPoint.get(ANIMATION_MODULE_FIELD.keypointStamp)).toEqual({
      f32: 0,
    });
    expect(firstPoint.get(ANIMATION_MODULE_FIELD.keypointValue)).toEqual({
      f32: 0,
    });
    // Exactly the three declared Keypoint fields: transitions are dropped,
    // never smuggled through.
    expect(points.structs.elements[0].fields).toHaveLength(3);
  });

  it("skips tracks without a key and points without finite numbers", () => {
    const value = storedClipToModuleValue({
      name: "partial",
      duration: 500,
      tracks: [
        { id: "no-key", name: "no-key", animatableId: "", points: [] },
        {
          id: "t1",
          name: "t1",
          animatableId: "node/y",
          points: [
            { id: "bad", stamp: Number.NaN, value: 1 },
            { id: "ok", stamp: 0.5, value: 2 },
          ],
        },
      ],
    }) as { struct: AroraStruct };
    const clipFields = fieldsById(value.struct.fields);
    const tracks = clipFields.get(ANIMATION_MODULE_FIELD.clipTracks) as {
      structs: { elements: Array<{ fields: AroraField[] }> };
    };
    expect(tracks.structs.elements).toHaveLength(1);
    const trackFields = fieldsById(tracks.structs.elements[0].fields);
    const points = trackFields.get(ANIMATION_MODULE_FIELD.trackPoints) as {
      structs: { elements: unknown[] };
    };
    expect(points.structs.elements).toHaveLength(1);
  });

  it("keeps a clip with no playable tracks as an empty (muted) clip", () => {
    const value = storedClipToModuleValue({
      id: "muted",
      duration: 0,
      tracks: [],
    }) as { struct: AroraStruct };
    const clipFields = fieldsById(value.struct.fields);
    expect(clipFields.get(ANIMATION_MODULE_FIELD.clipName)).toEqual({
      str: "muted",
    });
    expect(clipFields.get(ANIMATION_MODULE_FIELD.clipDuration)).toEqual({
      u32: 1,
    });
    const tracks = clipFields.get(ANIMATION_MODULE_FIELD.clipTracks) as {
      structs: { elements: unknown[] };
    };
    expect(tracks.structs.elements).toHaveLength(0);
  });
});

describe("call builders", () => {
  it("build the declared calls", () => {
    const clipValue = storedClipToModuleValue(rampStoredClip);
    expect(loadAnimationCall(clipValue)).toEqual({
      id: ANIMATION_MODULE_FN.loadAnimation,
      args: [{ id: ANIMATION_MODULE_PARAM.clip, value: clipValue }],
    });
    expect(createPlayerCall("p")).toEqual({
      id: ANIMATION_MODULE_FN.createPlayer,
      args: [{ id: ANIMATION_MODULE_PARAM.playerName, value: { str: "p" } }],
    });
    expect(addInstanceCall(1, 2)).toEqual({
      id: ANIMATION_MODULE_FN.addInstance,
      args: [
        { id: ANIMATION_MODULE_PARAM.player, value: { u32: 1 } },
        { id: ANIMATION_MODULE_PARAM.anim, value: { u32: 2 } },
      ],
    });
  });

  it("callResultU32 reads u32 returns and rejects other shapes", () => {
    expect(callResultU32({ ret: { u32: 7 } })).toBe(7);
    expect(callResultU32({ ret: { f32: 7 } })).toBeNull();
    expect(callResultU32({ ret: null })).toBeNull();
  });
});

describe("animationsGraphSource", () => {
  it("steps the module off the golden dt and lands outputs at the out path", () => {
    const source = animationsGraphSource();
    expect(source.sourceId).toBe(ANIMATIONS_SOURCE_ID);
    const nodes = source.spec.nodes as Array<{
      id: string;
      type: string;
      params: Record<string, unknown>;
    }>;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    expect(byId.get("dt")?.params.path).toBe("arora/dt");
    expect(byId.get("step")?.type).toBe("externalfunction");
    expect(byId.get("step")?.params.function).toBe(ANIMATION_MODULE_FN.step);
    expect(byId.get("step")?.params.param_ids).toEqual([
      ANIMATION_MODULE_PARAM.dtNs,
    ]);
    expect(byId.get("out")?.params.path).toBe(ANIMATIONS_OUT_PATH);
  });
});

describe("decodeTrackOutputs", () => {
  it("decodes the declared TrackOutput structs", () => {
    const outputs = decodeTrackOutputs({
      structs: {
        id: ANIMATION_MODULE_TYPE.trackOutput,
        elements: [
          {
            fields: [
              {
                id: ANIMATION_MODULE_FIELD.outputTrackId,
                value: { str: "t0" },
              },
              {
                id: ANIMATION_MODULE_FIELD.outputDefaultKey,
                value: { str: "node/x" },
              },
              {
                id: ANIMATION_MODULE_FIELD.outputValue,
                value: { f32: 0.25 },
              },
            ],
          },
        ],
      },
    });
    expect(outputs).toEqual([
      { trackId: "t0", defaultKey: "node/x", value: { f32: 0.25 } },
    ]);
  });

  it("decodes unknown shapes to an empty list", () => {
    expect(decodeTrackOutputs(undefined)).toEqual([]);
    expect(decodeTrackOutputs({ float: 1 })).toEqual([]);
    expect(decodeTrackOutputs({ structs: { elements: [{}] } })).toEqual([]);
  });
});
