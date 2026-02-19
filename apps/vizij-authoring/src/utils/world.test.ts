import { describe, expect, it } from "vitest";
import { resolveWorldRoot } from "./world";

describe("resolveWorldRoot", () => {
  it("prefers metadata root bounds when present", () => {
    const result = resolveWorldRoot({
      root_a: {
        id: "root_a",
        type: "group",
        root: false,
        rootBounds: {
          center: { x: 0, y: 0 },
          size: { x: 2, y: 2 },
        },
      },
      root_b: {
        id: "root_b",
        type: "group",
        root: true,
      },
    } as any);

    expect(result).toEqual({
      status: "resolved",
      rootId: "root_a",
      strategy: "metadata",
    });
  });

  it("falls back to derived root flags when metadata bounds are missing", () => {
    const result = resolveWorldRoot({
      root_a: {
        id: "root_a",
        type: "group",
        root: true,
      },
    } as any);

    expect(result).toEqual({
      status: "resolved",
      rootId: "root_a",
      strategy: "derived",
    });
  });

  it("returns blocked_recoverable when no root can be resolved", () => {
    const result = resolveWorldRoot({
      shape_1: {
        id: "shape_1",
        type: "shape",
      },
    } as any);

    expect(result.status).toBe("blocked_recoverable");
    if (result.status !== "blocked_recoverable") {
      return;
    }
    expect(result.message).toMatch(/Unable to resolve a Vizij root/i);
  });
});
