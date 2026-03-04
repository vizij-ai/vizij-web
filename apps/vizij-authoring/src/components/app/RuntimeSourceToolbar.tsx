import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Plus, Square } from "lucide-react";
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";
import { Input } from "../ui/Input";
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

interface RuntimeSourceToolbarProps {
  mode: RuntimeSourceToolbarMode;
  activeSource: RuntimeAuthoringSource;
  options: RuntimeSourceOption[];
  onChange: (source: RuntimeAuthoringSource) => void;
  layout?: "bar" | "panel";
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
    label: "PAP Mode",
    badgeClassName: "bg-color-warning-subtle text-color-warning",
  },
  "reference-face": {
    label: "Reference Face Mode",
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

  if (layout === "panel") {
    return (
      <div className="h-full min-h-0 p-3 space-y-3 bg-bg-panel/70 backdrop-blur-sm">
        <div className="space-y-1">
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
          <p className="text-[11px] text-text-secondary leading-relaxed">
            {sourceDescriptions[activeSource]}
          </p>
        </div>

        {runtimeSourceToggle}

        {playbackButtons}

        {targetSelector}

        {targetNameEditor}
      </div>
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
          <div className="w-[220px]">{targetNameEditor}</div>
        </div>
      </div>
    </div>
  );
}
