/**
 * Minimal StoredAnimation fixture for the demo app.
 * Produces a scalar value that ramps 0 -> 1 over 2 seconds on the key "demo/scalar".
 * The AnimationProvider prebind resolver will map canonical paths to keys; we use identity mapping.
 */
const anim = {
  name: "Demo Scalar",
  id: "test",
  duration: 2000, // milliseconds
  tracks: [
    {
      id: "t0",
      name: "Scalar Demo",
      animatableId: "demo/scalar",
      points: [
        { id: "k0", stamp: 0.0, value: 0 },
        { id: "k1", stamp: 1.0, value: 1 },
      ],
      settings: { color: "#ffffff" },
    },
  ],
  groups: {},
};

export default anim;
