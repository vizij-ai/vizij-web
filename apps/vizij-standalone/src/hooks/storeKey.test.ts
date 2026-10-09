import { describe, expect, it } from "vitest";
import { toStoreKey } from "./storeKey";

const NS = "vizij-standalone";

describe("toStoreKey", () => {
  it("drops the runtime namespace", () => {
    expect(toStoreKey(`${NS}/rig/face/standard/jaw_open`, NS)).toBe(
      "rig/face/standard/jaw_open",
    );
  });

  it("publishes a leading-slash path joined to the namespace under the path", () => {
    expect(toStoreKey(`${NS}//face_tran_rot_c.rot`, NS)).toBe(
      "face_tran_rot_c.rot",
    );
  });

  it("drops leading slashes and collapses runs of slashes", () => {
    expect(toStoreKey("/rig/face/x")).toBe("rig/face/x");
    expect(toStoreKey("//a//b///c", NS)).toBe("a/b/c");
  });

  it("gives the namespaced and raw spellings of an input one key", () => {
    // The spellings the runtime's constraint map lists for an input authored
    // as `/rig/face/x`: namespaced and raw.
    const spellings = [`${NS}//rig/face/x`, "/rig/face/x", `${NS}/rig/face/x`];
    expect(new Set(spellings.map((path) => toStoreKey(path, NS)))).toEqual(
      new Set(["rig/face/x"]),
    );
  });

  it("leaves no empty segment in a key with a leading or doubled slash", () => {
    for (const path of [`${NS}//a.b`, "/a//b", `//${NS}//a`]) {
      const key = toStoreKey(path, NS);
      expect(key.split("/").every((segment) => segment.length > 0)).toBe(true);
    }
  });

  it("keeps a key's other characters as they are", () => {
    expect(toStoreKey("joint1.position", NS)).toBe("joint1.position");
    expect(toStoreKey("background/color", NS)).toBe("background/color");
  });

  it("keeps a first segment that only starts with the namespace", () => {
    expect(toStoreKey(`${NS}-2/x`, NS)).toBe(`${NS}-2/x`);
  });

  it("keeps the namespace segment when no namespace is given", () => {
    expect(toStoreKey(`${NS}//x`)).toBe(`${NS}/x`);
  });
});
