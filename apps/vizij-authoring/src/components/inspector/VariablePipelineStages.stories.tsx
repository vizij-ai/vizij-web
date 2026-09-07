import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { VariablePipelineStages } from "./VariablePipelineStages";

/**
 * Expands one `StageSection` (a `CollapsibleGroup`) by its test id. Idempotent:
 * `Parents` and `Children` already open by default, so this leaves them alone.
 */
async function openStage(
  canvasElement: HTMLElement,
  testId: string,
  name: RegExp,
): Promise<HTMLElement> {
  const stage = canvasElement.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
  if (!stage) {
    throw new Error(`Stage "${testId}" is not in the DOM.`);
  }
  const trigger = within(stage).getByRole("button", { name });
  if (trigger.getAttribute("aria-expanded") !== "true") {
    await userEvent.click(trigger);
  }
  return stage;
}

/**
 * Expands one `CollapsibleRow` inside a stage. `CollapsibleRow` takes only
 * `defaultExpanded` and `VariablePipelineStages` hardcodes it to `false`, so a
 * click is the only way to reveal a link's or a pose's editor. Clicking here
 * rather than adding a prop keeps the stories describing the shipped component.
 */
async function expandRow(scope: HTMLElement, name: RegExp): Promise<void> {
  const trigger = within(scope).getByRole("button", { name });
  if (trigger.getAttribute("aria-expanded") !== "true") {
    await userEvent.click(trigger);
  }
}

const JAW_PARENT = {
  id: "parent:jaw",
  label: "Jaw Parent",
  expressionVariable: "s1",
  kind: "variable" as const,
  onInspect: fn(),
  onUnlink: fn(),
  directControl: {
    value: 0.4,
    defaultValue: 0,
    min: -1,
    max: 1,
    onValueChange: fn(),
  },
  linkControl: {
    enabled: true,
    scale: 1,
    offset: 0,
    onEnabledChange: fn(),
    onScaleChange: fn(),
    onOffsetChange: fn(),
  },
};

const MOUTH_CHILD = {
  id: "child:mouth",
  label: "Mouth Child",
  kind: "variable" as const,
  onInspect: fn(),
  onUnlink: fn(),
  linkControl: {
    enabled: true,
    scale: 0.5,
    offset: 0.1,
    onEnabledChange: fn(),
    onScaleChange: fn(),
    onOffsetChange: fn(),
  },
};

const SMILE_POSE = {
  id: "pose:smile",
  label: "Smile",
  targetValue: 0.5,
  weight: 0.25,
  onInspect: fn(),
  onWeightChange: fn(),
};

