import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEditorStore } from "../store/useEditorStore";
import InputSetsPanel from "./InputSetsPanel";

/**
 * Seeds the two `useEditorStore` slices this panel reads, and clears the store
 * again when the story unmounts so stories cannot leak into each other.
 *
 * `useEditorStore` is a plain zustand store with no provider, so seeding it is
 * enough to mount the panel — nothing here touches the WASM graph or the 3D
 * runtime. The panel's *actions* (`toggleInput`, `addCustomInputPath`,
 * `removeCustomInputPath`) are the real ones, not mocks, so the checkboxes, the
 * Add form and the remove `×` all genuinely work in these stories.
 */
const seed =
  (customInputPaths: string[], enabledInputs: string[] = []) =>
  () => {
    useEditorStore.setState({
      customInputPaths,
      enabledInputs: new Set(enabledInputs),
    });
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

const meta = {
  title: "Editor Tools/InputSetsPanel",
  component: InputSetsPanel,
  parameters: {
    docs: {
      description: {
        component:
          'The motion-graph Inputs panel: a namespace picker at the top, a tree of the input paths in that namespace, and a form at the bottom for adding more. Each leaf is a checkbox — clicking it enables or disables that input; branch rows are inert and exist only to label and indent the subtree. Nothing collapses.\n\nThe panel reads `enabledInputs` and `customInputPaths` from `useEditorStore` and calls its `toggleInput` / `addCustomInputPath` / `removeCustomInputPath` actions. Those are seeded directly in a decorator here — zustand needs no provider — and the actions are the real ones, so the stories are fully interactive.\n\n**What to look for.** The row is `SetTreeRow`, newly extracted from copies that had drifted apart in both panels, and it carries fixes for two real bugs. The one that lived on this side is truncation: the row button was `flex-1` with no `min-w-0`, which left `min-width: auto`, made the label\'s `truncate` inert, and pushed the remove `×` about 124px outside a 200px panel — unreachable without scrolling sideways. `NarrowPanelKeepsRemoveReachable` is that exact case. See `Editor Tools/OutputSetsPanel` for the other fix (row pitch).\n\n**Honest caveat:** neither of these panels is mounted anywhere in the app today, so there is no "real" state to be faithful to. The paths below are shaped like the ones the app produces (`namespace/segment/segment`), but they are invented.',
      },
    },
  },
} satisfies Meta<typeof InputSetsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A populated panel. Two namespaces exist (`custom` and `ros4hri`, from the first
 * segment of the seeded paths); the picker auto-selects the first. Three of the
 * `custom` leaves are enabled, so they paint the sky accent and the header count
 * reads enabled-over-total. Switch the picker to `ros4hri` to see the tree rebuild
 * around a different root.
 */
export const Default: Story = {
  beforeEach: seed(
    [
      "custom/face/jaw/open",
      "custom/face/eyes/blink",
      "custom/face/mouth/smile",
      "custom/mood/valence",
      "custom/mood/arousal",
      "ros4hri/expression/valence",
      "ros4hri/expression/arousal",
    ],
    ["custom/face/jaw/open", "custom/face/eyes/blink", "custom/mood/valence"],
  ),
  render: () => (
    <Shell>
      <InputSetsPanel />
    </Shell>
  ),
};

/**
 * Nothing seeded. The namespace picker is disabled and reads "No namespaces yet",
 * and the tree area explains the order of operations. The Add form is still live
 * but refuses with "Create a namespace first" — click **+ New Namespace**, type a
 * name, then add a path, and the panel fills in for real.
 */
export const Empty: Story = {
  beforeEach: seed([]),
  render: () => (
    <Shell>
      <InputSetsPanel />
    </Shell>
  ),
};

/** Every seeded path enabled, for a straight read of the sky accent. */
export const AllEnabled: Story = {
  beforeEach: seed(
    [
      "custom/face/jaw/open",
      "custom/face/eyes/blink",
      "custom/face/eyes/squint",
      "custom/face/mouth/smile",
      "custom/face/mouth/pos/x",
      "custom/face/mouth/pos/y",
    ],
    [
      "custom/face/jaw/open",
      "custom/face/eyes/blink",
      "custom/face/eyes/squint",
      "custom/face/mouth/smile",
      "custom/face/mouth/pos/x",
      "custom/face/mouth/pos/y",
    ],
  ),
  render: () => (
    <Shell>
      <InputSetsPanel />
    </Shell>
  ),
};

/**
 * **The truncation bug, staged.** A 200px panel holding a deeply nested path with a
 * very long leaf name — the shape that used to break.
 *
 * Look for two things. The long labels end in an ellipsis instead of stretching the
 * row, and every remove `×` sits inside the panel's right edge, on the row it
 * belongs to. Before `min-w-0`, the label would have run on at full width and
 * carried the `×` far off to the right of the border.
 *
 * The `×` normally only appears while the pointer is over its row. This story adds
 * one story-local CSS rule to keep them all visible so the geometry can be read at
 * a glance; the component is untouched, and hovering behaves normally.
 */
export const NarrowPanelKeepsRemoveReachable: Story = {
  beforeEach: seed(
    [
      "custom/face/mouth/lower_lip_depressor_left_weight_channel",
      "custom/face/mouth/upper_lip_raiser_right_weight_channel",
      "custom/face/jaw/open",
      "custom/mood/valence",
    ],
    ["custom/face/mouth/lower_lip_depressor_left_weight_channel"],
  ),
  render: () => (
    <div data-reveal-remove>
      <style>{`[data-reveal-remove] button[title="Remove input"] { opacity: 1; }`}</style>
      <Shell width={200}>
        <InputSetsPanel />
      </Shell>
    </div>
  ),
};
