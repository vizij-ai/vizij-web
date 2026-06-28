import figma from "@figma/code-connect";
import { Select } from "./Select";

figma.connect(
  Select,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=19-44",
  {
    example: () => (
      <Select
        value="a"
        onChange={() => {}}
        options={[
          { value: "a", label: "Option A" },
          { value: "b", label: "Option B" },
        ]}
      />
    ),
  },
);
