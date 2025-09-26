import { RawValue, RawVector2, RawVector3 } from "utils";
import { Track, TrackValue, TrackValues } from "./track";
import { Pose } from "./pose";

type axis = "x" | "y" | "z" | "morph";

export type LowLevelRigChannelDefinition = {
  shapeKey: string;
  tracks: {
    [trackName: string]: LowLevelRigTrackDefinition;
  };
};

export type LowLevelRigTrackDefinition = {
  key?: string;
  axis?: axis[];
  extraSrcChannels?: string | string[];
  mapFunc?: (
    rig: VizijLowRig,
    channelName: string,
    trackName: string,
    channelValues: TrackValues,
  ) => any | undefined;
};

export type LowLevelRigDefinition = {
  channels: {
    [channelName: string]: LowLevelRigChannelDefinition;
  };
  bounds: {
    center: RawVector2;
    size: RawVector2;
  };
  initialValues?: { name: string; value: RawValue }[];
};

export type VizijLowRigTrackMap = {
  channelRig: LowLevelRigChannelDefinition;
  trackRig: LowLevelRigTrackDefinition;
  baseValue?: TrackValue;
  trackName: string;
  shapeId: string;
};

export class VizijLowRig {
  name: string;
  rootId: string;
  map: Record<string, Record<Track, VizijLowRigTrackMap>>;
  trackBounds: Record<Track, { min: TrackValue; max: TrackValue }>;
  applyFunc: (
    id: string,
    namespace: string,
    value: RawValue | ((current: RawValue | undefined) => RawValue | undefined),
  ) => void;

  constructor(init: {
    name: string;
    rootId: string;
    rig: LowLevelRigDefinition;
    animatables: Record<string, any>;
    applyFunc: (
      id: string,
      namespace: string,
      value:
        | RawValue
        | ((current: RawValue | undefined) => RawValue | undefined),
    ) => void;
  }) {
    const debug = false;
    this.name = init.name;
    this.rootId = init.rootId;
    this.map = {};
    this.trackBounds = {};
    this.applyFunc = init.applyFunc;

    if (debug) {
      console.log("VizijLowRig init:", init);
    }

    if (
      init.rig === undefined ||
      Object.keys(init.rig).length === 0 ||
      init.animatables === undefined ||
      Object.keys(init.animatables).length === 0
    ) {
      return;
    }
    // Build full mappings by iterating through search.full
    Object.entries(init.rig.channels).forEach(([channelName, channelRig]) => {
      Object.entries(channelRig.tracks).forEach(([trackName, trackRig]) => {
        const isRot =
          trackName.toLowerCase() === "rot" ||
          trackName.toLowerCase() === "rotation";
        const isPos =
          trackName.toLowerCase() === "pos" ||
          trackName.toLowerCase() === "position";
        const isScale = trackName.toLowerCase() === "scale";
        const isMorph = trackName.toLowerCase() === "morph";

        const searchKey =
          channelRig.shapeKey +
          " " +
          (isMorph
            ? "Key " + ("key" in trackRig ? trackRig.key : "1")
            : isPos
              ? "translation"
              : isRot
                ? "rotation"
                : isScale
                  ? "scale"
                  : trackName);

        const foundAnimatable = Object.values(init.animatables).find(
          (anim) => anim.name === searchKey,
        );

        if (debug) {
          console.log(
            " VizijLowRig init channel:",
            channelName,
            searchKey,
            "track:",
            trackName,
            "foundAnimatable:",
            foundAnimatable,
          );
        }
        if (foundAnimatable) {
          if (!this.map[channelName]) {
            this.map[channelName] = {};
          }
          this.map[channelName][trackName] = {
            channelRig,
            trackRig,
            baseValue: foundAnimatable.default || null,
            trackName,
            shapeId: foundAnimatable.id,
          };
        }
      });
    });
  }

  scaleV3fTrackValue(
    channelName: string,
    trackName: Track,
    channelValues: TrackValues,
    scale: RawVector3,
  ) {
    const trackValues = channelValues[channelName];
    const base = TrackValue.toVec3OrDefault(
      this.map[channelName][trackName].baseValue,
      {
        x: 1,
        y: 1,
        z: 1,
      },
    );
    return {
      x: TrackValue.toNumOrDefault(trackValues["x_pos"], 0) * scale.x + base.x,
      y: TrackValue.toNumOrDefault(trackValues["y_pos"], 0) * scale.y + base.y,
      z: TrackValue.toNumOrDefault(trackValues["z_pos"], 0) * scale.z + base.z,
    };
  }

