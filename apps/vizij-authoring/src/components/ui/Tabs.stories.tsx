import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Tabs } from "./Tabs";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-2";

const items = [
  { id: "design", label: "Design" },
  { id: "rig", label: "Rig" },
  { id: "animate", label: "Animate" },
] as const;

const meta: Meta<typeof Tabs> = {
  title: "UI/Tabs",
  component: Tabs,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

const Demo = (p: { variant?: "default" | "pill" | "underline" }) => {
  const [v, setV] = useState<string>("design");
  return (
    <div style={{ width: 360 }}>
      <Tabs
        items={items}
        value={v}
        onValueChange={setV}
        renderPanel={(id) => (
          <div style={{ fontSize: 13, color: "var(--text-secondary)", paddingTop: 4 }}>
            {items.find((t) => t.id === id)?.label} panel content.
          </div>
        )}
        {...p}
      />
    </div>
  );
};

export const Default: StoryObj<typeof Tabs> = { render: () => <Demo /> };
export const Pill: StoryObj<typeof Tabs> = { render: () => <Demo variant="pill" /> };
export const Underline: StoryObj<typeof Tabs> = { render: () => <Demo variant="underline" /> };
