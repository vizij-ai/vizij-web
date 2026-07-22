import { describe, expect, it } from "vitest";
import {
  ANIMATION_MODULE_FIELD,
  ANIMATION_MODULE_FN,
  ANIMATION_MODULE_PARAM,
  ANIMATION_MODULE_TYPE,
  ANIMATION_PLAYERS_PATH,
  ANIMATIONS_SOURCE_ID,
  addInstanceCall,
  animationsGraphSource,
  callResultU32,
  createPlayerCall,
  decodePlayerStates,
  loadAnimationCall,
  pauseCall,
  playCall,
  removeInstanceCall,
  seekCall,
  setLoopCall,
  setSpeedCall,
  setWeightCall,
  stopCall,
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
          // Authored timing handles ride through as TransitionHandle arrays.
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
  it("emits the module's declared AnimationClip structure with timing handles", () => {
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

    // Five declared Keypoint fields; authored handles fill the arrays and
    // absent sides stay empty (the engine's default ease).
    const firstPoint = fieldsById(points.structs.elements[0].fields);
    expect(points.structs.elements[0].fields).toHaveLength(5);
    expect(
      firstPoint.get(ANIMATION_MODULE_FIELD.keypointTransitionsIn),
    ).toEqual({
      structs: {
        id: ANIMATION_MODULE_TYPE.transitionHandle,
        elements: [
          {
            fields: [
              { id: ANIMATION_MODULE_FIELD.handleX, value: { f32: 1 } },
              { id: ANIMATION_MODULE_FIELD.handleY, value: { f32: 1 } },
            ],
          },
        ],
      },
    });
    const secondPoint = fieldsById(points.structs.elements[1].fields);
    expect(
      secondPoint.get(ANIMATION_MODULE_FIELD.keypointTransitionsIn),
    ).toEqual({
      structs: { id: ANIMATION_MODULE_TYPE.transitionHandle, elements: [] },
    });
  });

  it("resolves final store keys at load: one track per target", () => {
    const value = storedClipToModuleValue(rampStoredClip, (key) => [
      `rig/quori/${key}`,
      key,
    ]) as { struct: AroraStruct };
    const clipFields = fieldsById(value.struct.fields);
    const tracks = clipFields.get(ANIMATION_MODULE_FIELD.clipTracks) as {
      structs: { elements: Array<{ fields: AroraField[] }> };
    };
    expect(tracks.structs.elements).toHaveLength(2);
    const first = fieldsById(tracks.structs.elements[0].fields);
    const second = fieldsById(tracks.structs.elements[1].fields);
    expect(first.get(ANIMATION_MODULE_FIELD.trackAnimatable)).toEqual({
      str: "rig/quori/node/x",
    });
    expect(first.get(ANIMATION_MODULE_FIELD.trackId)).toEqual({ str: "t0" });
    expect(second.get(ANIMATION_MODULE_FIELD.trackAnimatable)).toEqual({
      str: "node/x",
    });
    // The duplicate keeps a distinct track identity.
    expect(second.get(ANIMATION_MODULE_FIELD.trackId)).toEqual({ str: "t0~1" });
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
  it("build the declared setup calls", () => {
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

  it("build the declared transport calls", () => {
    expect(playCall(3)).toEqual({
      id: ANIMATION_MODULE_FN.play,
      args: [{ id: ANIMATION_MODULE_PARAM.playPlayer, value: { u32: 3 } }],
    });
    expect(pauseCall(3)).toEqual({
      id: ANIMATION_MODULE_FN.pause,
      args: [{ id: ANIMATION_MODULE_PARAM.pausePlayer, value: { u32: 3 } }],
    });
    expect(stopCall(3)).toEqual({
      id: ANIMATION_MODULE_FN.stop,
      args: [{ id: ANIMATION_MODULE_PARAM.stopPlayer, value: { u32: 3 } }],
    });
    // Seconds→nanoseconds happens at the caller; the builder carries u64 ns.
    expect(seekCall(3, 1.5e9)).toEqual({
      id: ANIMATION_MODULE_FN.seek,
      args: [
        { id: ANIMATION_MODULE_PARAM.seekPlayer, value: { u32: 3 } },
        {
          id: ANIMATION_MODULE_PARAM.seekTimeNs,
          value: { u64: 1_500_000_000 },
        },
      ],
    });
    expect(setSpeedCall(3, 2)).toEqual({
      id: ANIMATION_MODULE_FN.setSpeed,
      args: [
        { id: ANIMATION_MODULE_PARAM.speedPlayer, value: { u32: 3 } },
        { id: ANIMATION_MODULE_PARAM.speedValue, value: { f32: 2 } },
      ],
    });
    expect(setLoopCall(3, "once")).toEqual({
      id: ANIMATION_MODULE_FN.setLoop,
      args: [
        { id: ANIMATION_MODULE_PARAM.loopPlayer, value: { u32: 3 } },
        { id: ANIMATION_MODULE_PARAM.loopMode, value: { str: "once" } },
      ],
    });
    expect(setWeightCall(3, 4, 0.5)).toEqual({
      id: ANIMATION_MODULE_FN.setWeight,
      args: [
        { id: ANIMATION_MODULE_PARAM.weightPlayer, value: { u32: 3 } },
        { id: ANIMATION_MODULE_PARAM.weightInstance, value: { u32: 4 } },
        { id: ANIMATION_MODULE_PARAM.weightValue, value: { f32: 0.5 } },
      ],
    });
    expect(removeInstanceCall(3, 4)).toEqual({
      id: ANIMATION_MODULE_FN.removeInstance,
      args: [
        { id: ANIMATION_MODULE_PARAM.removePlayer, value: { u32: 3 } },
        { id: ANIMATION_MODULE_PARAM.removeInstance, value: { u32: 4 } },
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
  it("steps the module off the golden dt and applies the batch onto its keys", () => {
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
    // The path-less output applies each TrackOutput onto the key it names.
    const apply = byId.get("apply");
    expect(apply?.type).toBe("output");
    expect(apply?.params.path).toBeUndefined();
    expect(apply?.params.key_field).toBe(
      ANIMATION_MODULE_FIELD.outputDefaultKey,
    );
    expect(apply?.params.value_field).toBe(ANIMATION_MODULE_FIELD.outputValue);
    // The player_states feedback lands at the players path.
    expect(byId.get("states")?.params.function).toBe(
      ANIMATION_MODULE_FN.playerStates,
    );
    expect(byId.get("states-out")?.params.path).toBe(ANIMATION_PLAYERS_PATH);
  });
});

describe("decodePlayerStates", () => {
  it("decodes the declared PlayerState structs", () => {
    const states = decodePlayerStates({
      structs: {
        id: ANIMATION_MODULE_TYPE.playerState,
        elements: [
          {
            fields: [
              { id: ANIMATION_MODULE_FIELD.statePlayer, value: { u32: 2 } },
              {
                id: ANIMATION_MODULE_FIELD.stateState,
                value: { str: "playing" },
              },
              {
                id: ANIMATION_MODULE_FIELD.stateTimeNs,
                value: { u64: 250_000_000 },
              },
              {
                id: ANIMATION_MODULE_FIELD.stateDurationNs,
                value: { u64: 1_000_000_000 },
              },
              { id: ANIMATION_MODULE_FIELD.stateSpeed, value: { f32: 2 } },
            ],
          },
        ],
      },
    });
    expect(states).toEqual([
      {
        player: 2,
        state: "playing",
        time: 0.25,
        duration: 1,
        speed: 2,
      },
    ]);
  });

  it("decodes unknown shapes to an empty list", () => {
    expect(decodePlayerStates(undefined)).toEqual([]);
    expect(decodePlayerStates({ f32: 1 })).toEqual([]);
    expect(decodePlayerStates({ structs: {} })).toEqual([]);
  });
});
