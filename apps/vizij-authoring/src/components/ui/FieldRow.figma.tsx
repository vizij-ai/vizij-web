import figma from "@figma/code-connect";
import { FieldRow } from "./FieldRow";
import { Input } from "./Input";

figma.connect(
  FieldRow,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-50",
  {
    example: () => <FieldRow label="Label" control={<Input />} />,
  },
);
