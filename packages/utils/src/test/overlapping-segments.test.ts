import { test, expect } from "vitest";
import { overlappingSegments } from "../overlapping-segments";

test("overlappingSegments", () => {
  const input1 = [
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
  ] as [number, number][];
  const output1 = overlappingSegments(input1);
  expect(output1).toEqual([[1, 5]]);

  const input2 = [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
  ] as [number, number][];
  const output2 = overlappingSegments(input2);
  expect(output2).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
  ]);

  const input3 = [
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 5],
  ] as [number, number][];
  const output3 = overlappingSegments(input3);
  expect(output3).toEqual([[1, 5]]);

  const input4 = [
    [0.1, 0.3],
    [0.35, 0.4],
    [0.36, 0.5],
    [0.55, 0.8],
  ] as [number, number][];
  const output4 = overlappingSegments(input4);
  expect(output4).toEqual([
    [0.1, 0.3],
    [0.35, 0.5],
    [0.55, 0.8],
  ]);

  const input5 = [
    [0.55, 0.8],
    [0.35, 0.4],
    [0.1, 0.3],
    [0.36, 0.5],
  ] as [number, number][];
  const output5 = overlappingSegments(input5);
  expect(output5).toEqual([
    [0.1, 0.3],
    [0.35, 0.5],
    [0.55, 0.8],
  ]);

  const input6 = [
    [0.1, 0.3],
    [0.35, 0.4],
    [0.51, 0.51],
    [0.36, 0.5],
    [0.55, 0.8],
    [0.9, 1.0],
  ] as [number, number][];
  const output6 = overlappingSegments(input6);
  expect(output6).toEqual([
    [0.1, 0.3],
    [0.35, 0.5],
    [0.51, 0.51],
    [0.55, 0.8],
    [0.9, 1.0],
  ]);
});