  apply(pose: Pose) {
    if (this.map === undefined || Object.keys(this.map).length === 0) {
      return;
    }
    Object.entries(this.map).forEach(([channelName, tracks]) => {
      Object.entries(tracks).forEach(([trackName, trackMap]) => {
        const channelValues: TrackValues = {};
        var srcChannels = [channelName];
        if (trackMap.trackRig.extraSrcChannels) {
          srcChannels = srcChannels.concat(trackMap.trackRig.extraSrcChannels);
        }

        for (const srcChannel of Array.isArray(srcChannels)
          ? srcChannels
          : [srcChannels]) {
          if (pose.channelSet[srcChannel]) {
            channelValues[srcChannel] = {};
            for (const trackName of pose.channelSet[srcChannel]) {
              const value = Pose.getValue(pose, srcChannel, trackName);
              if (value !== undefined && value !== null) {
                channelValues[srcChannel][trackName] = value!;
              }
            }
          }
        }
        if (Object.keys(channelValues).length > 0) {
          let newValue: any;
          const mapfunc = trackMap.trackRig.mapFunc ?? VizijDefaultFaceMapFunc;
          newValue = mapfunc(this, channelName, trackName, channelValues);
          this.applyFunc(trackMap.shapeId, "default", newValue);
        }
      });
    });
  }

  getBaseTrackValueAsV3forNumber(
    channelName: string,
    trackName: Track,
  ): RawVector3 | number {
    var res = this.map?.[channelName]?.[trackName]?.baseValue;
    if (res === undefined) {
      if (trackName.toLocaleLowerCase() === "scale") {
        res = { x: 1, y: 1, z: 1 };
      }
      if (trackName.toLocaleLowerCase() === "morph") {
        res = 0;
      }
      res = { x: 0, y: 0, z: 0 };
    }
    return TrackValue.toVec3OrDefault(res, { x: 0, y: 0, z: 0 });
  }
}

function VizijDefaultFaceMapFunc(
  rig: VizijLowRig,
  channelName: string,
  trackName: string,
  channelValues: TrackValues,
): any {
  // Default mapping function only uses single channel mapping
  if (channelValues === null || Object.keys(channelValues).length === 0) {
    return rig.getBaseTrackValueAsV3forNumber(channelName, trackName);
  }

  const channel = channelValues[Object.keys(channelValues)[0]];
  if (trackName.toLowerCase() === "pos") {
    const base = rig.getBaseTrackValueAsV3forNumber(
      channelName,
      trackName,
    ) as RawVector3;
    return {
      x: TrackValue.toNumOrDefault(channel["x_pos"], 0) + base.x,
      y: TrackValue.toNumOrDefault(channel["y_pos"], 0) + base.y,
      z: TrackValue.toNumOrDefault(channel["z_pos"], 0) + base.z,
    };
  } else if (trackName.toLowerCase() === "scale") {
    const base = rig.getBaseTrackValueAsV3forNumber(
      channelName,
      trackName,
    ) as RawVector3;
    return {
      x: TrackValue.toNumOrDefault(channel["x_scale"], 1) * base.x,
      y: TrackValue.toNumOrDefault(channel["y_scale"], 1) * base.y,
      z: TrackValue.toNumOrDefault(channel["z_scale"], 1) * base.z,
    };
  } else if (trackName.toLowerCase() === "rot") {
    const base = rig.getBaseTrackValueAsV3forNumber(
      channelName,
      trackName,
    ) as RawVector3;
    return {
      x: TrackValue.toNumOrDefault(channel["x_rot"], 0) + base.x,
      y: TrackValue.toNumOrDefault(channel["y_rot"], 0) + base.y,
      z: TrackValue.toNumOrDefault(channel["z_rot"], 0) + base.z,
    };
  } else if (trackName.toLowerCase() === "morph") {
    const base = rig.getBaseTrackValueAsV3forNumber(
      channelName,
      trackName,
    ) as number;
    return TrackValue.toNumOrDefault(
      channel["morph"],
      TrackValue.toNumOrDefault(base, 0),
    );
  } else {
    return rig.getBaseTrackValueAsV3forNumber(channelName, trackName);
  }
  // For scale/morph tracks, look for scale values first
}
