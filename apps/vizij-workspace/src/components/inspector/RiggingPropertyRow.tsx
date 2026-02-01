import React, { useState, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown, RotateCcw, Save } from "lucide-react";
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
    const { isScrubbing, handleMouseDown } = useScrub(onScrub, onScrubStart, onScrubEnd);

    return (
        <span
            className={cn(
                "transition-colors",
                onScrub ? "cursor-col-resize select-none" : "cursor-default",
                isScrubbing ? "text-blue-400" : "text-slate-300",
                onScrub && "hover:text-slate-100",
                className
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
    onScrubEnd?: () => void
) {
    const [isScrubbing, setIsScrubbing] = useState(false);
    const scrubRef = useRef<{ startX: number; lastX: number; totalDelta: number } | null>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!onScrub) return;
        setIsScrubbing(true);
        scrubRef.current = { startX: e.clientX, lastX: e.clientX, totalDelta: 0 };
        onScrubStart?.();
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "col-resize";
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
    defaultLabel = "Default",
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

    const { isScrubbing, handleMouseDown } = useScrub(onScrub, onScrubStart, onScrubEnd);

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
                "flex flex-col border border-slate-800/40 bg-slate-900/20 rounded-lg overflow-hidden transition-colors hover:border-slate-800/60 @container",
                className
            )}
        >
            <div className="flex flex-col @[250px]:flex-row @[250px]:items-center gap-1.5 p-1 @[250px]:p-0.5 @[250px]:pl-1.5 min-h-[24px]">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {/* Expand Toggle or Icon */}
                    {renderDefaultInput ? (
                        <button
                            onClick={handleToggle}
                            className="p-0.5 text-slate-500 hover:text-slate-300 transition-colors rounded hover:bg-white/5 focus:outline-none cursor-pointer active:scale-90 active:bg-white/10"
                        >
                            {isExpanded ? (
                                <ChevronDown size={12} />
                            ) : (
                                <ChevronRight size={12} />
                            )}
                        </button>

                    ) : (
                        icon && <span className="text-slate-500">{icon}</span>
                    )}

                    {/* Label Area with Scrubbing */}
                    <div className="flex items-center gap-1 transition-colors relative group/label">
                        {/* Modified Indicator */}
                        {hasDifferentDefault && (
                            <div className="w-1 h-1 rounded-full bg-blue-500 flex-shrink-0" />
                        )}

                        <ScrubbableLabel
                            label={label}
                            onScrub={onScrub}
                            onScrubStart={onScrubStart}
                            onScrubEnd={onScrubEnd}
                            className="text-[10px] font-medium truncate w-24"
                        />
                    </div>
                </div>

                {/* Main Input Area */}
                <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden px-1 @[250px]:px-0">
                    {renderMainInput()}

                    {/* Quick Reset - Always visible if changed, even when expanded */}
                    {hasDifferentDefault && onResetToDefault && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onResetToDefault();
                            }}
                            className="text-slate-500 hover:text-white transition-colors p-1 hover:bg-white/10 rounded cursor-pointer active:scale-90 active:bg-white/20"
                            title="Reset to default"
                        >
                            <RotateCcw size={10} />
                        </button>
                    )}
                </div>
            </div>

            {/* Expanded Default View */}
            {isExpanded && renderDefaultInput && (
                <div className="flex items-center gap-2 px-2 pb-2 pt-1 bg-black/10 border-t border-white/5">
                    <span className="text-[10px] text-slate-600 font-medium uppercase tracking-wider w-[28px] text-center">
                        {defaultLabel}
                    </span>
                    <div className="flex-1">
                        {renderDefaultInput()}
                    </div>
                    {hasDifferentDefault && onSaveToDefault && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onSaveToDefault();
                            }}
                            className="h-6 w-6 flex items-center justify-center text-blue-500 hover:text-blue-300 rounded hover:bg-blue-500/10 transition-colors cursor-pointer active:scale-90 active:bg-blue-500/20"
                            title="Save current value as default"
                        >
                            <Save size={12} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
