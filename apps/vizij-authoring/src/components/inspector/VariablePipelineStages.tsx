import React from "react";
import { ArrowRight, Plus } from "lucide-react";
import { Button, CollapsibleGroup, CollapsibleRow, TextArea } from "../ui";
import { NumberField } from "../ui/NumberField";
import { Slider } from "../ui/Slider";
import { Switch } from "../ui/Switch";
import {
  formatPipelineValue,
  type PipelineDiagnosticsRow,
} from "./pipelineStages";

export interface PipelineStageLinkItem {
  id: string;
  label: string;
  kind: "variable" | "property" | "autorig";
  onInspect?: () => void;
  onUnlink?: () => void;
  directControl?: {
    value: number;
    min: number;
    max: number;
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
  onParentExpressionChange?: (expression: string) => void;
  onAddParent?: () => void;
  compiledEquation: string;
  parents: PipelineStageLinkItem[];
  children: PipelineStageLinkItem[];
  poses: PipelineStagePoseItem[];
  diagnostics: PipelineDiagnosticsRow;
  directInputEnabled: boolean;
  directInputPath: string;
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

function LinkControlEditor({
  linkControl,
  context,
}: {
  linkControl: NonNullable<PipelineStageLinkItem["linkControl"]>;
  context: "parent" | "child";
}) {
  const formulaHint =
    context === "parent"
      ? "Contribution = parent x scale + offset"
      : "Child input = this x scale + offset";

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
        <span className="text-[9px] text-text-muted">{formulaHint}</span>
      </div>
      <div className="grid grid-cols-[58px_72px] items-center gap-2">
        <span className="text-[10px] text-text-secondary">Scale</span>
        <NumberField
          size="sm"
          value={linkControl.scale}
          min={-3}
          max={3}
          step={0.01}
          onChange={(value) => linkControl.onScaleChange?.(value)}
          disabled={!linkControl.enabled}
        />
      </div>
      <div className="grid grid-cols-[58px_72px] items-center gap-2">
        <span className="text-[10px] text-text-secondary">Offset</span>
        <NumberField
          size="sm"
          value={linkControl.offset}
          min={-2}
          max={2}
          step={0.01}
          onChange={(value) => linkControl.onOffsetChange?.(value)}
          disabled={!linkControl.enabled}
        />
      </div>
    </div>
  );
}

function ParentDirectControlEditor({
  directControl,
}: {
  directControl: NonNullable<PipelineStageLinkItem["directControl"]>;
}) {
  return (
    <div className="rounded-md bg-bg-panel/15 px-2 py-1.5 flex flex-col gap-1">
      <div className="text-[10px] text-text-secondary">Parent direct input</div>
      <div className="grid grid-cols-[58px_minmax(0,1fr)_72px] items-center gap-2">
        <span className="text-[10px] text-text-secondary">Value</span>
        <Slider
          min={directControl.min}
          max={directControl.max}
          step={0.01}
          value={directControl.value}
          onChange={(value) => directControl.onValueChange?.(value as number)}
        />
        <NumberField
          size="sm"
          value={directControl.value}
          min={directControl.min}
          max={directControl.max}
          step={0.01}
          onChange={(value) => directControl.onValueChange?.(value)}
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
  onParentExpressionChange,
  onAddParent,
  compiledEquation,
  parents,
  children,
  poses,
  diagnostics,
  directInputEnabled,
  directInputPath,
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
  const [parentExpressionDraft, setParentExpressionDraft] =
    React.useState(parentExpression);
  React.useEffect(() => {
    setParentExpressionDraft(parentExpression);
  }, [parentExpression]);
  const parentExpressionDirty =
    parentExpressionDraft.trim() !== parentExpression.trim();
  const canEditParentExpression =
    Boolean(onParentExpressionChange) && !parentExpressionReadOnly;
  const sourceSectionClass = overrideEnabled
    ? "opacity-45 saturate-75 transition-opacity"
    : "";

  return (
    <div
      className="px-1 py-1 flex flex-col gap-2"
      data-testid="variable-pipeline-stages"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Variable Pipeline
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
        title="Parents"
        hoverText="Upstream variables that contribute parent math."
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
        </div>
        {parents.length > 0 ? (
          <div className="flex flex-col gap-2">
            {parents.map((parent) => (
              <CollapsibleRow
                key={parent.id}
                id={`pipeline-parent-${parent.id}`}
                title={parent.label}
                subtitle={
                  parent.linkControl
                    ? `${
                        parent.linkControl.enabled ? "Enabled" : "Disabled"
                      } · scale ${formatCompactNumber(
                        parent.linkControl.scale,
                      )} · offset ${formatCompactNumber(parent.linkControl.offset)}`
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
                  </>
                }
                expandedContent={
                  <div className="flex flex-col gap-1.5">
                    {parent.linkControl ? (
                      <LinkControlEditor
                        linkControl={parent.linkControl}
                        context="parent"
                      />
                    ) : null}
                    {parent.directControl ? (
                      <ParentDirectControlEditor
                        directControl={parent.directControl}
                      />
                    ) : null}
                  </div>
                }
              />
            ))}
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
        hoverText="Pose targets and blend weights for this variable."
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
                subtitle={`Target ${pose.targetValue.toFixed(
                  3,
                )} · Weight ${pose.weight.toFixed(3)}`}
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
                      onChange={pose.onWeightChange}
                    />
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-text-muted">
            No pose targets for this variable.
          </span>
        )}
      </StageSection>

      <StageSection
        title="Direct Input"
        hoverText="Optional direct control path for this variable."
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
            min={directMin}
            max={directMax}
            step={0.01}
            value={directValue}
            onChange={(value) => onDirectValueChange(value as number)}
            disabled={!directInputEnabled || directControlDisabled}
          />
          <NumberField
            size="sm"
            value={directValue}
            min={directMin}
            max={directMax}
            step={0.01}
            onChange={onDirectValueChange}
            disabled={!directInputEnabled || directControlDisabled}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px]"
            onClick={onDirectReset}
            disabled={!directInputEnabled || directControlDisabled}
          >
            Reset ({directDefaultValue.toFixed(2)})
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
              min={overrideMin}
              max={overrideMax}
              step={0.01}
              value={overrideValue}
              onChange={(value) => onOverrideValueChange(value as number)}
            />
            <NumberField
              size="sm"
              value={overrideValue}
              min={overrideMin}
              max={overrideMax}
              step={0.01}
              onChange={onOverrideValueChange}
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
          hoverText="Final output bounding for this variable."
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
        hoverText="Downstream variables driven by this variable."
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
                          min={-3}
                          max={3}
                          step={0.01}
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
                          min={-2}
                          max={2}
                          step={0.01}
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
            No children currently driven by this variable.
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
