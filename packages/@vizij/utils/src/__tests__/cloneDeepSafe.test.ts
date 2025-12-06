import { describe, it, expect } from "vitest";
import { cloneDeepSafe } from "../cloneDeepSafe";

describe("cloneDeepSafe", () => {
  it("should clone primitive values", () => {
    expect(cloneDeepSafe(1)).toBe(1);
    expect(cloneDeepSafe("string")).toBe("string");
    expect(cloneDeepSafe(true)).toBe(true);
    expect(cloneDeepSafe(null)).toBe(null);
    expect(cloneDeepSafe(undefined)).toBe(undefined);
  });

  it("should clone objects", () => {
    const obj = { a: 1, b: { c: 2 } };
    const clone = cloneDeepSafe(obj);
    expect(clone).toEqual(obj);
    expect(clone).not.toBe(obj);
    expect(clone.b).not.toBe(obj.b);
  });

  it("should clone arrays", () => {
    const arr = [1, { a: 2 }];
    const clone = cloneDeepSafe(arr);
    expect(clone).toEqual(arr);
    expect(clone).not.toBe(arr);
    expect(clone[1]).not.toBe(arr[1]);
  });

  it("should clone Date", () => {
    const date = new Date();
    const clone = cloneDeepSafe(date);
    expect(clone).toEqual(date);
    expect(clone).not.toBe(date);
    expect(clone.getTime()).toBe(date.getTime());
  });

  it("should clone RegExp", () => {
    const regex = /abc/gi;
    const clone = cloneDeepSafe(regex);
    expect(clone).toEqual(regex);
    expect(clone).not.toBe(regex);
    expect(clone.source).toBe(regex.source);
    expect(clone.flags).toBe(regex.flags);
  });

  it("should clone Map", () => {
    const map = new Map<string, any>([
      ["a", 1],
      ["b", { c: 2 }],
    ]);
    const clone = cloneDeepSafe(map);
    expect(clone).toEqual(map);
    expect(clone).not.toBe(map);
    expect(clone.get("b")).not.toBe(map.get("b"));
  });

  it("should clone Set", () => {
    const set = new Set([1, { a: 2 }]);
    const clone = cloneDeepSafe(set);
    expect(clone).toEqual(set);
    expect(clone).not.toBe(set);
    const arr = Array.from(set);
    const cloneArr = Array.from(clone);
    // @ts-ignore
    expect(cloneArr[1]).not.toBe(arr[1]);
  });

  it("should clone TypedArray", () => {
    const typedArr = new Uint8Array([1, 2, 3]);
    const clone = cloneDeepSafe(typedArr);
    expect(clone).toEqual(typedArr);
    expect(clone).not.toBe(typedArr);
  });

  it("should handle circular references", () => {
    const obj: any = { a: 1 };
    obj.self = obj;
    const clone = cloneDeepSafe(obj);
    expect(clone.a).toBe(1);
    expect(clone.self).toBe(clone);
    expect(clone.self).not.toBe(obj);
  });
});
