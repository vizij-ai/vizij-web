import React from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { Button, CollapsibleGroup, CollapsibleRow, TextArea } from "../ui";
import { NumberField } from "../ui/NumberField";
import { Slider } from "../ui/Slider";
import { Switch } from "../ui/Switch";
import type { RotationDisplayMode } from "../../state/AuthoringUiProvider";
import {
  fromRotationDisplayValue,
  shouldDisplayRotationInDegrees,
  toRotationDisplayValue,
} from "../../utils/rotationDisplay";
import {
  formatPipelineValue,
  resolveEffectiveParentExpressionVariable,
  type PipelineDiagnosticsRow,
} from "./pipelineStages";

export interface PipelineStageLinkItem {
  id: string;
  label: string;
  expressionVariable?: string;
  parentFormula?: string;
  parentFormulaDefault?: string;
  kind: "variable" | "property" | "propsrig";
  onInspect?: () => void;
  onUnlink?: () => void;
  onParentFormulaChange?: (expression: string) => void;
  directControl?: {
    value: number;
    defaultValue?: number;
    min: number;
    max: number;
    path?: string | null;
    onValueChange?: (value: number) => void;
  };
  linkControl?: {
    enabled: boolean;
    scale: number;
    offset: number;
    onEnabledChange?: (enabled: boolean) => void;
    onScaleChange?: (value: number) => void;
    onOffsetChange?: (value: number) => void;
  };
}

export interface PipelineStagePoseItem {
  id: string;
  label: string;
  targetValue: number;
  weight: number;
  onInspect?: () => void;
  onWeightChange?: (value: number) => void;
}

interface VariablePipelineStagesProps {
  parentExpression: string;
  parentExpressionTitle?: string;
  parentExpressionReadOnly?: boolean;
  parentExpressionReadOnlyReason?: string | null;
  parentExpressionAttentionKey?: number;
  onParentExpressionChange?: (expression: string) => void;
  onAddParent?: () => void;
  compiledEquation: string;
  parents: PipelineStageLinkItem[];
  children: PipelineStageLinkItem[];
  poses: PipelineStagePoseItem[];
  diagnostics: PipelineDiagnosticsRow;
  directInputEnabled: boolean;
  directInputPath: string;
  rotationDisplayPath?: string | null;
  rotationDisplayMode: RotationDisplayMode;
  directValue: number;
  directDefaultValue: number;
  directMin: number;
  directMax: number;
  directControlDisabled?: boolean;
  directControlReason?: string | null;
  onDirectInputEnabledChange: (enabled: boolean) => void;
  onDirectValueChange: (value: number) => void;
  onDirectReset: () => void;
  onEnableLocalControl?: () => void;
  overrideEnabled: boolean;
  overrideValue: number;
  overrideMin: number;
  overrideMax: number;
  onOverrideEnabledChange: (enabled: boolean) => void;
  onOverrideValueChange: (value: number) => void;
  clampEnabled: boolean;
  onClampEnabledChange: (enabled: boolean) => void;
  onMigrateLegacyBinding?: () => void;
  onAddChild?: () => void;
  showClampStage?: boolean;
}

type StageHeaderTone = "muted" | "info" | "success" | "warning";

interface StageHeaderBadge {
  label: string;
  tone?: StageHeaderTone;
}

function stageHeaderBadgeClass(tone: StageHeaderTone = "muted"): string {
  switch (tone) {
    case "info":
      return "border-sky-500/35 bg-sky-500/10 text-sky-100";
    case "success":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-100";
    case "warning":
      return "border-amber-500/35 bg-amber-500/10 text-amber-100";
    case "muted":
    default:
      return "border-border-default/50 bg-bg-panel/45 text-text-secondary";
  }
}

