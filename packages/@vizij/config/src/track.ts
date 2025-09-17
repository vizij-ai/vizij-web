import { RawColor, RawVector2, RawVector3 } from "@semio/utils";

// Track: just a pair name / track type
export type Track = string;

export type TrackValue =
  | string
  | number
  | true
  | RawVector2
  | RawColor
  | RawVector3
  | {}
  | null;

export type TrackValues = {
  [channelName: string]: { [trackName: string]: TrackValue };
};

// Utility functions for TrackValue
export namespace TrackValue {
  /**
   * Converts a TrackValue to number if possible
   * @param value - The TrackValue to convert
   * @returns number if the value is already a number, or undefined if conversion is not possible
   */
  export function toNum(value: TrackValue): number | undefined {
    // Check if the value is already a RawVector3
    if (typeof value === "number") {
      return value;
    }
    return undefined;
  }

  /**
   * Checks if a TrackValue is a number
   * @param value - The TrackValue to check
   * @returns true if the value is a number, false otherwise
   */
  export function isNum(value: TrackValue): value is number {
    return value !== null && typeof value === "number";
  }

  /**
   * Safely converts a TrackValue to number with a default fallback
   * @param value - The TrackValue to convert
   * @param defaultValue - Default number to return if conversion fails
   * @returns number - either the converted value or the default
   */
  export function toNumOrDefault(
    value: TrackValue | undefined,
    defaultValue: number,
  ): number {
    return value !== undefined ? (toNum(value) ?? defaultValue) : defaultValue;
  }

  /**
   * Converts a TrackValue to RawVector3 if possible
   * @param value - The TrackValue to convert
   * @returns RawVector3 if the value is already a RawVector3, or undefined if conversion is not possible
   */
  export function toVec3(value: TrackValue): RawVector3 | undefined {
    // Check if the value is already a RawVector3
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

  /**
   * Checks if a TrackValue is a RawVector3
   * @param value - The TrackValue to check
   * @returns true if the value is a RawVector3, false otherwise
   */
  export function isVec3(value: TrackValue): value is RawVector3 {
    return (
      value !== null &&
      typeof value === "object" &&
      "x" in value &&
      "y" in value &&
      "z" in value
    );
  }

  /**
   * Safely converts a TrackValue to RawVector3 with a default fallback
   * @param value - The TrackValue to convert
   * @param defaultValue - Default RawVector3 to return if conversion fails
   * @returns RawVector3 - either the converted value or the default
   */
  export function toVec3OrDefault(
    value: TrackValue | undefined,
    defaultValue: RawVector3,
  ): RawVector3 {
    return value !== undefined ? (toVec3(value) ?? defaultValue) : defaultValue;
  }
}

// TrackSet: collection of track names
export type TrackSet = Track[];
