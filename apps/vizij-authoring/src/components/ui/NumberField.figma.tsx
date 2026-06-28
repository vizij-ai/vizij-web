import figma from "@figma/code-connect";
import { NumberField } from "./NumberField";

figma.connect(
  NumberField,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=19-55",
  {
    example: () => (
      <NumberField value={0.5} onChange={() => {}} min={0} max={1} step={0.01} />
    ),
  },
);
