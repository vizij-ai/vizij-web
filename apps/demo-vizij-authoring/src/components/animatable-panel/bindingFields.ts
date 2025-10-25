import type { BindingField } from "./types";

export const REMAP_INPUT_FIELDS: Array<{ field: BindingField; label: string }> =
  [
    { field: "inLow", label: "Input low" },
    { field: "inAnchor", label: "Input anchor" },
    { field: "inHigh", label: "Input high" },
  ];

export const REMAP_OUTPUT_FIELDS: Array<{
  field: BindingField;
  label: string;
}> = [
  { field: "outLow", label: "Output low" },
  { field: "outAnchor", label: "Output anchor" },
  { field: "outHigh", label: "Output high" },
];
