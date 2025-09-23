/// <reference types="vitest" />
import { isConnectionCompatible } from "../utils/connectionUtils";

test("compatible when types identical", () => {
  const src = { id: "a", type: "foo" } as any;
  const tgt = { id: "b", type: "foo" } as any;
  expect(isConnectionCompatible(src, tgt).ok).toBe(true);
});

test("compatible when source is constant", () => {
  const src = { id: "a", type: "constant" } as any;
  const tgt = { id: "b", type: "some" } as any;
  expect(isConnectionCompatible(src, tgt).ok).toBe(true);
});

test("compatible when target handle contains any", () => {
  const src = { id: "a", type: "foo" } as any;
  const tgt = { id: "b", type: "bar" } as any;
  expect(isConnectionCompatible(src, tgt, "out", "any_in").ok).toBe(true);
});

test("incompatible otherwise", () => {
  const src = { id: "a", type: "foo" } as any;
  const tgt = { id: "b", type: "bar" } as any;
  const res = isConnectionCompatible(src, tgt);
  expect(res.ok).toBe(false);
  expect(res.reason).toMatch(/Incompatible types/);
});
