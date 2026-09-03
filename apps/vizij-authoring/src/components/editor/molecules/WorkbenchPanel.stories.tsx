import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { WorkbenchPanel } from "./WorkbenchPanel";

const body = (
  <div className="flex-1 min-h-0 overflow-y-auto p-2">
    <p className="m-0 text-xs text-text-secondary">
      The body owns its own padding. `WorkbenchPanel` deliberately has none, so
      a scroll container can reach the panel edge.
    </p>
  </div>
);

const meta = {
  title: "Editor/WorkbenchPanel",
  component: WorkbenchPanel,
  parameters: {
    docs: {
      description: {
        component: [
          "The scaffold shared by every dockable panel in the workspace: title,",
          "optional description tooltip, optional actions and badge, an optional",
          '"Hide panel" close button, and a body that fills the rest.',
          "",
          "It replaced nine call sites that each repeated",
          '`className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"`',
          "plus a hand-rolled close `<Button>`. Since `ui/Panel` became flat, the",
          "`border-none bg-transparent shadow-none` third of that string cancels",
          "nothing; only the layout half was ever load-bearing, and here it is the",
          "default.",
          "",
          "Unlike `ui/Panel` this lives in `editor/`, so it styles itself from",
          "`--editor-*` custom properties that fall back to this app's tokens. See",
          "the **Rebranded Tokens** story.",
        ].join(" "),
      },
    },
  },
  args: {
    title: "Face Elements",
    description:
      "Select objects via the tree or viewport to drive the inspector.",
    children: body,
  },
  render: (args) => (
    // A fixed-height flex column stands in for the dock: `fill="flex"` needs a
    // flex parent to mean anything.
    <div className="flex h-64 w-96 flex-col rounded-lg bg-bg-panel/70">
      <WorkbenchPanel {...args} />
    </div>
  ),
} satisfies Meta<typeof WorkbenchPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** `onClose` renders the standard affordance; without it there is no close button. */
export const WithClose: Story = {
  args: { onClose: () => {} },
};

/** `actions` land before the close button; a string `badge` is auto-wrapped in `<Badge>`. */
export const WithActionsAndBadge: Story = {
  args: {
    title: "Animation",
    onClose: () => {},
    closeTestId: "animation-panel-hide",
    badge: "00:04:12",
    actions: (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Delete Selected Track"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Add Track"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Settings"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    ),
  },
};

/** An element `badge` is rendered as-is. */
export const WithElementBadge: Story = {
  args: { title: "Debug", badge: <Badge tone="info">READY</Badge> },
};

/** With no title, description, badge, actions or `onClose`, no header renders at all. */
export const NoHeader: Story = {
  args: { title: undefined, description: undefined },
};

/**
 * `fill="full"` swaps `flex-1` for `h-full`, for a panel whose parent is not a
 * flex column. `MotionGraphPanel` is the only site that needs it.
 */
export const FillFull: Story = {
  args: {
    title: "Program",
    fill: "full",
    onClose: () => {},
    closeTestId: "motiongraph-panel-hide",
    closeClassName: "h-8 w-8",
  },
  render: (args) => (
    <div className="block h-64 w-96 rounded-lg bg-bg-panel/70">
      <WorkbenchPanel {...args} />
    </div>
  ),
};

/**
 * Portability check. A consuming editor application overrides the `--editor-*`
 * set at its root and never learns vizij's token names. Every property this
 * component reads is overridden here — a token nobody overrides in a story is a
 * token nobody has tested.
 *
 * Note the close button's *resting* colour does not move: `ui/Button`'s ghost
 * variant emits `text-text-muted!`, which beats the token class inside this app.
 * That was equally true of the eight hand-rolled close buttons this replaced, so
 * it is a `ui/Button` matter rather than a regression here.
 */
export const RebrandedTokens: Story = {
  args: { onClose: () => {}, badge: "12" },
  render: (args) => (
    <div
      className="flex h-64 w-96 flex-col rounded-lg p-2"
      style={
        {
          background: "#101014",
          "--editor-panel-fg": "#f5e9c8",
          "--editor-label-fg": "#8f7fd6",
          "--editor-accent": "#7c5cff",
          "--editor-panel-gap": "1.5rem",
          "--editor-panel-header-min-height": "44px",
        } as CSSProperties
      }
    >
      <WorkbenchPanel {...args} />
    </div>
  ),
};
