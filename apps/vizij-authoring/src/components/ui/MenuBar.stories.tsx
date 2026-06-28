import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  MenuBar,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuLabel,
  MenuCheckboxItem,
} from "./MenuBar";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-2";

const meta: Meta<typeof MenuBar> = {
  title: "UI/MenuBar",
  component: MenuBar,
  parameters: { layout: "fullscreen", design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof MenuBar> = {
  render: () => {
    const [grid, setGrid] = useState(true);
    return (
      <div style={{ padding: 16 }}>
        <MenuBar>
          <Menu label="File">
            <MenuItem onSelect={() => {}}>New Face</MenuItem>
            <MenuItem onSelect={() => {}}>Open…</MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => {}}>Save</MenuItem>
          </Menu>
          <Menu label="View">
            <MenuLabel>Workspace</MenuLabel>
            <MenuCheckboxItem checked={grid} onCheckedChange={setGrid}>
              Show grid
            </MenuCheckboxItem>
            <MenuItem onSelect={() => {}}>Reset layout</MenuItem>
          </Menu>
        </MenuBar>
      </div>
    );
  },
};