const meta = {
  title: "Editor Tools/VariablePipelineStages",
  component: VariablePipelineStages,
  parameters: {
    docs: {
      /**
       * **Required, not cosmetic.** This component's downstream-links prop is
       * named `children` and holds an array of plain objects. `@storybook/react`'s
       * `jsxDecorator` runs on every args story and hands the rendered element to
       * `react-element-to-jsx-string`, which walks `props.children` through
       * `React.Children.toArray` — and throws "Objects are not valid as a React
       * child" before anything paints. `source.type: "code"` is the documented
       * opt-out of that decorator (`skipJsxRender`), and it costs nothing here:
       * Docs shows each story's own source instead of a reconstructed JSX
       * snippet, which is the more useful artefact anyway.
       */
      source: { type: "code" as const },
      description: {
        component: [
          "The **Driver Pipeline** panel from the variable inspector: the stages a driver's value passes through, in order — Parents → Poses → Direct Input → Override → Clamp → Compiled Pipeline — plus the Children it feeds. Each stage is a collapsible; the badges along the top summarise the whole chain at a glance.",
          "This component takes **pure props** and calls no store hooks, so these stories are the real panel, not a mock. Nothing here boots the 3D runtime or the WASM graph.",
          "**What to look for.** This is where `editor/molecules/PropertyGrid` was adopted, so the thing to check is that the numeric fields form **one straight vertical column**:",
          "- Inside an expanded parent link (`ParentLinkCard`), the `Scale`, `Offset` and `Value` number fields should share a left edge. `Scale` and `Offset` have no slider and `Value` does; before `PropertyGrid` they were written as two different inline column templates, which put the first two numbers flush left in column 2 and the third flush right in column 3 — numbers at opposite ends of the same link editor. They also sit in **two separate cards** (`Scale`/`Offset` in the link-math card, `Value` in the parent-direct-input card), so the column has to survive a card boundary too.",
          '- Across the stage sliders (`StageSliders`), Poses / Direct Input / Override are all slider-plus-number and all pass `columns="control-value-actions"` — but **only Direct Input has a trailing `Reset` button**, and measured in the browser their numbers still do **not** share a left edge (196.86px / 294px / 277px at a 380px panel width). `StageSliders` has the measurement and the cause. This is the one claim in the refactor that the panel does not yet deliver, and it is deliberately left visible here rather than staged around.',
          "The rule that actually holds: two separate `PropertyGrid`s line up when every track ahead of the value column is either a fixed token or `1fr` — which is why `ParentLinkCard` aligns across two cards. A **content-sized (`auto`) track breaks it**, because each grid measures its own content.",
          "Collapsibles here expose only `defaultExpanded`/`defaultCollapsed`, so several stories use a `play` function to click the sections open. If a story looks collapsed, the play step has not finished yet.",
        ].join("\n\n"),
      },
    },
  },
  decorators: [
    // The real inspector is a narrow right-hand column, and column alignment is
    // only interesting at a width where the tracks actually compete for space.
    (Story) => (
      <div className="w-[380px]">
        <Story />
      </div>
    ),
  ],
  args: {
    parentExpression: "self + jawParent",
    compiledEquation:
      "effective = clamp(if(override.enabled, override.value, blend(parentContribution, directContribution)))",
    parents: [JAW_PARENT],
    children: [MOUTH_CHILD],
    poses: [SMILE_POSE],
    diagnostics: {
      parentContribution: 0.4,
      poseContribution: 0.125,
      directContribution: 0.2,
      blendedResult: 0.1,
      overrideSelectedResult: 0.1,
      effectiveResult: 0.1,
    },
    directInputEnabled: true,
    directInputPath: "rig/robot/controls/jawOpen",
    rotationDisplayPath: "rig/robot/controls/jawOpen",
    rotationDisplayMode: "degrees",
    directValue: 0.2,
    directDefaultValue: 0,
    directMin: -1,
    directMax: 1,
    directControlDisabled: false,
    directControlReason: null,
    onDirectInputEnabledChange: fn(),
    onDirectValueChange: fn(),
    onDirectReset: fn(),
    overrideEnabled: false,
    overrideValue: 0,
    overrideMin: -1,
    overrideMax: 1,
    onOverrideEnabledChange: fn(),
    onOverrideValueChange: fn(),
    clampEnabled: true,
    onClampEnabledChange: fn(),
    onParentExpressionChange: fn(),
    onAddParent: fn(),
    onAddChild: fn(),
  },
} satisfies Meta<typeof VariablePipelineStages>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The panel as the inspector first shows it: one parent, one pose, one child,
 * direct input on, no override. `Parents` and `Children` open by default; the
 * middle stages start collapsed, which is the component's own choice.
 */
export const Default: Story = {};

/**
 * **The parent-link card — the main artefact of the `PropertyGrid` adoption.**
 *
 * `Scale` and `Offset` (link math) and `Value` (the parent's own direct input)
 * live in two stacked cards inside the expanded link, in two separate
 * `PropertyGrid`s. Measured: both grids resolve to `72px 120px 88px` at the same
 * 42px inset, and all three number fields sit **250px from the panel's left edge**
 * with an identical **83px** width. `Scale`/`Offset` reserve the empty slider track
 * rather than sliding left into it, which is the whole mechanism, and the
 * `property` template's tracks are all fixed tokens or `1fr`, so the two grids
 * agree across the card boundary (contrast `StageSliders`, where a content-sized
 * track makes two grids disagree).
 *
 * The card also prints the same math twice, symbolically and expanded
 * (`s1 = 0.4 * 1 + 0 = 0.4`), so a wrong scale/offset is visible without doing
 * arithmetic.
 */
