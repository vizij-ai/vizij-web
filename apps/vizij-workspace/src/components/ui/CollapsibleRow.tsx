import { Collapsible as BaseCollapsible } from "@base-ui/react";
import type { ReactNode } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "../../utils/cn";
import { RowSlider } from "./RowSlider";

export interface CollapsibleRowProps {
  id: string;
  title: string;
  subtitle?: string;
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  defaultExpanded?: boolean;
  onValueChange?: (value: number) => void;
  actions?: ReactNode;
  expandedContent?: ReactNode;
  disabled?: boolean;
  className?: string;
  showSlider?: boolean;
}

export function CollapsibleRow({
  id,
  title,
  subtitle,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  defaultExpanded = false,
  onValueChange,
  actions,
  expandedContent,
  disabled = false,
  className = "",
  showSlider = true,
}: CollapsibleRowProps) {
  const hasExpandableContent = Boolean(expandedContent);

  return (
    <BaseCollapsible.Root defaultOpen={defaultExpanded} className="group w-full">
      <div
        className={cn(
          "bg-slate-900/40 border border-slate-800/60 rounded-xl mb-1.5 transition-all duration-150 overflow-hidden",
          "group-data-[state=open]:border-blue-600/50 group-data-[state=open]:shadow-[0_0_0_1px_rgba(37,99,235,0.2)]",
          !hasExpandableContent && "group-data-[state=open]:border-slate-800/60 group-data-[state=open]:shadow-none", // Prevent highlighting if not expandable (though Root shouldn't open technically if disabled? Wrapper handles visuals)
          disabled && "opacity-50 pointer-events-none",
          className,
        )}
        data-row-id={id}
      >
        <div className="flex items-center gap-3">
          <BaseCollapsible.Trigger
            disabled={!hasExpandableContent || disabled}
            className={cn(
              "flex-1 px-2.5 py-1.5 flex items-center gap-3 text-left focus:outline-none focus:bg-slate-800/20 w-full",
              hasExpandableContent &&
              !disabled &&
              "cursor-pointer hover:bg-slate-800/30",
            )}
          >
            <div className="flex items-start gap-2.5 flex-grow min-w-0 pointer-events-none">
              {/* pointer-events-none on content to prevent interfering with button click if complex? No, standard button is fine. */}
              {hasExpandableContent && (
                <div className="w-3 h-3 mt-1 flex items-center justify-center shrink-0">
                  <ChevronRight className="w-3 h-3 text-slate-500 group-data-[state=open]:hidden" />
                  <ChevronDown className="w-3 h-3 text-blue-400 hidden group-data-[state=open]:block" />
                </div>
              )}
              <div className="flex flex-col gap-0.5 min-w-0 text-left">
                <span
                  className={cn(
                    "text-[13px] font-bold leading-tight truncate transition-colors",
                    "group-data-[state=open]:text-slate-100",
                    "group-data-[state=closed]:text-slate-300"
                  )}
                >
                  {title}
                </span>
                {subtitle && (
                  <span className="text-[10px] text-slate-500 truncate leading-tight font-medium">
                    {subtitle}
                  </span>
                )}
              </div>
            </div>
          </BaseCollapsible.Trigger>

          <div className="flex items-center justify-end gap-3 shrink-0 pr-2.5 py-1.5">
            {showSlider && value !== undefined && onValueChange && (
              <div className="w-48">
                <RowSlider
                  value={value}
                  min={min}
                  max={max}
                  step={step}
                  onChange={onValueChange}
                  disabled={disabled}
                />
              </div>
            )}
            {actions && (
              <div
                className="flex items-center gap-1.5 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {actions}
              </div>
            )}
          </div>
        </div>
        <BaseCollapsible.Panel className="data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-top-1 duration-200 overflow-hidden">
          <div className="h-px bg-slate-800/60 mx-3" />
          <div className="p-4 bg-slate-950/20">{expandedContent}</div>
        </BaseCollapsible.Panel>
      </div>
    </BaseCollapsible.Root>
  );
}