function StageSection({
  title,
  hoverText,
  count,
  countLabel,
  headerBadges = [],
  children,
  testId,
  className,
  defaultCollapsed = true,
}: {
  title: string;
  hoverText: string;
  count?: number;
  countLabel?: string;
  headerBadges?: StageHeaderBadge[];
  children: React.ReactNode;
  testId: string;
  className?: string;
  defaultCollapsed?: boolean;
}) {
  const badges: StageHeaderBadge[] = [...headerBadges];
  if (count !== undefined) {
    badges.unshift({
      label:
        countLabel ??
        `${count} ${count === 1 ? "item linked" : "items linked"}`,
      tone: count > 0 ? "info" : "muted",
    });
  }

  return (
    <div className={className} data-testid={testId}>
      <CollapsibleGroup
        title={
          <span
            className="cursor-help underline decoration-dotted underline-offset-4 decoration-border-default/60 hover:decoration-border-default"
            title={hoverText}
          >
            {title}
          </span>
        }
        subtitle={undefined}
        defaultCollapsed={defaultCollapsed}
        className="mb-0 bg-transparent border-border-default/35 data-[state=open]:shadow-none"
        actions={
          badges.length > 0 ? (
            <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-[18rem]">
              {badges.map((badge, index) => (
                <span
                  key={`${badge.label}-${index}`}
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${stageHeaderBadgeClass(
                    badge.tone,
                  )}`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-2">{children}</div>
      </CollapsibleGroup>
    </div>
  );
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return Number(value.toFixed(3)).toString();
}

function formatSignedCompactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "+ 0";
  }
  const absValue = formatCompactNumber(Math.abs(value));
  return value >= 0 ? `+ ${absValue}` : `- ${absValue}`;
}

function toDisplayValue(
  value: number,
  path: string | null | undefined,
  mode: RotationDisplayMode,
): number {
  return shouldDisplayRotationInDegrees(path, mode)
    ? toRotationDisplayValue(value, mode)
    : value;
}

function fromDisplayValue(
  value: number,
  path: string | null | undefined,
  mode: RotationDisplayMode,
): number {
  return shouldDisplayRotationInDegrees(path, mode)
    ? fromRotationDisplayValue(value, mode)
    : value;
}

function resolveDisplayStep(
  min: number,
  max: number,
  path: string | null | undefined,
  mode: RotationDisplayMode,
): number {
  if (shouldDisplayRotationInDegrees(path, mode)) {
    return 0.5;
  }
  return Math.max(0.0001, Math.min(0.1, Math.abs(max - min) / 200));
}

function buildParentVariableFormula(
  parent: Pick<
    PipelineStageLinkItem,
    | "expressionVariable"
    | "linkControl"
    | "directControl"
    | "parentFormula"
    | "parentFormulaDefault"
  >,
): { symbolic: string; expanded: string | null } | null {
  if (!parent.linkControl) {
    return null;
  }
  const scaleText = formatCompactNumber(parent.linkControl.scale);
  const offsetText = formatSignedCompactNumber(parent.linkControl.offset);
  const customFormula =
    parent.parentFormula && parent.parentFormula.trim().length > 0
      ? parent.parentFormula.trim()
      : null;
  const variable = resolveEffectiveParentExpressionVariable({
    expressionVariable: parent.expressionVariable,
    parentFormula: customFormula,
    parentFormulaDefault: parent.parentFormulaDefault,
    fallbackVariable: "s1",
  });
  const symbolic =
    customFormula ?? `${variable} = parent * ${scaleText} ${offsetText}`;
  if (customFormula) {
    return { symbolic, expanded: null };
  }
  if (!parent.directControl) {
    return { symbolic, expanded: null };
  }
  const parentValue = parent.directControl.value;
  const expandedValue =
    parentValue * parent.linkControl.scale + parent.linkControl.offset;
  const expanded = `${variable} = ${formatCompactNumber(parentValue)} * ${scaleText} ${offsetText} = ${formatCompactNumber(expandedValue)}`;
  return { symbolic, expanded };
}

function LinkControlEditor({
  linkControl,
  context,
  expressionVariable,
  sourceValue,
}: {
  linkControl: NonNullable<PipelineStageLinkItem["linkControl"]>;
  context: "parent" | "child";
  expressionVariable?: string;
  sourceValue?: number;
}) {
  const variableToken =
    expressionVariable && expressionVariable.trim().length > 0
      ? expressionVariable.trim()
      : "s1";
  const scaleText = formatCompactNumber(linkControl.scale);
  const offsetText = formatSignedCompactNumber(linkControl.offset);
  const formulaHint =
    context === "parent"
      ? `${variableToken} = parent * scale + offset`
      : "Child input = this x scale + offset";
  const expandedFormulaHint =
    context === "parent" &&
    typeof sourceValue === "number" &&
    Number.isFinite(sourceValue)
      ? `${variableToken} = ${formatCompactNumber(sourceValue)} * ${scaleText} ${offsetText} = ${formatCompactNumber(
          sourceValue * linkControl.scale + linkControl.offset,
        )}`
      : null;

  return (
    <div className="rounded-md bg-bg-panel/15 px-2 py-1.5 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Switch
          checked={linkControl.enabled}
          onChange={(checked) => linkControl.onEnabledChange?.(checked)}
          label={linkControl.enabled ? "Link Enabled" : "Link Disabled"}
          hint="Toggle this connection on/off."
          size="sm"
        />
        <div className="flex flex-col items-end">
          <span className="text-[9px] text-text-muted">{formulaHint}</span>
          {expandedFormulaHint ? (
            <span className="text-[9px] text-text-muted font-mono">
              {expandedFormulaHint}
            </span>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-[58px_72px] items-center gap-2">
        <span className="text-[10px] text-text-secondary">Scale</span>
        <NumberField
          size="sm"
          value={linkControl.scale}
          step={0.01}
          commitMode="blur"
          allowScrub={false}
          onChange={(value) => linkControl.onScaleChange?.(value)}
          disabled={!linkControl.enabled}
        />
      </div>
      <div className="grid grid-cols-[58px_72px] items-center gap-2">
        <span className="text-[10px] text-text-secondary">Offset</span>
        <NumberField
          size="sm"
          value={linkControl.offset}
          step={0.01}
          commitMode="blur"
          allowScrub={false}
          onChange={(value) => linkControl.onOffsetChange?.(value)}
          disabled={!linkControl.enabled}
        />
      </div>
    </div>
  );
}

function ParentDirectControlEditor({
  directControl,
  rotationDisplayMode,
}: {
  directControl: NonNullable<PipelineStageLinkItem["directControl"]>;
  rotationDisplayMode: RotationDisplayMode;
}) {
  const displayMin = toDisplayValue(
    directControl.min,
    directControl.path,
    rotationDisplayMode,
  );
  const displayMax = toDisplayValue(
    directControl.max,
    directControl.path,
    rotationDisplayMode,
  );
  const displayValue = toDisplayValue(
    directControl.value,
    directControl.path,
    rotationDisplayMode,
  );
  const displayStep = resolveDisplayStep(
    directControl.min,
    directControl.max,
    directControl.path,
    rotationDisplayMode,
  );
  return (
    <div className="rounded-md bg-bg-panel/15 px-2 py-1.5 flex flex-col gap-1">
      <div className="text-[10px] text-text-secondary">Parent direct input</div>
      <div className="grid grid-cols-[58px_minmax(0,1fr)_72px] items-center gap-2">
        <span className="text-[10px] text-text-secondary">Value</span>
        <Slider
          min={displayMin}
          max={displayMax}
          step={displayStep}
          value={displayValue}
          defaultValue={
            typeof directControl.defaultValue === "number"
              ? toDisplayValue(
                  directControl.defaultValue,
                  directControl.path,
                  rotationDisplayMode,
                )
              : undefined
          }
          onChange={(value) =>
            directControl.onValueChange?.(
              fromDisplayValue(
                value as number,
                directControl.path,
                rotationDisplayMode,
              ),
            )
          }
        />
        <NumberField
          size="sm"
          value={displayValue}
          min={displayMin}
          max={displayMax}
          step={displayStep}
          allowScrub={false}
          onChange={(value) =>
            directControl.onValueChange?.(
              fromDisplayValue(value, directControl.path, rotationDisplayMode),
            )
          }
        />
      </div>
    </div>
  );
}

export function VariablePipelineStages({
  parentExpression,
  parentExpressionTitle = "Authored Parent Expression",
  parentExpressionReadOnly = false,
  parentExpressionReadOnlyReason = null,
  parentExpressionAttentionKey = 0,
  onParentExpressionChange,
  onAddParent,
  compiledEquation,
  parents,
  children,
  poses,
  diagnostics,
  directInputEnabled,
  directInputPath,
  rotationDisplayPath = null,
  rotationDisplayMode,
  directValue,
  directDefaultValue,
  directMin,
  directMax,
  directControlDisabled = false,
  directControlReason = null,
  onDirectInputEnabledChange,
  onDirectValueChange,
  onDirectReset,
  onEnableLocalControl,
  overrideEnabled,
  overrideValue,
  overrideMin,
  overrideMax,
  onOverrideEnabledChange,
  onOverrideValueChange,
  clampEnabled,
  onClampEnabledChange,
  onMigrateLegacyBinding,
  onAddChild,
  showClampStage = true,
}: VariablePipelineStagesProps) {
  const currentDisplayMin = toDisplayValue(
    directMin,
    rotationDisplayPath,
    rotationDisplayMode,
  );
  const currentDisplayMax = toDisplayValue(
    directMax,
    rotationDisplayPath,
    rotationDisplayMode,
  );
  const currentDisplayValue = toDisplayValue(
    directValue,
    rotationDisplayPath,
    rotationDisplayMode,
  );
  const currentDisplayDefault = toDisplayValue(
    directDefaultValue,
    rotationDisplayPath,
    rotationDisplayMode,
  );
  const currentDisplayStep = resolveDisplayStep(
    directMin,
    directMax,
    rotationDisplayPath,
    rotationDisplayMode,
  );
  const overrideDisplayMin = toDisplayValue(
    overrideMin,
    rotationDisplayPath,
    rotationDisplayMode,
  );
  const overrideDisplayMax = toDisplayValue(
    overrideMax,
    rotationDisplayPath,
    rotationDisplayMode,
  );
  const overrideDisplayValue = toDisplayValue(
    overrideValue,
    rotationDisplayPath,
    rotationDisplayMode,
  );
  const overrideDisplayStep = resolveDisplayStep(
    overrideMin,
    overrideMax,
    rotationDisplayPath,
    rotationDisplayMode,
  );
  const [parentExpressionDraft, setParentExpressionDraft] =
    React.useState(parentExpression);
  const [parentFormulaDraftById, setParentFormulaDraftById] = React.useState<
    Record<string, string>
  >({});
  const parentExpressionEditorRef = React.useRef<HTMLTextAreaElement | null>(
    null,
  );
  const parentFormulaSourceByIdRef = React.useRef<Record<string, string>>({});
  React.useEffect(() => {
    setParentExpressionDraft(parentExpression);
  }, [parentExpression]);
  React.useEffect(() => {
    if (
      parentExpressionAttentionKey <= 0 ||
      !parentExpressionEditorRef.current
    ) {
      return;
    }
    parentExpressionEditorRef.current.focus();
    parentExpressionEditorRef.current.select();
  }, [parentExpressionAttentionKey]);
  React.useEffect(() => {
    setParentFormulaDraftById((previous) => {
      const next = { ...previous };
      const nextSourceById: Record<string, string> = {};
      const activeIds = new Set<string>();
      let changed = false;

      parents.forEach((parent) => {
        if (!parent.onParentFormulaChange) {
          return;
        }
        const formula =
          parent.parentFormula && parent.parentFormula.trim().length > 0
            ? parent.parentFormula
            : (parent.parentFormulaDefault ?? "");
        activeIds.add(parent.id);
        nextSourceById[parent.id] = formula;
        const previousSource = parentFormulaSourceByIdRef.current[parent.id];
        const previousDraft = previous[parent.id];
        if (previousDraft === undefined) {
          next[parent.id] = formula;
          changed = true;
          return;
        }
        if (
          previousSource !== undefined &&
          formula !== previousSource &&
          previousDraft === previousSource
        ) {
          next[parent.id] = formula;
          changed = true;
        }
      });

      Object.keys(next).forEach((id) => {
        if (!activeIds.has(id)) {
          delete next[id];
          changed = true;
        }
      });

      parentFormulaSourceByIdRef.current = nextSourceById;
      return changed ? next : previous;
    });
  }, [parents]);
  const parentExpressionDirty =
    parentExpressionDraft.trim() !== parentExpression.trim();
  const canEditParentExpression =
    Boolean(onParentExpressionChange) && !parentExpressionReadOnly;
  const sourceSectionClass = overrideEnabled
    ? "opacity-45 saturate-75 transition-opacity"
    : "";
  const parentVariableMappings = React.useMemo(
    () =>
      parents
        .map((parent) => ({
          parent,
          formula: buildParentVariableFormula(parent),
        }))
        .filter(
          (
            entry,
          ): entry is {
            parent: PipelineStageLinkItem;
            formula: { symbolic: string; expanded: string | null };
          } => entry.formula !== null,
        ),
    [parents],
  );

  return (
    <div
      className="px-1 py-1 flex flex-col gap-2"
      data-testid="variable-pipeline-stages"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Driver Pipeline
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stageHeaderBadgeClass(
                parents.length > 0 ? "info" : "muted",
              )}`}
            >
              {parents.length} {parents.length === 1 ? "parent" : "parents"}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stageHeaderBadgeClass(
                poses.length > 0 ? "info" : "muted",
              )}`}
            >
              {poses.length} {poses.length === 1 ? "pose" : "poses"}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stageHeaderBadgeClass(
                children.length > 0 ? "info" : "muted",
              )}`}
            >
              {children.length} {children.length === 1 ? "child" : "children"}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stageHeaderBadgeClass(
                directInputEnabled ? "success" : "muted",
              )}`}
            >
              Direct {directInputEnabled ? "On" : "Off"}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stageHeaderBadgeClass(
                overrideEnabled ? "warning" : "muted",
              )}`}
            >
              Override {overrideEnabled ? "On" : "Off"}
            </span>
          </div>
        </div>
      </div>

      <StageSection
        key={`pipeline-stage-parents-${parentExpressionAttentionKey}`}
        title="Parents"
        hoverText="Upstream drivers that contribute parent math."
        count={parents.length}
        countLabel={`${parents.length} ${parents.length === 1 ? "parent link" : "parent links"}`}
        headerBadges={[
          {
            label: parentExpressionReadOnly
              ? "Legacy formula"
              : "Formula editable",
            tone: parentExpressionReadOnly ? "warning" : "success",
          },
        ]}
        testId="pipeline-stage-parents"
        className={sourceSectionClass}
        defaultCollapsed={false}
      >
        <div className="rounded-md bg-bg-input/20 p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-[9px] uppercase tracking-wide text-text-muted">
              {parentExpressionTitle}
            </div>
            {onMigrateLegacyBinding ? (
              <Button
                variant="secondary"
                size="sm"
                className="h-6 text-[10px]"
                onClick={onMigrateLegacyBinding}
                data-testid="pipeline-migrate-action"
              >
                Migrate Legacy Formula
              </Button>
            ) : null}
          </div>
          {onParentExpressionChange ? (
            <div className="flex flex-col gap-1.5">
              <TextArea
                ref={parentExpressionEditorRef}
                value={parentExpressionDraft}
                onChange={(event) =>
                  setParentExpressionDraft(event.target.value)
                }
                rows={2}
                className="min-h-[52px] text-[10px] leading-snug break-all bg-bg-panel/60 border-border-default/60"
                disabled={parentExpressionReadOnly}
                data-testid="pipeline-parent-expression-editor"
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() =>
                    onParentExpressionChange(parentExpressionDraft)
                  }
                  disabled={!canEditParentExpression || !parentExpressionDirty}
                >
                  Apply Expression
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => setParentExpressionDraft(parentExpression)}
                  disabled={!parentExpressionDirty}
                >
                  Reset
                </Button>
                {parentExpressionReadOnly ? (
                  <span className="text-[10px] text-amber-300/90">
                    Legacy read-only expression
                    {parentExpressionReadOnlyReason
                      ? `: ${parentExpressionReadOnlyReason}`
                      : "."}
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <code className="text-[10px] text-text-primary break-all">
              {parentExpression.trim().length > 0 ? parentExpression : "n/a"}
            </code>
          )}
          {parentVariableMappings.length > 0 ? (
            <div
              className="mt-2 rounded-md border border-border-default/60 bg-bg-panel/50 p-2 flex flex-col gap-1"
              data-testid="pipeline-parent-variable-mapping"
            >
              <span className="text-[9px] uppercase tracking-wide text-text-muted">
                Parent Variable Mapping
              </span>
              {parentVariableMappings.map(({ parent, formula }) => (
                <div key={`mapping-${parent.id}`} className="flex flex-col">
                  <code className="text-[10px] text-text-primary break-all">
                    {formula.symbolic}
                  </code>
                  {formula.expanded ? (
                    <code className="text-[9px] text-text-muted break-all">
                      {formula.expanded}
                    </code>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {parents.length > 0 ? (
          <div className="flex flex-col gap-2">
            {parents.map((parent) => {
              const parentFormula =
                parent.parentFormula && parent.parentFormula.trim().length > 0
                  ? parent.parentFormula
                  : (parent.parentFormulaDefault ?? "");
              const parentFormulaDraft =
                parentFormulaDraftById[parent.id] ?? parentFormula;
              const parentFormulaDirty =
                parentFormulaDraft.trim() !== parentFormula.trim();
              return (
                <CollapsibleRow
                  key={parent.id}
                  id={`pipeline-parent-${parent.id}`}
                  title={parent.label}
                  subtitle={
                    parent.linkControl
                      ? `${parent.expressionVariable ? `${parent.expressionVariable} · ` : ""}${
                          parent.linkControl.enabled ? "Enabled" : "Disabled"
                        } · scale ${formatCompactNumber(
                          parent.linkControl.scale,
                        )} · offset ${formatCompactNumber(
                          parent.linkControl.offset,
                        )}`
                      : "No link controls configured"
                  }
                  defaultExpanded={false}
                  showSlider={false}
                  className="bg-transparent border-border-default/30 group-data-[state=open]:shadow-none group-data-[state=open]:border-border-default/45"
                  actions={
                    <>
                      {parent.onInspect ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] gap-1.5"
                          onClick={parent.onInspect}
                        >
                          Inspect
                          <ArrowRight size={11} aria-hidden="true" />
                        </Button>
                      ) : null}
                      {parent.onUnlink ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] gap-1.5 text-red-300 hover:text-red-200"
                          onClick={parent.onUnlink}
                        >
                          Delete
                          <Trash2 size={11} aria-hidden="true" />
                        </Button>
                      ) : null}
                    </>
                  }
                  expandedContent={
                    <div className="flex flex-col gap-1.5">
                      {parent.linkControl ? (
                        <LinkControlEditor
                          linkControl={parent.linkControl}
                          context="parent"
                          expressionVariable={parent.expressionVariable}
                          sourceValue={parent.directControl?.value}
                        />
                      ) : null}
                      {parent.directControl ? (
                        <ParentDirectControlEditor
                          directControl={parent.directControl}
                          rotationDisplayMode={rotationDisplayMode}
                        />
                      ) : null}
                      {parent.onParentFormulaChange ? (
                        <details className="rounded-md border border-border-default/50 bg-bg-input/20 px-2 py-1.5">
                          <summary className="cursor-pointer text-[10px] font-semibold text-text-secondary">
                            Advanced Formula
                          </summary>
                          <div className="mt-2 flex flex-col gap-1.5">
                            <span className="text-[9px] text-text-muted">
                              Edit this parent contribution formula directly.
                            </span>
                            <TextArea
                              value={parentFormulaDraft}
                              onChange={(event) =>
                                setParentFormulaDraftById((previous) => ({
                                  ...previous,
                                  [parent.id]: event.target.value,
                                }))
                              }
                              rows={2}
                              className="min-h-[52px] text-[10px] leading-snug break-all bg-bg-panel/60 border-border-default/60"
                              data-testid={`pipeline-parent-formula-editor-${parent.id}`}
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-6 text-[10px]"
                                onClick={() =>
                                  parent.onParentFormulaChange?.(
                                    parentFormulaDraft,
                                  )
                                }
                                disabled={!parentFormulaDirty}
                              >
                                Apply Formula
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px]"
                                onClick={() =>
                                  setParentFormulaDraftById((previous) => ({
                                    ...previous,
                                    [parent.id]: parentFormula,
                                  }))
                                }
                                disabled={!parentFormulaDirty}
                              >
                                Reset
                              </Button>
                            </div>
                          </div>
                        </details>
                      ) : null}
                    </div>
                  }
                />
              );
            })}
          </div>
        ) : (
          <span className="text-[10px] text-text-muted">
            No parent links configured.
          </span>
        )}
        {onAddParent ? (
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-[10px] w-fit gap-1.5 font-semibold border-accent/50 text-accent hover:bg-accent/15"
            onClick={onAddParent}
          >
            <Plus size={11} aria-hidden="true" />
            Add Parent Link
          </Button>
        ) : null}
      </StageSection>

      <StageSection
        title="Poses"
        hoverText="Pose targets and blend weights for this driver."
        count={poses.length}
        countLabel={`${poses.length} ${poses.length === 1 ? "pose target" : "pose targets"}`}
        testId="pipeline-stage-poses"
        className={sourceSectionClass}
      >
        {poses.length > 0 ? (
          <div className="flex flex-col gap-2">
            {poses.map((pose) => (
              <CollapsibleRow
                key={pose.id}
                id={`pipeline-pose-${pose.id}`}
                title={pose.label}
                subtitle={`Target ${toDisplayValue(
                  pose.targetValue,
                  rotationDisplayPath,
                  rotationDisplayMode,
                ).toFixed(3)} · Weight ${pose.weight.toFixed(3)}`}
                defaultExpanded={false}
                showSlider={false}
                className="bg-transparent border-border-default/30 group-data-[state=open]:shadow-none group-data-[state=open]:border-border-default/45"
                actions={
                  pose.onInspect ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] gap-1.5"
                      onClick={pose.onInspect}
                    >
                      Inspect Pose
                      <ArrowRight size={11} aria-hidden="true" />
                    </Button>
                  ) : undefined
                }
                expandedContent={
                  <div className="grid grid-cols-[minmax(0,1fr)_90px] items-center gap-2">
                    <Slider
                      min={0}
                      max={1}
                      step={0.01}
                      value={pose.weight}
                      onChange={(value) =>
                        pose.onWeightChange?.(value as number)
                      }
                    />
                    <NumberField
                      size="sm"
                      min={0}
                      max={1}
                      step={0.01}
                      value={pose.weight}
                      allowScrub={false}
                      onChange={pose.onWeightChange}
                    />
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-text-muted">
            No pose targets for this driver.
          </span>
        )}
      </StageSection>

      <StageSection
        title="Direct Input"
        hoverText="Optional direct control path for this driver."
        headerBadges={[
          {
            label: directInputEnabled ? "Direct enabled" : "Direct disabled",
            tone: directInputEnabled ? "success" : "muted",
          },
          {
            label: directControlDisabled
              ? "Locked externally"
              : "Local control",
            tone: directControlDisabled ? "warning" : "info",
          },
        ]}
        testId="pipeline-stage-direct-input"
        className={sourceSectionClass}
      >
        <div className="flex items-center gap-3">
          <Switch
            checked={directInputEnabled}
            onChange={onDirectInputEnabledChange}
            label={directInputEnabled ? "Enabled" : "Disabled"}
            size="sm"
            disabled={directControlDisabled}
          />
          <span className="text-[10px] text-text-secondary">
            Inspector-only runtime control.
          </span>
        </div>
        <code className="text-[10px] text-text-muted break-all">
          Path: {directInputPath}
        </code>
        <div
          className="grid grid-cols-[minmax(0,1fr)_90px_auto] items-center gap-2"
          title={directControlReason ?? undefined}
        >
          <Slider
            min={currentDisplayMin}
            max={currentDisplayMax}
            step={currentDisplayStep}
            value={currentDisplayValue}
            defaultValue={currentDisplayDefault}
            onChange={(value) =>
              onDirectValueChange(
                fromDisplayValue(
                  value as number,
                  rotationDisplayPath,
                  rotationDisplayMode,
                ),
              )
            }
            disabled={!directInputEnabled || directControlDisabled}
          />
          <NumberField
            size="sm"
            value={currentDisplayValue}
            min={currentDisplayMin}
            max={currentDisplayMax}
            step={currentDisplayStep}
            allowScrub={false}
            onChange={(value) =>
              onDirectValueChange(
                fromDisplayValue(
                  value,
                  rotationDisplayPath,
                  rotationDisplayMode,
                ),
              )
            }
            disabled={!directInputEnabled || directControlDisabled}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px]"
            onClick={onDirectReset}
            disabled={!directInputEnabled || directControlDisabled}
          >
            Reset ({currentDisplayDefault.toFixed(2)})
          </Button>
        </div>
        {directControlReason ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-amber-300/90">
              {directControlReason}
            </span>
            {onEnableLocalControl ? (
              <Button
                variant="secondary"
                size="sm"
                className="h-6 text-[10px] whitespace-nowrap"
                onClick={onEnableLocalControl}
              >
                Enable Local Control
              </Button>
            ) : null}
          </div>
        ) : null}
      </StageSection>

      <StageSection
        title="Override"
        hoverText="Optional runtime override for effective output."
        headerBadges={[
          {
            label: overrideEnabled ? "Override enabled" : "Override disabled",
            tone: overrideEnabled ? "warning" : "muted",
          },
        ]}
        testId="pipeline-stage-override"
      >
        <div className="flex items-center gap-3">
          <Switch
            checked={overrideEnabled}
            onChange={onOverrideEnabledChange}
            label={overrideEnabled ? "Enabled" : "Disabled"}
            size="sm"
          />
          <span className="text-[10px] text-text-secondary">
            Uses inspector override path when enabled.
          </span>
        </div>
        {overrideEnabled ? (
          <div className="grid grid-cols-[minmax(0,1fr)_90px] items-center gap-2">
            <Slider
              min={overrideDisplayMin}
              max={overrideDisplayMax}
              step={overrideDisplayStep}
              value={overrideDisplayValue}
              onChange={(value) =>
                onOverrideValueChange(
                  fromDisplayValue(
                    value as number,
                    rotationDisplayPath,
                    rotationDisplayMode,
                  ),
                )
              }
            />
            <NumberField
              size="sm"
              value={overrideDisplayValue}
              min={overrideDisplayMin}
              max={overrideDisplayMax}
              step={overrideDisplayStep}
              allowScrub={false}
              onChange={(value) =>
                onOverrideValueChange(
                  fromDisplayValue(
                    value,
                    rotationDisplayPath,
                    rotationDisplayMode,
                  ),
                )
              }
            />
          </div>
        ) : (
          <span className="text-[10px] text-text-muted">
            Enable override to set a fixed output value.
          </span>
        )}
      </StageSection>

      {showClampStage ? (
        <StageSection
          title="Clamp"
          hoverText="Final output bounding for this driver."
          headerBadges={[
            {
              label: clampEnabled ? "Clamp enabled" : "Clamp disabled",
              tone: clampEnabled ? "success" : "warning",
            },
          ]}
          testId="pipeline-stage-clamp"
        >
          <div className="flex items-center gap-3">
            <Switch
              checked={clampEnabled}
              onChange={onClampEnabledChange}
              label={clampEnabled ? "Enabled" : "Disabled"}
              size="sm"
            />
            <span className="text-[10px] text-text-secondary">
              Disabling clamp allows unbounded output.
            </span>
          </div>
        </StageSection>
      ) : null}

      <StageSection
        title="Compiled Pipeline"
        hoverText="Live contribution flow and resulting output."
        headerBadges={[
          {
            label: directInputEnabled ? "Direct active" : "Direct bypassed",
            tone: directInputEnabled ? "success" : "muted",
          },
          {
            label: overrideEnabled ? "Override active" : "Override bypassed",
            tone: overrideEnabled ? "warning" : "muted",
          },
        ]}
        testId="pipeline-stage-compiled"
      >
        <div className="rounded-lg border border-border-default/45 bg-bg-panel/25 p-2.5 flex flex-col gap-2.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div
              className="rounded-md border border-sky-500/35 bg-sky-500/10 px-2 py-1.5"
              data-testid="pipeline-compiled-source-parents"
            >
              <div className="text-[10px] font-semibold text-sky-100">
                Parents
              </div>
              <div className="text-[11px] font-mono text-sky-50">
                {formatPipelineValue(diagnostics.parentContribution)}
              </div>
            </div>
            <div
              className="rounded-md border border-fuchsia-500/35 bg-fuchsia-500/10 px-2 py-1.5"
              data-testid="pipeline-compiled-source-poses"
            >
              <div className="text-[10px] font-semibold text-fuchsia-100">
                Poses
              </div>
              <div className="text-[11px] font-mono text-fuchsia-50">
                {formatPipelineValue(diagnostics.poseContribution)}
              </div>
            </div>
            <div
              className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2 py-1.5"
              data-testid="pipeline-compiled-source-direct"
            >
              <div className="text-[10px] font-semibold text-emerald-100">
                Direct
              </div>
              <div className="text-[11px] font-mono text-emerald-50">
                {formatPipelineValue(diagnostics.directContribution)}
              </div>
            </div>
          </div>

          <div className="text-[10px] text-text-muted text-center font-medium">
            Parents + poses + direct blend into one pipeline value.
          </div>

          <div
            className="rounded-md border border-indigo-500/35 bg-indigo-500/10 px-2 py-1.5"
            data-testid="pipeline-compiled-blended"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-indigo-100">
                Blended Result
              </span>
              <span className="text-[11px] font-mono text-indigo-50">
                {formatPipelineValue(diagnostics.blendedResult)}
              </span>
            </div>
          </div>

          <div
            className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1.5"
            data-testid="pipeline-compiled-override"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-amber-100">
                Override Decision
              </span>
              <span className="text-[10px] font-semibold text-amber-50">
                {overrideEnabled ? "Override On" : "Override Off"}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-amber-50/90 font-mono">
              Selected:{" "}
              {formatPipelineValue(diagnostics.overrideSelectedResult)}
            </div>
          </div>

          <div
            className="rounded-md border border-green-500/35 bg-green-500/10 px-2 py-1.5"
            data-testid="pipeline-compiled-effective"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-green-100">
                Effective Output
              </span>
              <span className="text-[11px] font-mono text-green-50">
                {formatPipelineValue(diagnostics.effectiveResult)}
              </span>
            </div>
          </div>

          <details className="rounded border border-border-default/45 bg-bg-input/25 px-2 py-1.5">
            <summary className="cursor-pointer text-[10px] font-semibold text-text-secondary">
              Runtime equation
            </summary>
            <code
              className="mt-1 block text-[10px] text-text-primary break-all"
              data-testid="pipeline-compiled-equation"
            >
              {compiledEquation}
            </code>
          </details>
        </div>
      </StageSection>

      <StageSection
        title="Children"
        hoverText="Downstream drivers driven by this driver."
        count={children.length}
        countLabel={`${children.length} ${children.length === 1 ? "child link" : "child links"}`}
        testId="pipeline-stage-children"
        defaultCollapsed={false}
      >
        {children.length > 0 ? (
          <div className="flex flex-col gap-2">
            {children.map((child) => (
              <CollapsibleRow
                key={child.id}
                id={`pipeline-child-${child.id}`}
                title={child.label}
                subtitle={
                  child.linkControl
                    ? `child += me * ${formatCompactNumber(
                        child.linkControl.scale,
                      )} + ${formatCompactNumber(child.linkControl.offset)}`
                    : "No shared link controls configured"
                }
                defaultExpanded={false}
                showSlider={false}
                className="bg-transparent border-border-default/30 group-data-[state=open]:shadow-none group-data-[state=open]:border-border-default/45"
                actions={
                  <>
                    {child.onInspect ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] gap-1.5"
                        onClick={child.onInspect}
                      >
                        Inspect
                        <ArrowRight size={11} aria-hidden="true" />
                      </Button>
                    ) : null}
                    {child.onUnlink ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] gap-1.5 text-red-300 hover:text-red-200"
                        onClick={child.onUnlink}
                      >
                        Delete
                        <Trash2 size={11} aria-hidden="true" />
                      </Button>
                    ) : null}
                  </>
                }
                expandedContent={
                  child.linkControl ? (
                    <div className="rounded-md bg-bg-panel/15 px-2 py-1.5 flex flex-col gap-1.5">
                      <Switch
                        checked={child.linkControl.enabled}
                        onChange={(enabled) =>
                          child.linkControl?.onEnabledChange?.(enabled)
                        }
                        label={
                          child.linkControl.enabled
                            ? "Link Enabled"
                            : "Link Disabled"
                        }
                        size="sm"
                      />
                      <div className="grid grid-cols-[58px_72px] items-center gap-2">
                        <span className="text-[10px] text-text-secondary">
                          Scale
                        </span>
                        <NumberField
                          size="sm"
                          value={child.linkControl.scale}
                          step={0.01}
                          commitMode="blur"
                          allowScrub={false}
                          onChange={(value) =>
                            child.linkControl?.onScaleChange?.(value)
                          }
                          disabled={!child.linkControl.enabled}
                        />
                      </div>
                      <div className="grid grid-cols-[58px_72px] items-center gap-2">
                        <span className="text-[10px] text-text-secondary">
                          Offset
                        </span>
                        <NumberField
                          size="sm"
                          value={child.linkControl.offset}
                          step={0.01}
                          commitMode="blur"
                          allowScrub={false}
                          onChange={(value) =>
                            child.linkControl?.onOffsetChange?.(value)
                          }
                          disabled={!child.linkControl.enabled}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-[10px] text-text-muted">
                      No child link controls available.
                    </span>
                  )
                }
              />
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-text-muted">
            No children currently driven by this driver.
          </span>
        )}
        {onAddChild ? (
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-[10px] w-fit gap-1.5 font-semibold border-accent/50 text-accent hover:bg-accent/15"
            onClick={onAddChild}
          >
            <Plus size={11} aria-hidden="true" />
            Add Child Link
          </Button>
        ) : null}
      </StageSection>
    </div>
  );
}