export const ParentLinkCard: Story = {
  play: async ({ canvasElement }) => {
    const parents = await openStage(
      canvasElement,
      "pipeline-stage-parents",
      /parents/i,
    );
    await expandRow(parents, /jaw parent/i);
  },
};

/**
 * **The stage sliders — Poses, Direct Input and Override, all open at once. This
 * story documents an alignment claim that does not hold.**
 *
 * All three rows pass `columns="control-value-actions"`, and only Direct Input
 * fills the actions cell (`Reset (0.00)`). The refactor's stated goal was that
 * reserving the actions track keeps all three numbers in one column. Measured in
 * a 380px panel, as offsets from the panel's left edge, they are not:
 *
 * | stage | grid inset / width | resolved template | number x |
 * | --- | --- | --- | --- |
 * | Direct Input | 17px / 346px | `139.86px 88px 102.14px` | **164.86** |
 * | Override | 17px / 346px | `237px 88px 5px` | **262** |
 * | Poses | 34px / 312px | `203px 88px 5px` | **245** |
 *
 * Direct Input and Override sit in identically sized, identically placed grids,
 * so those two are directly comparable — and they are 97.14px apart. The value
 * track is a shared 88px in all three, so the widths agree; the offsets do not.
 *
 * Cause: `control-value-actions` resolves to `minmax(0,1fr) <value> auto`, and
 * `auto` is **content-sized**. Override's actions cell is empty, so it collapses
 * to ~0 and its `1fr` control swallows the 97px Direct Input's `Reset` button
 * occupies — pushing Override's value column right by exactly that much
 * (262 − 164.86 = 97.14 = the measured width of Direct Input's actions cell).
 *
 * Subgrid ties rows to *their own* grid's tracks, and these three stages are
 * three separate `PropertyGrid` instances in three separate collapsibles — so
 * nothing makes their `auto` tracks agree. `PropertyGrid.stories`'
 * `LabelLessRowsAlign` demonstrates the fix with all three rows inside **one**
 * grid, where subgrid does make it work; that is not the shape this panel has.
 * A fixed-width actions token, or one grid spanning the stages, would close it.
 *
 * Poses is additionally indented: its grid is nested inside a pose
 * `CollapsibleRow` (grid width 312px starting at x=66, versus 346px at x=49 for
 * the other two), so it could not align with them regardless.
 *
 * One thing that is *not* a fault: enabling the override is the only way to
 * render its slider, and the component deliberately dims the upstream stages
 * (`opacity-45`) while an override is active. Opacity moves nothing, so the
 * measurements above are unaffected.
 */
export const StageSliders: Story = {
  args: { overrideEnabled: true, overrideValue: 0.35 },
  play: async ({ canvasElement }) => {
    const poses = await openStage(
      canvasElement,
      "pipeline-stage-poses",
      /poses/i,
    );
    await expandRow(poses, /smile/i);
    await openStage(canvasElement, "pipeline-stage-direct-input", /direct/i);
    await openStage(canvasElement, "pipeline-stage-override", /override/i);
  },
};

/**
 * A brand-new driver: nothing upstream, nothing downstream, no poses. Every
 * stage still renders with its own empty-state sentence and the `Add Parent
 * Link` / `Add Child Link` affordances, and the header badges all read zero.
 */
