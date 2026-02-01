import React, { useState } from "react";
import { Button } from "../ui";
import { cn } from "../../utils/cn";
import { ChevronRight, ChevronDown, RotateCcw } from "lucide-react";

export interface RiggingPropertyRowProps {
    label: string;
    expanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
    renderMainInput: () => React.ReactNode;
    renderDefaultInput?: () => React.ReactNode;
    defaultLabel?: string;
    hasDifferentDefault?: boolean;
    onResetToDefault?: () => void;
    className?: string;
    icon?: React.ReactNode;
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
                "flex flex-col border border-slate-800/40 bg-slate-900/20 rounded-lg overflow-hidden transition-colors hover:border-slate-800/60",
                className
            )}
        >
            <div className="flex items-center gap-1.5 p-0.5 pl-1.5 min-h-[24px]">
                {/* Expand Toggle or Icon */}
                {renderDefaultInput ? (
                    <button
                        onClick={handleToggle}
                        className="p-0.5 text-slate-500 hover:text-slate-300 transition-colors rounded hover:bg-white/5 focus:outline-none"
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

                {/* Label */}
                <span className="text-[10px] font-medium text-slate-300 select-none w-20 flex-shrink-0 truncate cursor-default" title={label}>
                    {label}
                </span>

                {/* Main Input Area */}
                <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                    {renderMainInput()}

                    {/* Quick Reset (visible if different and NOT expanded, or just always visible if compact design prefers) 
              Actually, per design "Expanded Row", reset is usually near the default value, but having a quick reset is handy.
              Let's put a subtle indicator or reset if it differs.
          */}
                    {!isExpanded && hasDifferentDefault && onResetToDefault && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation(); // Prevent row toggle
                                onResetToDefault();
                            }}
                            className="text-slate-500 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
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
                    {hasDifferentDefault && onResetToDefault && (
                        <button
                            onClick={onResetToDefault}
                            className="h-6 w-6 flex items-center justify-center text-slate-500 hover:text-white rounded hover:bg-white/10 transition-colors"
                            title="Reset to default"
                        >
                            <RotateCcw size={12} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
