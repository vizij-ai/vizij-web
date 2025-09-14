/**
 * Phase 2 Presets: single StoredAnimation covering all Value kinds supported via StoredValue:
 * - Scalar: number
 * - Vec2: { x, y }
 * - Vec3: { x, y, z }
 * - Vec4: represented by two Vec2 tracks or extended Vec3 with z2? (Not in StoredValue; we skip dedicated Vec4 track)
 * - Quat (via Euler): { r, p, y }  (roll, pitch, yaw in radians)
 * - Color: { r, g, b }   (0..1 range)
 * - Transform: separate tracks for translation (vec3), rotation (euler), scale (vec3)
 * - Bool: boolean
 * - Text: string
 *
 * Note: StoredValue does not include a Vec4 variant, so Vec4 is not authored in presets directly.
 * Matches StoredAnimation shape consumed by @vizij/animation-wasm Engine.loadAnimation({ format: "stored" }).
 * Interpolation control points are included on a subset of tracks to demonstrate transitions vs defaults.
 */
const preset = {
  name: "Studio Preset (Phase 2 – Full Coverage)",
  id: "studio_phase2_full",
  duration: 6000, // ms
  tracks: [
    // Scalar ramp 0 -> 1 with easing
    {
      id: "t_scalar",
      name: "Scalar Ramp",
      animatableId: "studio/scalar",
      points: [
        {
          id: "s0",
          stamp: 0.0,
          value: 0,
          transitions: { out: { x: 0.35, y: 0.0 } },
        },
        { id: "s1", stamp: 0.5, value: 0.25 },
        {
          id: "s2",
          stamp: 1.0,
          value: 1,
          transitions: { in: { x: 0.7, y: 1.0 } },
        },
      ],
      settings: { color: "#60a5fa" },
    },

    // Vec2 L-shape then back
    {
      id: "t_vec2",
      name: "Vec2 Sweep",
      animatableId: "studio/vec2",
      points: [
        { id: "v2_0", stamp: 0.0, value: { x: 0, y: 0 } },
        { id: "v2_1", stamp: 0.33, value: { x: 1, y: 0 } },
        { id: "v2_2", stamp: 0.66, value: { x: 1, y: 1 } },
        { id: "v2_3", stamp: 1.0, value: { x: 0, y: 1 } },
      ],
      settings: { color: "#34d399" },
    },

    // Vec3 triangle path
    {
      id: "t_vec3",
      name: "Vec3 Path",
      animatableId: "studio/vec3",
      points: [
        { id: "v3_0", stamp: 0.0, value: { x: 0, y: 0, z: 0 } },
        { id: "v3_1", stamp: 0.25, value: { x: 1, y: 0, z: 0 } },
        { id: "v3_2", stamp: 0.5, value: { x: 1, y: 1, z: 0 } },
        { id: "v3_3", stamp: 0.75, value: { x: 0, y: 1, z: 1 } },
        { id: "v3_4", stamp: 1.0, value: { x: 0, y: 0, z: 0 } },
      ],
      settings: { color: "#fbbf24" },
    },

    // Quat via Euler (RPY) sweep around yaw
    {
      id: "t_quat",
      name: "Rotation Yaw",
      animatableId: "studio/quat_euler",
      points: [
        {
          id: "q0",
          stamp: 0.0,
          value: { r: 0.0, p: 0.0, y: 0.0 },
          transitions: { out: { x: 0.3, y: 0.0 } },
        },
        { id: "q1", stamp: 0.5, value: { r: 0.0, p: 0.0, y: Math.PI } },
        {
          id: "q2",
          stamp: 1.0,
          value: { r: 0.0, p: 0.0, y: Math.PI * 2 },
          transitions: { in: { x: 0.7, y: 1.0 } },
        },
      ],
      settings: { color: "#f472b6" },
    },

    // Color ramp RGB across time (0..1)
    {
      id: "t_color",
      name: "Color RGB",
      animatableId: "studio/color",
      points: [
        { id: "c0", stamp: 0.0, value: { r: 1, g: 0, b: 0 } },
        { id: "c1", stamp: 0.5, value: { r: 0, g: 1, b: 0 } },
        { id: "c2", stamp: 1.0, value: { r: 0, g: 0, b: 1 } },
      ],
      settings: { color: "#38bdf8" },
    },

    // Transform: translation (Vec3)
    {
      id: "t_tr_translate",
      name: "Transform.translation",
      animatableId: "studio/transform.translation",
      points: [
        { id: "tt0", stamp: 0.0, value: { x: 0, y: 0, z: 0 } },
        { id: "tt1", stamp: 0.5, value: { x: 1, y: 1, z: 0 } },
        { id: "tt2", stamp: 1.0, value: { x: 0, y: 0, z: 1 } },
      ],
      settings: { color: "#22d3ee" },
    },

    // Transform: rotation (Euler)
    {
      id: "t_tr_rotate",
      name: "Transform.rotation",
      animatableId: "studio/transform.rotation",
      points: [
        { id: "tr0", stamp: 0.0, value: { r: 0.0, p: 0.0, y: 0.0 } },
        { id: "tr1", stamp: 0.5, value: { r: 0.0, p: Math.PI * 0.5, y: 0.0 } },
        { id: "tr2", stamp: 1.0, value: { r: 0.0, p: 0.0, y: Math.PI } },
      ],
      settings: { color: "#a78bfa" },
    },

    // Transform: scale (Vec3)
    {
      id: "t_tr_scale",
      name: "Transform.scale",
      animatableId: "studio/transform.scale",
      points: [
        { id: "ts0", stamp: 0.0, value: { x: 1, y: 1, z: 1 } },
        { id: "ts1", stamp: 0.5, value: { x: 2, y: 1, z: 0.5 } },
        { id: "ts2", stamp: 1.0, value: { x: 1, y: 1, z: 1 } },
      ],
      settings: { color: "#f87171" },
    },

    // Bool toggling
    {
      id: "t_bool",
      name: "Bool Toggle",
      animatableId: "studio/bool",
      points: [
        { id: "b0", stamp: 0.0, value: false },
        { id: "b1", stamp: 0.25, value: true },
        { id: "b2", stamp: 0.5, value: false },
        { id: "b3", stamp: 0.75, value: true },
        { id: "b4", stamp: 1.0, value: false },
      ],
      settings: { color: "#fde047" },
    },

    // Text changes
    {
      id: "t_text",
      name: "Text Steps",
      animatableId: "studio/text",
      points: [
        { id: "t0", stamp: 0.0, value: "start" },
        { id: "t1", stamp: 0.33, value: "middle" },
        { id: "t2", stamp: 0.66, value: "almost" },
        { id: "t3", stamp: 1.0, value: "end" },
      ],
      settings: { color: "#d4d4d8" },
    },
  ],
  groups: {},
};

export default preset;