export const NoLinks: Story = {
  args: {
    parents: [],
    children: [],
    poses: [],
    parentExpression: "",
    diagnostics: {
      parentContribution: null,
      poseContribution: null,
      directContribution: null,
      blendedResult: 0,
      overrideSelectedResult: 0,
      effectiveResult: 0,
    },
  },
  play: async ({ canvasElement }) => {
    await openStage(canvasElement, "pipeline-stage-poses", /poses/i);
    await openStage(canvasElement, "pipeline-stage-direct-input", /direct/i);
    await openStage(canvasElement, "pipeline-stage-override", /override/i);
  },
};

/**
 * The child side of the same link editor. It has no direct-input card, so only
 * `Scale` and `Offset` appear — and their formula hint reads
 * `Child input = this x scale + offset` rather than the parent's `s1 = …`.
 * Useful as the control case for `ParentLinkCard`: same `PropertyGrid`, one
 * fewer card.
 */
export const ChildLinkCard: Story = {
  play: async ({ canvasElement }) => {
    const children = await openStage(
      canvasElement,
      "pipeline-stage-children",
      /children/i,
    );
    await expandRow(children, /mouth child/i);
  },
};

/**
 * The diagnostics readout, expanded: the three contribution sources, the blended
 * result, the override decision and the effective output, with the runtime
 * equation behind a `<details>`. Every number here comes from the `diagnostics`
 * prop, so this is the story to look at when checking formatting of `null`
 * contributions (see `NoLinks`).
 */
export const CompiledPipeline: Story = {
  play: async ({ canvasElement }) => {
    await openStage(canvasElement, "pipeline-stage-compiled", /compiled/i);
  },
};

/**
 * Something upstream owns this value, so the direct-input slider, number field
 * and `Reset` are all disabled together, the reason is stated in amber, and an
 * `Enable Local Control` escape hatch appears. The disabled row is worth a look
 * next to `StageSliders`: disabling must not change the geometry.
 */
export const DirectControlLockedExternally: Story = {
  args: {
    directControlDisabled: true,
    directControlReason: "A motion graph is driving this input.",
    onEnableLocalControl: fn(),
  },
  play: async ({ canvasElement }) => {
    await openStage(canvasElement, "pipeline-stage-direct-input", /direct/i);
  },
};

/**
 * A pre-migration binding whose expression cannot be safely round-tripped: the
 * editor is disabled, the reason is spelled out, and `Migrate Legacy Formula`
 * offers the way forward. The Parents header badge flips from `Formula editable`
 * to `Legacy formula`.
 */
export const LegacyReadOnlyExpression: Story = {
  args: {
    parentExpressionReadOnly: true,
    parentExpressionReadOnlyReason: "Expression includes custom math.",
    onMigrateLegacyBinding: fn(),
  },
};

/**
 * Rotational drivers are authored in radians but shown in degrees. The direct
 * value is `Math.PI / 2` and the default `Math.PI / 4`, so the field should read
 * `90` and the button `Reset (45.00)` — and the step coarsens to `0.5`, because
 * a radian-sized step is useless on a degree scale.
 *
 * The override is `Math.PI / 6`, chosen because its field renders
 * `29.999999999999996`: the radian→degree conversion is not rounded before it
 * reaches `NumberField`, and nothing downstream trims it. 30° is what a user
 * typed and 30° is not what they get back. The unit tests compare with a `1e-3`
 * tolerance, so they cannot see this; the story can.
 */
export const RotationInDegrees: Story = {
  args: {
    directInputPath: "/propsrig/head/rotation/x",
    rotationDisplayPath: "/propsrig/head/rotation/x",
    directValue: Math.PI / 2,
    directDefaultValue: Math.PI / 4,
    directMin: -Math.PI,
    directMax: Math.PI,
    overrideEnabled: true,
    overrideValue: Math.PI / 6,
    overrideMin: -Math.PI,
    overrideMax: Math.PI,
  },
  play: async ({ canvasElement }) => {
    await openStage(canvasElement, "pipeline-stage-direct-input", /direct/i);
    await openStage(canvasElement, "pipeline-stage-override", /override/i);
  },
};
