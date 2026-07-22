import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Plus, Square, Trash2, X } from "lucide-react";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { Input } from "../ui/Input";
import { Panel } from "../ui/Panel";
import type { RuntimeAuthoringSource } from "../../state/AuthoringUiProvider";

export type RuntimeSourceToolbarMode =
  | "procedural-animation-programming"
  | "animation"
  | "reference-face"
  | "none";

interface RuntimeSourceOption {
  value: RuntimeAuthoringSource;
  label: string;
}

interface RuntimeTargetOption {
  value: string;
  label: string;
}

interface RuntimeTargetStat {
  label: string;
  value: string;
}

interface RuntimeSourceToolbarProps {
  mode: RuntimeSourceToolbarMode;
  activeSource: RuntimeAuthoringSource;
  options: RuntimeSourceOption[];
  onChange: (source: RuntimeAuthoringSource) => void;
  layout?: "bar" | "embedded" | "panel";
  playbackState?: "playing" | "paused" | "stopped";
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  playbackDisabled?: boolean;
  targetLabel?: string;
  targetValue?: string;
  targetOptions?: RuntimeTargetOption[];
  onTargetChange?: (value: string) => void;
  targetName?: string;
  onTargetNameChange?: (value: string) => void;
  onCreateTarget?: () => void;
  createTargetLabel?: string;
  targetTypeLabel?: string;
  targetStats?: RuntimeTargetStat[];
  targetNumericLabel?: string;
  targetNumericValue?: number;
  targetNumericStep?: number;
  targetNumericMin?: number;
  onTargetNumericValueChange?: (value: number) => void;
  onDeleteTarget?: () => void;
  deleteTargetLabel?: string;
  onClosePanel?: () => void;
}

const modeMeta: Record<
  RuntimeSourceToolbarMode,
  { label: string; badgeClassName: string }
> = {
  animation: {
    label: "Animation Mode",
    badgeClassName: "bg-color-accent-subtle text-color-accent",
  },
  "procedural-animation-programming": {
    label: "Behavior Mode",
    badgeClassName: "bg-color-warning-subtle text-color-warning",
  },
  "reference-face": {
    label: "Comparison Face Mode",
    badgeClassName: "bg-bg-secondary text-text-secondary",
  },
  none: {
    label: "No Center Mode",
    badgeClassName: "bg-bg-secondary text-text-secondary",
  },
};

const sourceDescriptions: Record<RuntimeAuthoringSource, string> = {
  animation:
    "Timeline playback can drive authored inputs while preserving direct controls when stopped.",
  "procedural-animation-programming":
    "Procedural animation graph bridges can publish input/output values.",
  none: "Default mode uses direct input control; no authored runtime source is actively driving values.",
};

