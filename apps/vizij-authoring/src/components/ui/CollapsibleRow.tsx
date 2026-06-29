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
    <BaseCollapsible.Root
      defaultOpen={defaultExpanded}
      className="group w-full"
    >
      <div
        className={cn(
          "bg-bg-secondary/40 border border-border-default/60 rounded-xl mb-1.5 transition-all duration-150 overflow-hidden",
          "group-data-[open]:border-accent/50 group-data-[open]:shadow-[0_0_0_1px_var(--color-accent-subtle)]",
          !hasExpandableContent &&
            "group-data-[open]:border-border-default group-data-[open]:shadow-none", // Prevent highlighting if not expandable (though Root shouldn't open technically if disabled? Wrapper handles visuals)
          disabled && "opacity-50 pointer-events-none",
          className,
        )}
        data-row-id={id}
      >
        <div className="flex items-center gap-2 flex-wrap inspector-row-hit-target">
          <BaseCollapsible.Trigger
            disabled={!hasExpandableContent || disabled}
            className={cn(
              "flex-1 min-w-[12rem] min-h-8 px-2.5 py-1 flex items-center gap-2 text-left focus:outline-none focus:bg-bg-secondary/40 w-full",
              hasExpandableContent &&
                !disabled &&
                "cursor-pointer hover:bg-bg-secondary/60",
            )}
          >
            <div className="flex items-start gap-2.5 flex-grow min-w-0 pointer-events-none">
              {/* pointer-events-none on content to prevent interfering with button click if complex? No, standard button is fine. */}
              {hasExpandableContent && (
                <div className="w-3 h-3 mt-1 flex items-center justify-center shrink-0">
                  <ChevronRight className="w-3 h-3 text-text-secondary group-data-[open]:hidden" />
                  <ChevronDown className="w-3 h-3 text-accent hidden group-data-[open]:block" />
                </div>
              )}
              <div className="flex flex-col gap-0.5 min-w-0 text-left">
                <span
                  className={cn(
                    "text-[13px] font-bold leading-tight truncate transition-colors",
                    "group-data-[open]:text-text-primary",
                    "group-data-[closed]:text-text-secondary",
                  )}
                >
                  {title}
                </span>
                {subtitle && (
                  <span className="text-[10px] text-text-muted truncate leading-tight font-medium">
                    {subtitle}
                  </span>
                )}
              </div>
            </div>
          </BaseCollapsible.Trigger>

          <div className="flex items-center justify-end gap-2 flex-wrap flex-1 min-w-0 pr-2.5 py-1">
            {showSlider && value !== undefined && onValueChange && (
              <div className="flex-1 basis-[14rem] min-w-0 max-w-full">
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
        <BaseCollapsible.Panel className="data-[open]:animate-in data-[open]:fade-in data-[open]:slide-in-from-top-1 data-[closed]:animate-out data-[closed]:fade-out data-[closed]:slide-out-to-top-1 duration-200 overflow-hidden">
          <div className="h-px bg-border-default/60 mx-3" />
          <div className="p-4 bg-bg-secondary/20">{expandedContent}</div>
        </BaseCollapsible.Panel>
      </div>
    </BaseCollapsible.Root>
  );
}
