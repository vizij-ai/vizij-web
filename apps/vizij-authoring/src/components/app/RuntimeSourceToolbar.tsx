import { Pause, Play, Plus } from "lucide-react";
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
  playbackState?: "playing" | "paused";
  onPlay?: () => void;
  onPause?: () => void;
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
    typeof onPlay === "function" &&
    typeof onPause === "function" &&
    (playbackState === "playing" || playbackState === "paused");
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

        <Select
          size="sm"
          label="Runtime Source"
          value={activeSource}
          onChange={(value) => onChange(value as RuntimeAuthoringSource)}
          options={options.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />

        {hasPlaybackControls ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={playbackState === "playing" ? "primary" : "secondary"}
              size="sm"
              className="h-8 px-2 text-[11px]"
              onClick={onPlay}
              disabled={playbackDisabled}
              title="Play runtime source"
            >
              <Play className="mr-1 h-3.5 w-3.5 fill-current" />
              Play
            </Button>
            <Button
              variant={playbackState === "paused" ? "primary" : "secondary"}
              size="sm"
              className="h-8 px-2 text-[11px]"
              onClick={onPause}
              disabled={playbackDisabled}
              title="Pause runtime source"
            >
              <Pause className="mr-1 h-3.5 w-3.5 fill-current" />
              Pause
            </Button>
          </div>
        ) : null}

        {hasTargetSelector ? (
          <div className="space-y-2">
            <Select
              size="sm"
              label={targetLabel}
              value={targetValue ?? ""}
              onChange={onTargetChange}
              options={(targetOptions ?? []).map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
            {onCreateTarget ? (
              <Button
                variant="subtle"
                size="sm"
                className="h-8 px-2 text-[11px] w-full justify-center"
                onClick={onCreateTarget}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {createTargetLabel ?? "Create New"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {hasTargetNameEditor ? (
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary px-1">
              Name
            </label>
            <Input
              size="sm"
              value={targetName}
              onChange={(event) => onTargetNameChange(event.target.value)}
              placeholder="Clip name"
              aria-label="Clip name"
            />
          </div>
        ) : null}
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

        <div className="flex items-center gap-2">
          <div className="w-[180px]">
            <Select
              size="sm"
              label="Runtime Source"
              value={activeSource}
              onChange={(value) => onChange(value as RuntimeAuthoringSource)}
              options={options.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </div>
          {hasPlaybackControls ? (
            <div className="mt-5 flex items-center gap-1.5">
              <Button
                variant={playbackState === "playing" ? "primary" : "secondary"}
                size="sm"
                className="h-8 px-2 text-[11px]"
                onClick={onPlay}
                disabled={playbackDisabled}
                title="Play runtime source"
              >
                <Play className="mr-1 h-3.5 w-3.5 fill-current" />
                Play
              </Button>
              <Button
                variant={playbackState === "paused" ? "primary" : "secondary"}
                size="sm"
                className="h-8 px-2 text-[11px]"
                onClick={onPause}
                disabled={playbackDisabled}
                title="Pause runtime source"
              >
                <Pause className="mr-1 h-3.5 w-3.5 fill-current" />
                Pause
              </Button>
            </div>
          ) : null}
          {hasTargetSelector ? (
            <>
              <div className="w-[220px]">
                <Select
                  size="sm"
                  label={targetLabel}
                  value={targetValue ?? ""}
                  onChange={onTargetChange}
                  options={(targetOptions ?? []).map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />
              </div>
              {onCreateTarget ? (
                <Button
                  variant="subtle"
                  size="sm"
                  className="mt-5 h-8 px-2 text-[11px] whitespace-nowrap"
                  onClick={onCreateTarget}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {createTargetLabel ?? "Create New"}
                </Button>
              ) : null}
            </>
          ) : null}
          {hasTargetNameEditor ? (
            <div className="w-[210px] mt-5">
              <Input
                size="sm"
                value={targetName}
                onChange={(event) => onTargetNameChange(event.target.value)}
                placeholder="Clip name"
                aria-label="Clip name"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
