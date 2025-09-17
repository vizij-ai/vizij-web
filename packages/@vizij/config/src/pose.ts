import { ChannelSet } from "./channel";
import { TrackValue } from "./track";

// Pose: joins a ChannelSet to actual values with flat array access
export interface Pose {
  channelSet: ChannelSet;
  values: TrackValue[]; // flat array, null for unspecified tracks
  indexMap: { [channelName: string]: { [trackName: string]: number } }; // maps to indices in values array
}

export namespace Pose {
  export function createEmpty(): Pose {
    return {
      channelSet: {},
      values: [],
      indexMap: {},
    };
  }
  // Create a new Pose with the given channelSet
  export function create(channelSet: ChannelSet): Pose {
    const indexMap = createIndexMap(channelSet);
    const totalTracks = getTotalTrackCount(channelSet);
    return {
      channelSet,
      values: new Array(totalTracks).fill(null),
      indexMap,
    };
  }

  // Create a new Pose with initial values using dot notation
  export function createWith(
    channelSet: ChannelSet,
    initialValues: {
      [key: string]:
        | { [trackName: string]: number } // Nested object: { mouth: { x_scale: 1.0 } }
        | number // Dot notation: { "mouth.x_scale": 1.0 }
        | null; // Null values
    },
  ): Pose {
    const pose = create(channelSet);
    for (const [path, value] of Object.entries(initialValues)) {
      if (value === null) {
        continue;
      }

      if (typeof value === "number") {
        setValue(pose, path, value);
      } else {
        for (const [trackName, trackValue] of Object.entries(value)) {
          setValue(pose, path, trackName, trackValue);
        }
      }
    }
    return pose;
  }

  // Create indexMap from a channelSet
  export function createIndexMap(channelSet: ChannelSet): {
    [channelName: string]: { [trackName: string]: number };
  } {
    const indexMap: { [channelName: string]: { [trackName: string]: number } } =
      {};
    let currentIndex = 0;

    for (const [channelName, tracks] of Object.entries(channelSet)) {
      indexMap[channelName] = {};
      for (const trackName of tracks) {
        indexMap[channelName][trackName] = currentIndex++;
      }
    }

    return indexMap;
  }

  // Get total number of tracks in a channelSet
  export function getTotalTrackCount(channelSet: ChannelSet): number {
    return Object.values(channelSet).reduce(
      (total, tracks) => total + tracks.length,
      0,
    );
  }

  // Get the index for a specific channel and track
  export function getIndex(
    pose: Pose,
    channelName: string,
    trackName: string,
  ): number | undefined;
  export function getIndex(pose: Pose, path: string): number | undefined;
  export function getIndex(
    pose: Pose,
    channelNameOrPath: string,
    trackName?: string,
  ): number | undefined {
    if (trackName !== undefined) {
      // Two-parameter version: getIndex(pose, "mouth", "x_scale")
      return pose.indexMap[channelNameOrPath]?.[trackName];
    } else {
      // Single-parameter version: getIndex(pose, "mouth.x_scale")
      const [channelName, track] = channelNameOrPath.split(".");
      if (!channelName || !track) {
        return undefined;
      }
      return pose.indexMap[channelName]?.[track];
    }
  }

  // Set a value for a specific channel and track
  export function setValue(
    pose: Pose,
    channelName: string,
    trackName: string,
    value: number | null,
  ): void;
  export function setValue(
    pose: Pose,
    path: string,
    value: number | null,
  ): void;
  export function setValue(
    pose: Pose,
    channelNameOrPath: string,
    trackNameOrValue: string | number | null,
    value?: number | null,
  ): void {
    if (typeof trackNameOrValue === "string" && value !== undefined) {
      // Three-parameter version: setValue(pose, "mouth", "x_scale", 1.2)
      const index = getIndex(pose, channelNameOrPath, trackNameOrValue);
      if (index !== undefined) {
        pose.values[index] = value;
      }
    } else {
      // Two-parameter version: setValue(pose, "mouth.x_scale", 1.2)
      const index = getIndex(pose, channelNameOrPath);
      if (index !== undefined) {
        pose.values[index] = trackNameOrValue as number | null;
      }
    }
  }

  // Get a value for a specific channel and track
  export function getValue(
    pose: Pose,
    channelName: string,
    trackName: string,
  ): TrackValue;
  export function getValue(pose: Pose, path: string): TrackValue;
  export function getValue(
    pose: Pose,
    channelNameOrPath: string,
    trackName?: string,
  ): TrackValue {
    const index =
      trackName !== undefined
        ? getIndex(pose, channelNameOrPath, trackName)
        : getIndex(pose, channelNameOrPath);
    return index !== undefined ? pose.values[index] : null;
  }
}
