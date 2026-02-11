import { describe, expect, it } from "vitest";
import { buildRuntimeBaseBundle } from "../runtimeBundle";

describe("buildRuntimeBaseBundle", () => {
  it("uses provided world and animatables", () => {
    const world = {} as any;
    const animatables = {} as any;
    const bundle = buildRuntimeBaseBundle({
      namespace: "vizij",
      world,
      animatables,
      loadedBundle: null,
    });
    expect(bundle?.glb.kind).toBe("world");
    if (bundle?.glb.kind === "world") {
      expect(bundle.glb.world).toBe(world);
      expect(bundle.glb.animatables).toBe(animatables);
    }
  });
});