export function RuntimeSourceToolbar({
  mode,
  activeSource,
  options,
  onChange,
  layout = "bar",
  playbackState,
  onPlay,
  onPause,
  onStop,
  playbackDisabled = false,
  targetLabel,
  targetValue,
  targetOptions,
  onTargetChange,
  targetName,
  onTargetNameChange,
  onCreateTarget,
  createTargetLabel,
  targetTypeLabel,
  targetStats,
  targetNumericLabel,
  targetNumericValue,
  targetNumericStep = 0.1,
  targetNumericMin = 0,
  onTargetNumericValueChange,
  onDeleteTarget,
  deleteTargetLabel,
  onClosePanel,
}: RuntimeSourceToolbarProps) {
  const modeDetails = modeMeta[mode];
  const isLive = activeSource !== "none";
  const hasTargetSelector =
    Boolean(targetLabel) &&
    typeof targetValue === "string" &&
    Boolean(targetOptions?.length) &&
    typeof onTargetChange === "function";
  const hasTargetNameEditor =
    typeof targetName === "string" && typeof onTargetNameChange === "function";
  const hasTargetNumericEditor =
    typeof targetNumericLabel === "string" &&
    typeof targetNumericValue === "number" &&
    Number.isFinite(targetNumericValue) &&
    typeof onTargetNumericValueChange === "function";
  const hasTargetStats = (targetStats?.length ?? 0) > 0;
  const hasDeleteTargetAction = typeof onDeleteTarget === "function";
  const hasPlaybackControls =
    playbackState === "playing" ||
    playbackState === "paused" ||
    playbackState === "stopped";
  const canPlay = typeof onPlay === "function";
  const canPause = typeof onPause === "function";
  const canStop = typeof onStop === "function";
  const hasRuntimeSourceToggle = options.length > 0;
  const [targetNameDraft, setTargetNameDraft] = useState(targetName ?? "");

  useEffect(() => {
    setTargetNameDraft(targetName ?? "");
  }, [targetName, targetValue]);

  const targetNameChanged = useMemo(
    () => (targetName ?? "") !== targetNameDraft,
    [targetName, targetNameDraft],
  );

  const commitTargetNameDraft = () => {
    if (!hasTargetNameEditor || !targetNameChanged) {
      return;
    }
    onTargetNameChange(targetNameDraft);
  };

  const playbackButtons = hasPlaybackControls ? (
    <div className="grid grid-cols-3 gap-2">
      <Button
        variant={playbackState === "playing" ? "primary" : "secondary"}
        size="sm"
        className={`h-8 px-2 text-[11px] ${
          playbackState === "playing" ? "disabled:opacity-100" : ""
        }`}
        onClick={() => onPlay?.()}
        disabled={playbackDisabled || playbackState === "playing" || !canPlay}
        title="Play runtime source"
      >
        <Play className="mr-1 h-3.5 w-3.5 fill-current" />
        Play
      </Button>
      <Button
        variant={playbackState === "paused" ? "primary" : "secondary"}
        size="sm"
        className={`h-8 px-2 text-[11px] ${
          playbackState === "paused" ? "disabled:opacity-100" : ""
        }`}
        onClick={() => onPause?.()}
        disabled={playbackDisabled || playbackState === "paused" || !canPause}
        title="Pause runtime source"
      >
        <Pause className="mr-1 h-3.5 w-3.5 fill-current" />
        Pause
      </Button>
      <Button
        variant={playbackState === "stopped" ? "primary" : "secondary"}
        size="sm"
        className={`h-8 px-2 text-[11px] ${
          playbackState === "stopped" ? "disabled:opacity-100" : ""
        }`}
        onClick={() => onStop?.()}
        disabled={playbackDisabled || playbackState === "stopped" || !canStop}
        title="Stop runtime source"
      >
        <Square className="mr-1 h-3.5 w-3.5 fill-current" />
        Stop
      </Button>
    </div>
  ) : null;

  const runtimeSourceToggle = hasRuntimeSourceToggle ? (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary px-1">
        Runtime Source
      </label>
      <div className="grid grid-cols-3 gap-1 rounded-md border border-border-default/70 bg-bg-secondary/40 p-1">
        {options.map((option) => {
          const isActive = option.value === activeSource;
          return (
            <Button
              key={option.value}
              variant={isActive ? "primary" : "subtle"}
              size="sm"
              className={`h-8 px-2 text-[11px] ${
                isActive ? "disabled:opacity-100" : ""
              }`}
              onClick={() => onChange(option.value)}
              disabled={isActive}
              title={`Set runtime source to ${option.label}`}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  ) : null;

  const targetSelector = hasTargetSelector ? (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary px-1">
        {targetLabel}
      </label>
      <div className="flex items-end gap-2">
        <Select
          size="sm"
          className="flex-1"
          value={targetValue ?? ""}
          onChange={onTargetChange}
          options={(targetOptions ?? []).map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
        {onCreateTarget ? (
          <Button
            variant="secondary"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onCreateTarget}
            title={createTargetLabel ?? "Create New"}
            aria-label={createTargetLabel ?? "Create New"}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  ) : null;

  const selectedTargetOption = useMemo(() => {
    if (!targetOptions || typeof targetValue !== "string") {
      return null;
    }
    return (
      targetOptions.find((option) => option.value === targetValue) ??
      (targetValue
        ? {
            value: targetValue,
            label: targetValue,
          }
        : null)
    );
  }, [targetOptions, targetValue]);

  const targetNameEditor = hasTargetNameEditor ? (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary px-1">
        Name
      </label>
      <Input
        size="sm"
        value={targetNameDraft}
        onChange={(event) => setTargetNameDraft(event.target.value)}
        onBlur={commitTargetNameDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        placeholder="Clip name"
        aria-label="Clip name"
      />
    </div>
  ) : null;

  const targetNumericEditor = hasTargetNumericEditor ? (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary px-1">
        {targetNumericLabel}
      </label>
      <Input
        size="sm"
        type="number"
        min={targetNumericMin}
        step={targetNumericStep}
        value={targetNumericValue}
        onChange={(event) => {
          const nextValue = Number.parseFloat(event.target.value);
          if (!Number.isFinite(nextValue)) {
            return;
          }
          onTargetNumericValueChange(nextValue);
        }}
      />
    </div>
  ) : null;

  const targetStatsGrid = hasTargetStats ? (
    <div className="grid grid-cols-2 gap-1.5">
      {(targetStats ?? []).map((stat) => (
        <div
          key={`${stat.label}:${stat.value}`}
          className="rounded border border-border-default/50 bg-bg-input/35 px-2 py-1"
        >
          <div className="text-[9px] uppercase tracking-wider text-text-muted">
            {stat.label}
          </div>
          <div className="text-[11px] font-mono text-text-primary">
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  ) : null;

  const playbackStatusTone =
    playbackState === "playing"
      ? "bg-color-success-subtle text-color-success"
      : playbackState === "paused"
        ? "bg-color-warning-subtle text-color-warning"
        : "bg-bg-secondary text-text-secondary";

  const targetMetadataCard =
    hasTargetSelector ||
    hasTargetNameEditor ||
    hasTargetNumericEditor ||
    hasTargetStats ||
    hasDeleteTargetAction ? (
      <div className="rounded-md border border-border-default/70 bg-bg-panel/45 p-2.5 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
              {targetTypeLabel ?? "Runtime Target"}
            </div>
            <div className="mt-0.5 text-xs font-semibold text-text-primary truncate">
              {selectedTargetOption?.label ?? "No target selected"}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${playbackStatusTone}`}
            >
              {playbackState ?? "stopped"}
            </span>
          </div>
        </div>

        {targetNameEditor}
        {targetNumericEditor}
        {targetStatsGrid}

        {hasDeleteTargetAction && (
          <div className="flex items-center gap-1.5">
            {hasDeleteTargetAction ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px] gap-1 text-color-danger"
                onClick={() => onDeleteTarget?.()}
                title={deleteTargetLabel ?? "Delete target"}
              >
                <Trash2 className="h-3 w-3" />
                {deleteTargetLabel ?? "Delete"}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    ) : null;

  const embeddedContent = (
    <div className="space-y-3 rounded-xl border border-border-default/70 bg-bg-panel/70 p-3 backdrop-blur-sm">
      <div className="space-y-1">
        <div className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
          Runtime Source
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${modeDetails.badgeClassName}`}
          >
            {modeDetails.label}
          </span>
          <span
            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
              isLive
                ? "bg-color-success-subtle text-color-success"
                : "bg-bg-secondary text-text-secondary"
            }`}
          >
            {isLive ? "Live" : "Idle"}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-text-secondary">
          {sourceDescriptions[activeSource]}
        </p>
      </div>

      {runtimeSourceToggle}

      {playbackButtons}

      {targetSelector}

      {targetMetadataCard}
    </div>
  );

  if (layout === "embedded") {
    return embeddedContent;
  }

  if (layout === "panel") {
    return (
      <Panel
        title="Runtime Source"
        description="Choose which authored system is driving live runtime inputs and manage the active runtime target."
        className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
        actions={
          onClosePanel ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-text-secondary hover:text-text-primary"
              onClick={onClosePanel}
              title="Hide panel"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null
        }
      >
        <div className="h-full min-h-0 p-3 space-y-3 bg-bg-panel/70 backdrop-blur-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${modeDetails.badgeClassName}`}
              >
                {modeDetails.label}
              </span>
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                  isLive
                    ? "bg-color-success-subtle text-color-success"
                    : "bg-bg-secondary text-text-secondary"
                }`}
              >
                {isLive ? "Live" : "Idle"}
              </span>
            </div>
            <p className="text-[11px] text-text-secondary leading-relaxed">
              {sourceDescriptions[activeSource]}
            </p>
          </div>

          {runtimeSourceToggle}

          {playbackButtons}

          {targetSelector}

          {targetMetadataCard}
        </div>
      </Panel>
    );
  }

  return (
    <div className="w-full select-none bg-bg-panel/70 px-3 py-2 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Runtime Source
            </span>
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${modeDetails.badgeClassName}`}
            >
              {modeDetails.label}
            </span>
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                isLive
                  ? "bg-color-success-subtle text-color-success"
                  : "bg-bg-secondary text-text-secondary"
              }`}
            >
              {isLive ? "Live" : "Idle"}
            </span>
          </div>
          <p className="mt-1 truncate text-[11px] text-text-secondary">
            {sourceDescriptions[activeSource]}
          </p>
        </div>

        <div className="flex min-w-0 items-start gap-3">
          <div className="w-[240px]">{runtimeSourceToggle}</div>
          <div className="w-[250px]">{playbackButtons}</div>
          <div className="w-[280px]">{targetSelector}</div>
          <div className="w-[280px]">{targetMetadataCard}</div>
        </div>
      </div>
    </div>
  );
}
