import React, { useState, useRef, useEffect } from "react";
import { ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "../../ui/Button";
import { cn } from "../../../utils/cn";

export interface PropertyRowProps {
  label: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  renderMainInput: () => React.ReactNode;
  renderDefaultInput?: () => React.ReactNode;
  renderMinInput?: () => React.ReactNode;
  renderMaxInput?: () => React.ReactNode;
  renderAnimatableRow?: () => React.ReactNode;
  renderRowAction?: () => React.ReactNode;
  defaultLabel?: string;
  hasDifferentDefault?: boolean;
  onResetToDefault?: () => void;
  onScrub?: (delta: number, totalDelta: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;

  className?: string;

  icon?: React.ReactNode;
}

export interface ScrubbableLabelProps {
  label?: string;
  onScrub?: (delta: number, totalDelta: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export interface CommitOnBlurNumberInputProps {
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  step?: number | string;
  min?: number;
  max?: number;
  className?: string;
  formatValue?: (value: number) => string;
  parseValue?: (raw: string) => number | null;
}

export function CommitOnBlurNumberInput({
  value,
  onCommit,
  disabled = false,
  step,
  min,
  max,
  className,
  formatValue = (nextValue) => String(nextValue),
  parseValue = (raw) => {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  },
}: CommitOnBlurNumberInputProps) {
  const formattedValue = formatValue(value);
  const [draftValue, setDraftValue] = useState(formattedValue);

  useEffect(() => {
    setDraftValue(formattedValue);
  }, [formattedValue]);

  const commitDraft = () => {
    const parsed = parseValue(draftValue);
    if (parsed === null) {
      setDraftValue(formattedValue);
      return;
    }
    onCommit(parsed);
  };

  return (
    <input
      type="number"
      className={cn(
        "w-full bg-transparent border-0 text-[10px] p-0 h-5 focus:ring-0 text-text-primary placeholder-text-muted no-spinners font-mono leading-none",
        className,
      )}
      value={draftValue}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => setDraftValue(event.target.value)}
      onBlur={commitDraft}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setDraftValue(formattedValue);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function ScrubbableLabel({
  label,
  onScrub,
  onScrubStart,
  onScrubEnd,
  className,
  children,
}: ScrubbableLabelProps) {
  const { isScrubbing, handleMouseDown } = useScrub(
    onScrub,
    onScrubStart,
    onScrubEnd,
  );

  return (
    <span
      className={cn(
        "transition-colors box-border",
        onScrub ? "cursor-ew-resize select-none" : "cursor-default",
        isScrubbing
          ? "text-[var(--editor-accent,var(--color-accent))]"
          : "text-[var(--editor-muted-fg,var(--text-muted))]",
        onScrub && "hover:text-text-primary",
        className,
      )}
      onMouseDown={onScrub ? handleMouseDown : undefined}
      title={label}
    >
      {children || label}
    </span>
  );
}

export function useScrub(
  onScrub?: (delta: number, totalDelta: number) => void,
  onScrubStart?: () => void,
  onScrubEnd?: () => void,
) {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const scrubRef = useRef<{
    startX: number;
    lastX: number;
    totalDelta: number;
  } | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!onScrub) return;
    e.preventDefault();
    e.stopPropagation();
    setIsScrubbing(true);
    scrubRef.current = { startX: e.clientX, lastX: e.clientX, totalDelta: 0 };
    onScrubStart?.();
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "ew-resize";
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!scrubRef.current || !onScrub) return;
    const delta = e.clientX - scrubRef.current.lastX;
    scrubRef.current.totalDelta += delta;
    onScrub(delta, scrubRef.current.totalDelta);
    scrubRef.current.lastX = e.clientX;
  };

  const handleMouseUp = () => {
    setIsScrubbing(false);
    scrubRef.current = null;
    onScrubEnd?.();
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "";
  };

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return { isScrubbing, handleMouseDown };
}

export function PropertyRow({
  label,
  expanded: controlledExpanded,
  onExpandedChange,
  renderMainInput,
  renderDefaultInput,
  renderMinInput,
  renderMaxInput,
  renderAnimatableRow,
  renderRowAction,
  defaultLabel = "Def",

  hasDifferentDefault,
  onResetToDefault,

  onScrub,
  onScrubStart,
  onScrubEnd,
  className,
  icon,
}: PropertyRowProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;
  const canToggleExpanded = Boolean(renderDefaultInput);

  const handleToggle = () => {
    if (onExpandedChange) {
      onExpandedChange(!isExpanded);
    } else {
      setInternalExpanded(!isExpanded);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded border border-transparent transition-colors group/row @container",
        "bg-[color-mix(in_oklab,var(--editor-panel-bg,var(--bg-panel))_30%,transparent)]",
        "hover:border-[var(--editor-border-strong,var(--border-hover))]",
        isExpanded &&
          "bg-[color-mix(in_oklab,var(--editor-panel-bg,var(--bg-panel))_50%,transparent)] border-[var(--editor-border,var(--border-default))]",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col @[300px]:flex-row @[300px]:items-center gap-1.5 p-1 pl-1.5 min-h-[var(--editor-row-min-height,32px)]",
          canToggleExpanded && "cursor-pointer",
        )}
        onClick={canToggleExpanded ? handleToggle : undefined}
        title={canToggleExpanded ? `Toggle ${label} edit controls` : undefined}
      >
        {/* Label Container */}
        <div className="flex items-center gap-2 @[300px]:w-20 w-full flex-shrink-0 min-w-0">
          {canToggleExpanded ? (
            <div
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded transition-colors text-[var(--editor-label-fg,var(--text-secondary))]",
                isExpanded &&
                  "text-[var(--editor-value-fg,var(--text-primary))]",
              )}
            >
              <ChevronRight
                size={12}
                className={cn(
                  "transition-transform",
                  isExpanded && "rotate-90",
                )}
              />
            </div>
          ) : (
            <div className="w-3.5 flex justify-center text-[var(--editor-muted-fg,var(--text-muted))]">
              {icon}
            </div>
          )}

          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasDifferentDefault && (
              <div className="w-1 h-1 rounded-full flex-shrink-0 bg-[var(--editor-accent,var(--color-accent))]" />
            )}
            {canToggleExpanded ? (
              <span
                className={cn(
                  "min-w-0 text-left rounded px-0.5 -mx-0.5",
                  "text-xs font-medium truncate select-none transition-colors text-[var(--editor-muted-fg,var(--text-muted))] hover:text-[var(--editor-value-fg,var(--text-primary))]",
                )}
              >
                {label}
              </span>
            ) : (
              <ScrubbableLabel
                label={label}
                onScrub={onScrub}
                onScrubStart={onScrubStart}
                onScrubEnd={onScrubEnd}
                className="text-xs font-medium truncate select-none transition-colors text-[var(--editor-muted-fg,var(--text-muted))] hover:text-[var(--editor-value-fg,var(--text-primary))]"
              />
            )}
          </div>
        </div>

        {/* Input Container */}
        <div className="flex-1 min-w-0 flex items-center pr-1 w-full @[300px]:w-auto">
          {renderMainInput()}

          {hasDifferentDefault && onResetToDefault && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onResetToDefault();
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              className={cn(
                // Undo `size="icon"`'s 36px box — this sits in a 32px row.
                "ml-1 h-auto w-auto p-1 rounded transition-colors",
                // NO text colour here: `ui/Button`'s ghost variant emits
                // `text-text-secondary!`, so a plain `text-accent` never applied.
                // The icon has always rendered secondary, not accent. Keeping the
                // dead classes only misleads the next reader. See THEMING.md,
                // "Deliberate non-tokens".
                "hover:bg-[color-mix(in_oklab,var(--editor-accent,var(--color-accent))_10%,transparent)]",
              )}
              title="Reset to default"
            >
              <RotateCcw size={10} />
            </Button>
          )}
          {renderRowAction && (
            <div
              className="ml-1 flex items-center"
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {renderRowAction()}
            </div>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="flex flex-col gap-0.5 border-t mt-0.5 pb-1.5 border-[var(--editor-row-expanded-border,rgb(255_255_255/0.05))] bg-[var(--editor-row-expanded-bg,rgb(0_0_0/0.2))]">
          {renderDefaultInput && (
            <div className="flex flex-col @[300px]:flex-row @[300px]:items-center gap-2 px-1.5 pt-1">
              <div className="@[300px]:w-20 w-full flex-shrink-0 @[300px]:pl-4 flex items-center pl-6">
                <span className="text-[9px] uppercase font-bold tracking-wider text-[var(--editor-label-fg,var(--text-secondary))]">
                  {defaultLabel}
                </span>
              </div>

              <div className="flex-1 min-w-0 w-full @[300px]:w-auto">
                {renderDefaultInput()}
              </div>
            </div>
          )}

          {renderMinInput && (
            <div className="flex flex-col @[300px]:flex-row @[300px]:items-center gap-2 px-1.5 pt-1">
              <div className="@[300px]:w-20 w-full flex-shrink-0 @[300px]:pl-4 flex items-center pl-6">
                <span className="text-[9px] uppercase font-bold tracking-wider text-[var(--editor-label-fg,var(--text-secondary))]">
                  Min
                </span>
              </div>
              <div className="flex-1 min-w-0 w-full @[300px]:w-auto">
                {renderMinInput()}
              </div>
            </div>
          )}

          {renderMaxInput && (
            <div className="flex flex-col @[300px]:flex-row @[300px]:items-center gap-2 px-1.5 pt-1">
              <div className="@[300px]:w-20 w-full flex-shrink-0 @[300px]:pl-4 flex items-center pl-6">
                <span className="text-[9px] uppercase font-bold tracking-wider text-[var(--editor-label-fg,var(--text-secondary))]">
                  Max
                </span>
              </div>
              <div className="flex-1 min-w-0 w-full @[300px]:w-auto">
                {renderMaxInput()}
              </div>
            </div>
          )}

          {renderAnimatableRow && (
            <div className="flex flex-col @[300px]:flex-row @[300px]:items-center gap-2 px-1.5 pt-1 mt-0.5">
              <div className="@[300px]:w-20 w-full flex-shrink-0 @[300px]:pl-4 flex items-center pl-6">
                <span className="text-[9px] uppercase font-bold tracking-wider text-[var(--editor-label-fg,var(--text-secondary))]">
                  Editable
                </span>
              </div>
              <div className="flex-1 min-w-0 flex items-center gap-1 w-full @[300px]:w-auto">
                {renderAnimatableRow()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
