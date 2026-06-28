import figma from "@figma/code-connect";
import { Slider } from "./Slider";

// RowSlider wraps this primitive with a label; both map to the same Figma node.
figma.connect(
  Slider,
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=19-60",
  {
    example: () => <Slider value={0.5} min={0} max={1} step={0.01} onChange={() => {}} />,
  },
);
