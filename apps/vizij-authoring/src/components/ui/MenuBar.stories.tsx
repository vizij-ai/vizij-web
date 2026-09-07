import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Menu,
  MenuBar,
  MenuCheckboxItem,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSubmenu,
} from "./index";

/** The checkbox items are controlled, so the story owns their state. */
function ViewMenu() {
  const [visible, setVisible] = useState<Record<string, boolean>>({
    hierarchy: true,
    inspector: true,
    timeline: false,
    diagnostics: false,
  });
  const [authoring, setAuthoring] = useState(true);

  const toggle = (key: string) => (next: boolean) =>
    setVisible((prev) => ({ ...prev, [key]: next }));

  return (
    <Menu label="View" testId="app-menu-view">
      <MenuLabel>Panels</MenuLabel>
      <MenuCheckboxItem
        checked={visible.hierarchy}
        onCheckedChange={toggle("hierarchy")}
      >
        Hierarchy
      </MenuCheckboxItem>
      <MenuCheckboxItem
        checked={visible.inspector}
        onCheckedChange={toggle("inspector")}
      >
        Inspector
      </MenuCheckboxItem>
      <MenuCheckboxItem
        checked={visible.timeline}
        onCheckedChange={toggle("timeline")}
      >
        Timeline
      </MenuCheckboxItem>
      <MenuSeparator />
      <MenuSubmenu
        label="Authoring"
        checked={authoring}
        onSelect={() => setAuthoring((prev) => !prev)}
      >
        <MenuItem>Poses</MenuItem>
        <MenuItem>Bindings</MenuItem>
        <MenuItem>Drivers</MenuItem>
      </MenuSubmenu>
      <MenuSubmenu label="Diagnostics">
        <MenuCheckboxItem
          checked={visible.diagnostics}
          onCheckedChange={toggle("diagnostics")}
        >
          Show IR inspector
        </MenuCheckboxItem>
        <MenuItem>Download machine report</MenuItem>
      </MenuSubmenu>
    </Menu>
  );
}

const meta = {
  title: "UI/MenuBar",
  component: MenuBar,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Application menu bar on `radix-ui`'s Menubar: real `role=\"menubar\"`, arrow-key movement between menus, hover-to-switch once open. `MenuBar` renders `Logo` unconditionally, so it inherits `Logo`'s hardcoded `/assets/icon.svg`. Popup content uses the app-global `animate-in`/`fade-in`/`zoom-in` classes and sits on the app's z-index ladder (bar 3900, popups 4000).",
      },
    },
  },
  args: { children: null },
  render: (args) => (
    <div className="min-h-[22rem] border-b border-border-default bg-bg-panel/60">
      <MenuBar {...args}>
        <Menu label="File" testId="app-menu-file">
          <MenuItem testId="app-menu-file-new">New project</MenuItem>
          <MenuItem>Open…</MenuItem>
          <MenuSeparator />
          <MenuLabel>Export</MenuLabel>
          <MenuItem>Export bundle</MenuItem>
          <MenuItem disabled>Export selection</MenuItem>
        </Menu>
        <Menu label="Edit" testId="app-menu-edit">
          <MenuItem>Undo</MenuItem>
          <MenuItem>Redo</MenuItem>
          <MenuSeparator />
          <MenuItem disabled>Paste pose</MenuItem>
        </Menu>
        <ViewMenu />
      </MenuBar>
    </div>
  ),
} satisfies Meta<typeof MenuBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OnLightCanvas: Story = {
  globals: { theme: "light" },
};

/** A single menu, to inspect item states (default / disabled / label / separator). */
export const ItemStates: Story = {
  render: (args) => (
    <div className="min-h-[18rem]">
      <MenuBar {...args}>
        <Menu label="States">
          <MenuLabel>A label row</MenuLabel>
          <MenuItem>Enabled item</MenuItem>
          <MenuItem disabled>Disabled item</MenuItem>
          <MenuSeparator />
          <MenuSubmenu label="Submenu (no onSelect)">
            <MenuItem>Nested item</MenuItem>
          </MenuSubmenu>
          <MenuSubmenu label="Submenu (checked + onSelect)" checked>
            <MenuItem>Nested item</MenuItem>
          </MenuSubmenu>
          <MenuSubmenu label="Submenu (disabled)" disabled>
            <MenuItem>Unreachable</MenuItem>
          </MenuSubmenu>
        </Menu>
      </MenuBar>
    </div>
  ),
};

/** Checkbox items close the menu on select — radix's default, kept deliberately. */
export const CheckboxItems: Story = {
  render: (args) => (
    <div className="min-h-[18rem]">
      <MenuBar {...args}>
        <ViewMenu />
      </MenuBar>
    </div>
  ),
};
