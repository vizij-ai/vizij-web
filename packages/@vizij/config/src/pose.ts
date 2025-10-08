import { ChannelSet } from "./channel";
import { TrackValue } from "./track";

// Pose: joins a ChannelSet to actual values with flat array access
export interface Pose {
  channelSet: ChannelSet;
  values: TrackValue[]; // flat array, null for unspecified tracks
  indexMap: { [channelName: string]: { [trackName: string]: number } }; // maps to indices in values array
}

function createEmpty(): Pose {
  return {
    channelSet: {},
    values: [],
    indexMap: {},
  };
}

function create(channelSet: ChannelSet): Pose {
  const indexMap = createIndexMap(channelSet);
  const totalTracks = getTotalTrackCount(channelSet);
  return {
    channelSet,
    values: new Array(totalTracks).fill(null),
    indexMap,
  };
}

function createWith(
  channelSet: ChannelSet,
  initialValues: {
    [key: string]: { [trackName: string]: number } | number | null;
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

function createIndexMap(channelSet: ChannelSet): {
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

function getTotalTrackCount(channelSet: ChannelSet): number {
  return Object.values(channelSet).reduce(
    (total, tracks) => total + tracks.length,
    0,
  );
}

function getIndex(
  pose: Pose,
  channelName: string,
  trackName: string,
): number | undefined;
function getIndex(pose: Pose, path: string): number | undefined;
function getIndex(
  pose: Pose,
  channelNameOrPath: string,
  trackName?: string,
): number | undefined {
  if (trackName !== undefined) {
    return pose.indexMap[channelNameOrPath]?.[trackName];
  }
  const [channelName, track] = channelNameOrPath.split(".");
  if (!channelName || !track) {
    return undefined;
  }
  return pose.indexMap[channelName]?.[track];
}

function setValue(
  pose: Pose,
  channelName: string,
  trackName: string,
  value: number | null,
): void;
function setValue(pose: Pose, path: string, value: number | null): void;
function setValue(
  pose: Pose,
  channelNameOrPath: string,
  trackNameOrValue: string | number | null,
  value?: number | null,
): void {
  if (typeof trackNameOrValue === "string" && value !== undefined) {
    const index = getIndex(pose, channelNameOrPath, trackNameOrValue);
    if (index !== undefined) {
      pose.values[index] = value;
    }
    return;
  }

  const index = getIndex(pose, channelNameOrPath);
  if (index !== undefined) {
    pose.values[index] = trackNameOrValue as number | null;
  }
}

function getValue(
  pose: Pose,
  channelName: string,
  trackName: string,
): TrackValue;
function getValue(pose: Pose, path: string): TrackValue;
function getValue(
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

export const Pose = {
  createEmpty,
  create,
  createWith,
  createIndexMap,
  getTotalTrackCount,
  getIndex,
  setValue,
  getValue,
} as const;
