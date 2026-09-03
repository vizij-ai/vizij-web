import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, FieldRow, Panel, Switch } from "../ui";
import { SidebarSection } from "./SidebarSection";

const meta = {
  title: "Common/SidebarSection",
  component: SidebarSection,
  parameters: {
    docs: {
      description: {
        component:
          "Sidebar block: uppercase heading, optional description, optional collapsible instructions panel (delegated to `CollapsibleGroup`), then children. `src/components/common/` has no barrel file, so this is deep-path-only for consumers, and `SidebarSectionProps` is not exported.",
      },
    },
  },
  argTypes: {
    defaultInstructionsOpen: { control: "boolean" },
  },
  args: {
    title: "Rig",
    children: (
      <Panel title="Standard inputs" badge="12">
        <p className="m-0 text-xs text-text-secondary">
          Twelve inputs exposed.
        </p>
      </Panel>
    ),
  },
  render: (args) => (
    <div className="max-w-sm">
      <SidebarSection {...args} />
    </div>
  ),
} satisfies Meta<typeof SidebarSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDescription: Story = {
  args: {
    description:
      "Import a GLB, then map its joints onto the rig's declared inputs.",
  },
};

export const WithInstructions: Story = {
  args: {
    description: "Import a GLB, then map its joints onto the declared inputs.",
    instructions: {
      label: "How this works",
      summary: "Three steps",
      content: (
        <ol className="m-0 list-decimal pl-4">
          <li>Import a GLB from disk or a URL.</li>
          <li>Map each joint onto a declared input.</li>
          <li>Validate, then export the bundle.</li>
        </ol>
      ),
    },
  },
};

export const InstructionsOpen: Story = {
  args: {
    instructions: {
      label: "How this works",
      summary: "Three steps",
      content: <p className="m-0">Opens on mount.</p>,
    },
    defaultInstructionsOpen: true,
  },
};

/**
 * `SidebarInstructions.size` is part of the type but `SidebarSection` never
 * reads it — it is not forwarded to `CollapsibleGroup`. Dead prop.
 */
export const InstructionsSizeIsIgnored: Story = {
  args: {
    instructions: {
      label: "Compact requested",
      content: <p className="m-0">Renders identically to `size: default`.</p>,
      size: "compact",
    },
  },
};

export const MultipleSections: Story = {
  render: () => (
    <div className="max-w-sm">
      <SidebarSection
        title="Rig"
        description="Import and map a GLB."
        instructions={{
          label: "How this works",
          content: <p className="m-0">Import, map, validate, export.</p>,
        }}
      >
        <FieldRow
          label="Autosave"
          control={<Switch checked onChange={() => {}} />}
        />
      </SidebarSection>
      <SidebarSection title="Export">
        <Button variant="primary" size="sm">
          Export bundle
        </Button>
      </SidebarSection>
    </div>
  ),
};

export const OnLightCanvas: Story = {
  globals: { theme: "light" },
  args: {
    description: "Import a GLB, then map its joints.",
    instructions: {
      label: "How this works",
      content: <p className="m-0">Import, map, validate, export.</p>,
    },
  },
};
