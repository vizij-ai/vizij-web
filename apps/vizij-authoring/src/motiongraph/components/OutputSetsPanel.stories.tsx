import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEditorStore } from "../store/useEditorStore";
import OutputSetsPanel from "./OutputSetsPanel";

/**
 * Seeds the one `useEditorStore` slice this panel reads (`enabledOutputs`) and
 * clears the store again when the story unmounts.
 *
 * The available paths are a prop, not store state — only the enabled set lives in
 * the store. `toggleOutput` is the real action, so the checkboxes work.
 */
const seed = (enabledOutputs: string[]) => () => {
  useEditorStore.setState({ enabledOutputs: new Set(enabledOutputs) });
  return () => {
    useEditorStore.getState().clear();
  };
};

/** The panel is `h-full`, so every story needs a sized shell to live in. */
const Shell = ({
  children,
  width = 260,
}: {
  children: React.ReactNode;
  width?: number;
}) => (
  <div
    className="flex h-[420px] flex-col overflow-hidden rounded-md border border-neutral-700 bg-neutral-900"
    style={{ width }}
  >
    {children}
  </div>
);

const RIG = "rig/quori-face";

const STANDARD_PATHS = [
  `${RIG}/standard/brow/up`,
  `${RIG}/standard/brow/down`,
  `${RIG}/standard/eyes/blink`,
  `${RIG}/standard/eyes/squint`,
  `${RIG}/standard/jaw/open`,
  `${RIG}/standard/mouth/smile`,
  `${RIG}/standard/mouth/pos/x`,
  `${RIG}/standard/mouth/pos/y`,
];

const meta = {
  title: "Editor Tools/OutputSetsPanel",
  component: OutputSetsPanel,
  parameters: {
    docs: {
      description: {
        component:
          'The motion-graph Outputs panel: a namespace picker over a tree of the rig\'s output paths. Each leaf is a checkbox that enables or disables writing to that output; branch rows are inert labels for their subtree, and nothing collapses. Unlike the Inputs panel there is no remove `×` — you cannot delete an output the rig actually has.\n\nThe available paths come in as a `paths` prop. The `rig/{rigId}/` prefix is stripped for display, and the segment after it becomes the namespace — so `rig/quori-face/standard/jaw/open` files under `standard`, which the picker prefers when present. Only the enabled set is store state (`enabledOutputs` in `useEditorStore`), seeded directly in a decorator here; zustand needs no provider, and no story boots the WASM graph or the 3D runtime.\n\n**What to look for.** The row is `SetTreeRow`, newly extracted from copies that had drifted apart in both panels. The bug on this side was spacing: the row used to be a bare `<button>`, which is `inline-block`, so each row picked up 1px of line-box leading and rows tiled on a 25px pitch instead of 24px — leaving a hairline stripe of panel background between neighbouring row fills. Wrapping the button in a flex row blockified it and closed the gaps. In `ManyRowsTileFlush`, look along the boundary between two adjacent enabled rows: the tinted fills should meet with no seam.\n\n**Honest caveat:** neither this panel nor `InputSetsPanel` is mounted anywhere in the app today, so there is no "real" state to be faithful to. The paths below are shaped like the ones a loaded GLB produces, but the rig and channel names are invented.',
      },
    },
  },
} satisfies Meta<typeof OutputSetsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A loaded rig with two namespaces. `standard` wins the auto-selection even though
 * `vizij` sorts first; switch the picker to see the tree rebuild. Four leaves are
 * enabled, so they paint the emerald accent and the header count reads
 * enabled-over-total — note the total counts *all* paths, not just the visible
 * namespace.
 */
export const Default: Story = {
  args: {
    paths: [
      ...STANDARD_PATHS,
      `${RIG}/vizij/expression/happy`,
      `${RIG}/vizij/expression/sad`,
    ],
  },
  beforeEach: seed([
    `${RIG}/standard/jaw/open`,
    `${RIG}/standard/eyes/blink`,
    `${RIG}/standard/mouth/pos/x`,
    `${RIG}/vizij/expression/happy`,
  ]),
  render: (args) => (
    <Shell>
      <OutputSetsPanel {...args} />
    </Shell>
  ),
};

/**
 * No paths at all — the state before a GLB is loaded. The header keeps its title
 * and the body says what to do about it. There is no namespace picker in this
 * state, because there are no namespaces to pick.
 */
export const Empty: Story = {
  args: { paths: [] },
  beforeEach: seed([]),
  render: (args) => (
    <Shell>
      <OutputSetsPanel {...args} />
    </Shell>
  ),
};

/**
 * **The row-pitch fix, staged.** A tall stack of rows with every leaf enabled, so
 * each row paints a filled emerald surface and the boundaries between them are
 * visible.
 *
 * Look down the left edge of the tinted rows: adjacent fills should touch exactly,
 * with no hairline of darker panel background between them. Rows sit on a constant
 * 24px pitch — the leading-induced 25px pitch is what produced those seams.
 */
export const ManyRowsTileFlush: Story = {
  args: { paths: STANDARD_PATHS },
  beforeEach: seed(STANDARD_PATHS),
  render: (args) => (
    <Shell>
      <OutputSetsPanel {...args} />
    </Shell>
  ),
};

/**
 * Long channel names in a 200px panel. The labels truncate rather than widening the
 * row, so the tree never scrolls sideways. This panel never had the reachability
 * half of the truncation bug — it has no remove button to push out — but it shares
 * the fixed row, so the truncation itself is worth a look.
 */
export const NarrowPanelTruncates: Story = {
  args: {
    paths: [
      `${RIG}/standard/mouth/lower_lip_depressor_left_weight_channel`,
      `${RIG}/standard/mouth/upper_lip_raiser_right_weight_channel`,
      `${RIG}/standard/jaw/open`,
    ],
  },
  beforeEach: seed([
    `${RIG}/standard/mouth/lower_lip_depressor_left_weight_channel`,
  ]),
  render: (args) => (
    <Shell width={200}>
      <OutputSetsPanel {...args} />
    </Shell>
  ),
};
