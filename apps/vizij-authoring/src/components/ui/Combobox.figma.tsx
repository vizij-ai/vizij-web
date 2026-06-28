import figma from "@figma/code-connect";
import { Combobox } from "./Combobox";

figma.connect(
  Combobox,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=19-48",
  {
    example: () => (
      <Combobox
        value={null}
        onChange={() => {}}
        options={[
          { value: "smile", label: "smile" },
          { value: "blink", label: "blink" },
        ]}
        placeholder="Search…"
      />
    ),
  },
);
