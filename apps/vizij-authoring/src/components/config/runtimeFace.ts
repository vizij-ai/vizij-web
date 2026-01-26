/**
 * Bounding box tuned for the Hugo face rig (background mesh removed) so the
 * runtime camera can crop to the actual face instead of the staging plane.
 */
export const FACE_ROOT_BOUNDS = {
  center: {
    x: -0.007489,
    y: 0.786183,
  },
  size: {
    x: 12.068108,
    y: 8.769684,
  },
} as const;

export const FACE_ASPECT_RATIO =
  FACE_ROOT_BOUNDS.size.x / FACE_ROOT_BOUNDS.size.y;
