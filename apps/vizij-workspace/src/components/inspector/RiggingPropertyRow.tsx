import React, { useState, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown, RotateCcw, Save } from "lucide-react";
import { Button as BaseButton } from "@base-ui/react";
import { cn } from "../../utils/cn";

export interface RiggingPropertyRowProps {
  label: string;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  renderMainInput: () => React.ReactNode;
  renderDefaultInput?: () => React.ReactNode;
  defaultLabel?: string;
  hasDifferentDefault?: boolean;
  onResetToDefault?: () => void;
  onScrub?: (delta: number, totalDelta: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  onSaveToDefault?: () => void;
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
        isScrubbing ? "text-accent" : "text-text-muted",
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

export function RiggingPropertyRow({
  label,
  expanded: controlledExpanded,
  onExpandedChange,
  renderMainInput,
  renderDefaultInput,
  defaultLabel = "Def",
  hasDifferentDefault,
  onResetToDefault,
  onSaveToDefault,
  onScrub,
  onScrubStart,
  onScrubEnd,
  className,
  icon,
}: RiggingPropertyRowProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;

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
        "flex flex-col bg-bg-panel/30 rounded border border-transparent hover:border-border-hover transition-colors group/row @container",
        isExpanded && "bg-bg-panel/50 border-border-default",
        className,
      )}
    >
      <div className="flex flex-col @[300px]:flex-row @[300px]:items-center gap-1.5 p-1 pl-1.5 min-h-[32px]">
        {/* Label Container */}
        <div className="flex items-center gap-2 @[300px]:w-20 w-full flex-shrink-0 min-w-0">
          {renderDefaultInput ? (
            <BaseButton
              onClick={handleToggle}
              className={cn(
                "p-0.5 -ml-1 text-text-secondary hover:text-text-primary transition-colors rounded hover:bg-bg-hover cursor-pointer",
                isExpanded && "text-text-primary"
              )}
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </BaseButton>
          ) : (
            <div className="w-3.5 flex justify-center text-zinc-500">
              {icon}
            </div>
          )}

          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasDifferentDefault && (
              <div className="w-1 h-1 rounded-full bg-accent flex-shrink-0" />
            )}
            <ScrubbableLabel
              label={label}
              onScrub={onScrub}
              onScrubStart={onScrubStart}
              onScrubEnd={onScrubEnd}
              className="text-xs font-medium truncate text-text-muted select-none hover:text-text-primary transition-colors"
            />
          </div>
        </div>

        {/* Input Container */}
        <div className="flex-1 min-w-0 flex items-center pr-1 w-full @[300px]:w-auto">
          {renderMainInput()}

          {hasDifferentDefault && onResetToDefault && (
            <BaseButton
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onResetToDefault();
              }}
              className="ml-1 text-zinc-500 hover:text-white p-1 hover:bg-white/10 rounded cursor-pointer transition-opacity"
              title="Reset to default"
            >
              <RotateCcw size={10} />
            </BaseButton>
          )}
        </div>
      </div>

      {isExpanded && renderDefaultInput && (
        <div className="flex flex-col @[300px]:flex-row @[300px]:items-center gap-2 px-1.5 pb-2 pt-1 border-t border-white/5 mt-0.5 bg-black/20">
          <div className="@[300px]:w-20 w-full flex-shrink-0 @[300px]:pl-4 flex items-center pl-6">
            <span className="text-[9px] uppercase font-bold text-text-secondary tracking-wider">
              {defaultLabel}
            </span>
          </div>

          <div className="flex-1 min-w-0 flex items-center gap-1 w-full @[300px]:w-auto">
            <div className="flex-1 min-w-0">
              {renderDefaultInput()}
            </div>

            {hasDifferentDefault && onSaveToDefault && (
              <BaseButton
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onSaveToDefault();
                }}
                className="ml-1 p-1 text-accent hover:text-accent-hover hover:bg-accent-subtle rounded transition-colors flex-shrink-0"
                title="Save to default"
              >
                <Save size={12} />
              </BaseButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
