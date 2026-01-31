import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import type { ReactNode } from "react";
import { RowSlider } from "./RowSlider";
import { cn } from "../../utils/cn";
import { ChevronRight, ChevronDown } from "lucide-react";

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
    <Disclosure defaultOpen={defaultExpanded}>
      {({ open }) => (
        <div
          className={cn(
            "bg-slate-900/40 border border-slate-800/60 rounded-xl mb-1.5 transition-all duration-150 overflow-hidden",
            open && hasExpandableContent && "border-blue-600/50 shadow-[0_0_0_1px_rgba(37,99,235,0.2)]",
            disabled && "opacity-50 pointer-events-none",
            className,
          )}
          data-row-id={id}
        >
          <div className="flex items-center gap-3">
            <DisclosureButton
              disabled={!hasExpandableContent || disabled}
              className={cn(
                "flex-1 px-2.5 py-1.5 flex items-center gap-3 text-left focus:outline-none focus:bg-slate-800/20",
                hasExpandableContent && !disabled && "cursor-pointer hover:bg-slate-800/30",
              )}
            >
              <div className="flex items-start gap-2.5 flex-grow min-w-0">
                {hasExpandableContent && (
                  <div className="w-3 h-3 mt-1 flex items-center justify-center shrink-0">
                    {open ? (
                      <ChevronDown className="w-3 h-3 text-blue-400" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-slate-500" />
                    )}
                  </div>
                )}
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span
                    className={cn(
                      "text-[13px] font-bold leading-tight truncate",
                      open && hasExpandableContent ? "text-slate-100" : "text-slate-300",
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
            </DisclosureButton>

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
          <DisclosurePanel className="animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="h-px bg-slate-800/60 mx-3" />
            <div className="p-4 bg-slate-950/20">{expandedContent}</div>
          </DisclosurePanel>
        </div>
      )}
    </Disclosure>
  );
}
