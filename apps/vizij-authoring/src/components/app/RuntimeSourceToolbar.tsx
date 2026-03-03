import { Button } from "../ui/Button";
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

interface RuntimeSourceToolbarProps {
  mode: RuntimeSourceToolbarMode;
  activeSource: RuntimeAuthoringSource;
  options: RuntimeSourceOption[];
  onChange: (source: RuntimeAuthoringSource) => void;
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
}: RuntimeSourceToolbarProps) {
  const modeDetails = modeMeta[mode];
  const isLive = activeSource !== "none";

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

        <div className="inline-flex items-center gap-1 rounded-lg border border-border-default bg-bg-app/80 p-1 shadow-inner">
          {options.map((option) => {
            const selected = option.value === activeSource;
            return (
              <Button
                key={option.value}
                variant={selected ? "secondary" : "ghost"}
                size="sm"
                className={`h-7 min-w-[88px] px-2 text-[11px] ${
                  selected ? "shadow-sm border border-border-hover" : ""
                }`}
                onClick={() => onChange(option.value)}
              >
                <span
                  className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                    selected ? "bg-color-accent" : "bg-text-muted"
                  }`}
                />
                <span className="truncate">{option.label}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
