/**
 * The animation module's ids mirrored in `engine/animationModule.ts` are the
 * ones its shipped header declares. The header comes from the module's Rust
 * declaration, so a renumbered function or parameter fails here instead of
 * dispatching to nothing. Structure field ids are not part of a header; the
 * structure ids a header names (parameter and return types) are checked.
 */
import { headerJson } from "@vizij/animation-module";
import { describe, expect, it } from "vitest";
import {
  ANIMATION_MODULE_FN,
  ANIMATION_MODULE_PARAM,
  ANIMATION_MODULE_TYPE,
} from "../engine/animationModule";

interface HeaderParameter {
  id: string;
  name: string;
  type: { kind: string; id: string };
}

interface HeaderFunction {
  id: string;
  name: string;
  parameters: HeaderParameter[];
  ret: { kind: string; id: string };
}

const header = JSON.parse(headerJson) as { exports: HeaderFunction[] };

function exported(name: string): HeaderFunction {
  const found = header.exports.find((fn) => fn.name === name);
  if (!found) throw new Error(`the header exports no function ${name}`);
  return found;
}

function parameter(fnName: string, name: string): HeaderParameter {
  const found = exported(fnName).parameters.find((p) => p.name === name);
  if (!found) throw new Error(`${fnName} has no parameter ${name}`);
  return found;
}

/** Each mirrored function, by the name the module declares it under. */
const FUNCTIONS: Record<keyof typeof ANIMATION_MODULE_FN, string> = {
  loadAnimation: "load_animation",
  createPlayer: "create_player",
  addInstance: "add_instance",
  step: "step",
  play: "play",
  pause: "pause",
  stop: "stop",
  seek: "seek",
  setSpeed: "set_speed",
  setLoop: "set_loop",
  setWeight: "set_weight",
  removeInstance: "remove_instance",
  playerStates: "player_states",
};

/** Each mirrored parameter, as `[function, parameter]` declared names. */
const PARAMETERS: Record<
  keyof typeof ANIMATION_MODULE_PARAM,
  [string, string]
> = {
  clip: ["load_animation", "clip"],
  playerName: ["create_player", "name"],
  player: ["add_instance", "player"],
  anim: ["add_instance", "anim"],
  dtNs: ["step", "dt_ns"],
  playPlayer: ["play", "player"],
  pausePlayer: ["pause", "player"],
  stopPlayer: ["stop", "player"],
  seekPlayer: ["seek", "player"],
  seekTimeNs: ["seek", "time_ns"],
  speedPlayer: ["set_speed", "player"],
  speedValue: ["set_speed", "speed"],
  loopPlayer: ["set_loop", "player"],
  loopMode: ["set_loop", "mode"],
  weightPlayer: ["set_weight", "player"],
  weightInstance: ["set_weight", "instance"],
  weightValue: ["set_weight", "weight"],
  removePlayer: ["remove_instance", "player"],
  removeInstance: ["remove_instance", "instance"],
};

describe("the animation module ids match its shipped header", () => {
  it.each(Object.entries(FUNCTIONS))("function %s", (key, name) => {
    expect(ANIMATION_MODULE_FN[key as keyof typeof ANIMATION_MODULE_FN]).toBe(
      exported(name).id,
    );
  });

  it.each(Object.entries(PARAMETERS))("parameter %s", (key, [fnName, name]) => {
    expect(
      ANIMATION_MODULE_PARAM[key as keyof typeof ANIMATION_MODULE_PARAM],
    ).toBe(parameter(fnName, name).id);
  });

  it("the structure ids the header names", () => {
    expect(ANIMATION_MODULE_TYPE.clip).toBe(
      parameter("load_animation", "clip").type.id,
    );
    expect(ANIMATION_MODULE_TYPE.trackOutput).toBe(exported("step").ret.id);
    expect(ANIMATION_MODULE_TYPE.playerState).toBe(
      exported("player_states").ret.id,
    );
  });
});
