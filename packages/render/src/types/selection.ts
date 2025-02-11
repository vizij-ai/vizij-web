/**
 * A type representing the selection of an element.
 * @param {string} id - The unique identifier of the id being selected.
 * @param {string} namespace - The namespace of the selection.
 * @param {string} type - The type of the selection.
 * @param {string} [color] - The color of the selection.
 * @param {object} [tooltip] - The tooltip information for the selection.
 */
export interface Selection {
  id: string;
  namespace: string;
  type:
    | "body"
    | "joint"
    | "screen"
    | "shape"
    | "slot"
    | "group"
    | "ellipse"
    | "rectangle"
    | "animatable"
    | "parent";
  color?: string;
  tooltip?: {
    type: "animatable" | "text";
    title: string;
    description?: string;
  };
}
