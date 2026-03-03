import { Plus } from "lucide-react";
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
    "Procedural Animation Programming graph bridges are allowed to publish input/output values.",
  none: "No authored runtime source is driving values. Direct input control is authoritative.",
};

export function RuntimeSourceToolbar({
  mode,
  activeSource,
  options,
  onChange,
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
