import figma from "@figma/code-connect";
import { PanelSearch } from "./PanelSearch";

figma.connect(
  PanelSearch,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=19-67",
  {
    example: () => <PanelSearch value="" onChange={() => {}} placeholder="Filter…" />,
  },
);
