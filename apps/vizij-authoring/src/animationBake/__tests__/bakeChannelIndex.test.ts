import { describe, expect, it } from "vitest";
import { buildBakeChannelIndex } from "../bakeChannelIndex";

const ID = "anim-l-lid-translation";

const world = {
  lid: {
    id: "lid",
    name: "L_Lid",
    features: { translation: { animated: true, value: ID } },
  },
};

describe("buildBakeChannelIndex", () => {
  it("maps a vector feature to one path and three canonical channels", () => {
    const specs = buildBakeChannelIndex({
      world,
      animatables: { [ID]: { default: { x: 0, y: 0, z: 0 } } },
    });

    expect(specs).toHaveLength(1);
    expect(specs[0]!.path).toBe(ID);
    expect(specs[0]!.channels).toEqual([
      "/propsrig/l_lid/translation/x",
      "/propsrig/l_lid/translation/y",
      "/propsrig/l_lid/translation/z",
    ]);
  });

  it("maps a scalar feature to a single /value channel", () => {
    const specs = buildBakeChannelIndex({
      world: {
        lid: {
          id: "lid",
          name: "LBLid",
          features: { lidcurve: { animated: true, value: ID } },
        },
      },
      animatables: { [ID]: { default: { value: 0 } } },
    });

    expect(specs[0]!.channels).toEqual(["/propsrig/lblid/lidcurve/value"]);
  });

  it("keeps only paths the exported graph declares", () => {
    expect(
      buildBakeChannelIndex({
        world,
        animatables: { [ID]: { default: { x: 0, y: 0, z: 0 } } },
        restrictToPaths: new Set([ID]),
      }),
    ).toHaveLength(1);

    expect(
      buildBakeChannelIndex({
        world,
        animatables: { [ID]: { default: { x: 0, y: 0, z: 0 } } },
        restrictToPaths: new Set(["something-else"]),
      }),
    ).toEqual([]);
  });

  it("skips features that are not animated or have no animatable", () => {
    expect(
      buildBakeChannelIndex({
        world: {
          a: {
            name: "A",
            features: {
              translation: { animated: false, value: ID },
              scale: { animated: true },
            },
          },
        },
        animatables: {},
      }),
    ).toEqual([]);
  });
});
