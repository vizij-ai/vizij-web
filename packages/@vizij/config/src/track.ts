import { RawColor, RawVector2, RawVector3 } from "@vizij/utils";

// Track: just a pair name / track type
export type Track = string;

export type TrackValue =
  | string
  | number
  | true
  | RawVector2
  | RawColor
  | RawVector3
  | Record<string, unknown>
  | null;

export type TrackValues = {
  [channelName: string]: { [trackName: string]: TrackValue };
};

// Utility functions for TrackValue
function toNum(value: TrackValue): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  return undefined;
}

function isNum(value: TrackValue): value is number {
  return value !== null && typeof value === "number";
}

function toNumOrDefault(
  value: TrackValue | undefined,
  defaultValue: number,
): number {
  return value !== undefined ? (toNum(value) ?? defaultValue) : defaultValue;
}

function toVec3(value: TrackValue): RawVector3 | undefined {
  if (
    value &&
    typeof value === "object" &&
    "x" in value &&
    "y" in value &&
    "z" in value
  ) {
    return value as RawVector3;
  }
  return undefined;
}

function isVec3(value: TrackValue): value is RawVector3 {
  return (
    value !== null &&
    typeof value === "object" &&
    "x" in value &&
    "y" in value &&
    "z" in value
  );
}

function toVec3OrDefault(
  value: TrackValue | undefined,
  defaultValue: RawVector3,
): RawVector3 {
  return value !== undefined ? (toVec3(value) ?? defaultValue) : defaultValue;
}

export const TrackValue = {
  toNum,
  isNum,
  toNumOrDefault,
  toVec3,
  isVec3,
  toVec3OrDefault,
} as const;

// TrackSet: collection of track names
export type TrackSet = Track[];
