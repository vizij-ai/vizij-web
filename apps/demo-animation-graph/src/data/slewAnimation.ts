import type { StoredAnimation } from "@vizij/animation-wasm";
import { makeTypedPath } from "../utils/typedPath";

export const slewPaths = {
  driver: makeTypedPath("float", "controllers", "rapidInput"),
  slew: makeTypedPath("float", "controllers", "slewLimited"),
  damp: makeTypedPath("float", "controllers", "dampSmoothed"),
} as const;

export const slewAnimation: StoredAnimation = {
  name: "Rapid Driver",
  id: "slew_demo",
  duration: 4000,
  tracks: [
    {
      id: "driver_track",
      name: "Driver",
      animatableId: slewPaths.driver,
      points: [
        { id: "d0", stamp: 0.0, value: 0.0 },
        { id: "d1", stamp: 0.1, value: 1.0 },
        { id: "d2", stamp: 0.2, value: -1.0 },
        { id: "d3", stamp: 0.3, value: 0.8 },
        { id: "d4", stamp: 0.4, value: -0.6 },
        { id: "d5", stamp: 0.5, value: 1.0 },
        { id: "d6", stamp: 0.6, value: -0.8 },
        { id: "d7", stamp: 0.7, value: 0.5 },
        { id: "d8", stamp: 0.85, value: -0.2 },
        { id: "d9", stamp: 1.0, value: 0.0 },
      ],
      settings: { color: "#fca5a5" },
    },
  ],
  groups: {},
};
