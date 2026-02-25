import React from "react";
import {
  Button,
  Chip,
  CollapsibleGroup,
  CollapsibleRow,
  TextArea,
} from "../ui";
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
  onCreateParentBinding?: () => void;
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

function StageSection({
  title,
  subtitle,
  count,
  children,
  testId,
  className,
}: {
  title: string;
  subtitle: string;
  count?: number;
  children: React.ReactNode;
  testId: string;
  className?: string;
}) {
  return (
    <div className={className} data-testid={testId}>
      <CollapsibleGroup
        title={title}
        subtitle={subtitle}
        itemCount={count}
        defaultCollapsed={true}
        className="mb-0"
      >
        <div className="flex flex-col gap-2">{children}</div>
      </CollapsibleGroup>
    </div>
  );
}

function kindTone(kind: PipelineStageLinkItem["kind"]): "default" | "info" {
  return kind === "autorig" ? "info" : "default";
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
    <div className="rounded border border-border-default/30 bg-bg-panel/30 px-2 py-1.5 flex flex-col gap-1.5">
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
    <div className="rounded border border-border-default/30 bg-bg-panel/30 px-2 py-1.5 flex flex-col gap-1">
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
  onCreateParentBinding,
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
      className="rounded border border-border-default/60 bg-bg-panel/40 px-2 py-2 flex flex-col gap-2"
      data-testid="variable-pipeline-stages"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Variable Pipeline
          </span>
          <span className="text-[10px] text-text-secondary">
            Stage-oriented inspector controls
          </span>
        </div>
      </div>

      <StageSection
        title="Parents"
        subtitle="Upstream variables that contribute parent math."
        count={parents.length}
        testId="pipeline-stage-parents"
        className={sourceSectionClass}
      >
        <div className="rounded border border-border-default/40 bg-bg-input/40 p-2">
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
        <span className="text-[10px] text-text-secondary">
          Parents are upstream inputs driving this variable. Each link applies a
          scale multiplier and offset.
        </span>
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
                actions={
                  <>
                    <Chip tone={kindTone(parent.kind)}>{parent.kind}</Chip>
                    {parent.onInspect ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={parent.onInspect}
                      >
                        Inspect
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
        {onCreateParentBinding && parents.length === 0 ? (
          <Button
            variant="secondary"
            size="sm"
            className="h-6 text-[10px] w-fit"
            onClick={onCreateParentBinding}
          >
            Create Parent Binding
          </Button>
        ) : null}
      </StageSection>

      <StageSection
        title="Poses"
        subtitle="Pose targets and blend weights for this variable."
        count={poses.length}
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
                actions={
                  pose.onInspect ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={pose.onInspect}
                    >
                      Inspect Pose
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
        subtitle="Optional direct control path for this variable."
        testId="pipeline-stage-direct-input"
        className={sourceSectionClass}
      >
        <div className="flex items-center gap-3">
          <Switch
            checked={directInputEnabled}
            onChange={onDirectInputEnabledChange}
            label={directInputEnabled ? "Enabled" : "Disabled"}
            size="sm"
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
        subtitle="Optional runtime override for effective output."
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
          subtitle="Final output bounding for this variable."
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
        subtitle="Read-only equation and live diagnostics."
        testId="pipeline-stage-compiled"
      >
        <div className="rounded border border-border-default/40 bg-bg-input/40 p-2">
          <div className="text-[9px] uppercase tracking-wide text-text-muted mb-1">
            Read-only equation
          </div>
          <code
            className="text-[10px] text-text-primary break-all"
            data-testid="pipeline-compiled-equation"
          >
            {compiledEquation}
          </code>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Chip tone="default">
            Parents {formatPipelineValue(diagnostics.parentContribution)}
          </Chip>
          <Chip tone="default">
            Poses {formatPipelineValue(diagnostics.poseContribution)}
          </Chip>
          <Chip tone="default">
            Direct {formatPipelineValue(diagnostics.directContribution)}
          </Chip>
          <Chip tone="info">
            Blended {formatPipelineValue(diagnostics.blendedResult)}
          </Chip>
          <Chip tone="warning">
            Selected {formatPipelineValue(diagnostics.overrideSelectedResult)}
          </Chip>
          <Chip tone="success">
            Effective {formatPipelineValue(diagnostics.effectiveResult)}
          </Chip>
        </div>
      </StageSection>

      <StageSection
        title="Children"
        subtitle="Downstream variables driven by this variable."
        count={children.length}
        testId="pipeline-stage-children"
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
                actions={
                  <>
                    <Chip tone={kindTone(child.kind)}>{child.kind}</Chip>
                    {child.onInspect ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={child.onInspect}
                      >
                        Inspect
                      </Button>
                    ) : null}
                    {child.onUnlink ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={child.onUnlink}
                      >
                        Unlink
                      </Button>
                    ) : null}
                  </>
                }
                expandedContent={
                  child.linkControl ? (
                    <div className="rounded border border-border-default/30 bg-bg-panel/30 px-2 py-1.5 flex flex-col gap-1.5">
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
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] w-fit"
            onClick={onAddChild}
          >
            Add Child Link
          </Button>
        ) : null}
      </StageSection>
    </div>
  );
}
