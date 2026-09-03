import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./index";

const meta = {
  title: "UI/Card",
  component: Card,
  parameters: {
    docs: {
      description: {
        component:
          "Opaque card surface built on `@semio/ui`'s `.card`. The `Card*` content parts (`CardHeader`, `CardTitle`, `CardDescription`, `CardBody`) emit app-global `.asset-card__*` classes defined in `src/styles.css` — see the extraction notes.",
      },
    },
  },
  argTypes: {
    compact: { control: "boolean" },
  },
  args: {},
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Card {...args} className="max-w-sm">
      <CardHeader>
        <CardTitle>Rig bindings</CardTitle>
        <CardDescription>
          Twelve joints mapped, two awaiting a target.
        </CardDescription>
      </CardHeader>
    </Card>
  ),
};

export const WithBody: Story = {
  render: (args) => (
    <Card {...args} className="max-w-sm">
      <CardHeader>
        <CardTitle>Export bundle</CardTitle>
        <CardDescription>Includes poses, graph and metadata.</CardDescription>
      </CardHeader>
      <CardBody>
        <p className="text-xs text-text-secondary">
          The bundle is written to disk and can be replayed by the runtime
          without the authoring app.
        </p>
        <Button variant="primary" size="sm">
          Export
        </Button>
      </CardBody>
    </Card>
  ),
};

/**
 * `compact` wraps `children` in `.asset-card__body--compact`. It is *only*
 * meaningful when the children are plain content — passing a `CardBody` as well
 * nests two body wrappers.
 */
export const Compact: Story = {
  args: { compact: true },
  render: (args) => (
    <Card {...args} className="max-w-sm">
      <CardTitle>Compact body</CardTitle>
      <CardDescription>Tighter vertical rhythm.</CardDescription>
    </Card>
  ),
};

export const CompactBodyPart: Story = {
  render: (args) => (
    <Card {...args} className="max-w-sm">
      <CardHeader>
        <CardTitle>Compact via CardBody</CardTitle>
      </CardHeader>
      <CardBody compact>
        <span className="text-xs text-text-secondary">
          `CardBody` takes its own `compact` flag.
        </span>
      </CardBody>
    </Card>
  ),
};

export const Grid: Story = {
  render: (args) => (
    <div className="grid grid-cols-2 gap-3 max-w-2xl">
      {["Poses", "Graph", "Assets", "Speech"].map((name) => (
        <Card key={name} {...args}>
          <CardHeader>
            <CardTitle>{name}</CardTitle>
            <CardDescription>Section summary line.</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  ),
};
