import type { ReactNode } from "react";
import {
  CollapsibleRoot,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@semio/ui";
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

/**
 * Inspector row with an optional inline value slider, an actions well, and
 * optional expandable content. Built on the raw Collapsible primitives
 * `@semio/ui` re-exports (Radix, not semio's own `Collapse`, which has no
 * `actions` slot or `subtitle`) — same composition as `CollapsibleGroup`.
 *
 * As with `CollapsibleGroup`, this revives a layer of dead styling: the
 * `data-[state=open]` / `group-data-[state=open]` selectors below are
 * Radix-flavoured but were running on Base UI, which emits
 * `data-open` / `data-closed` instead. So the chevron never swapped, the title
 * never dimmed while closed, the open-state accent border and ring never
 * appeared, and the panel never animated. Radix does emit `data-state`, so they
 * now do what they always claimed to.
 *
 * The `group` marker was already on the Collapsible root here, so it stays put.
 *
 * The wrapper `div` is deliberately kept separate from the root: it carries
 * `data-row-id` and the caller's `className`, and several call sites pass
 * `group-data-[state=open]:…` overrides in that `className`, which only resolve
 * on a descendant of `.group` — never on the `.group` element itself.
 */
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
    <CollapsibleRoot defaultOpen={defaultExpanded} className="group w-full">
      <div
        className={cn(
          "bg-bg-secondary/40 border border-border-default/60 rounded-xl mb-1.5 transition-all duration-150 overflow-hidden",
          "group-data-[state=open]:border-accent/50 group-data-[state=open]:shadow-[0_0_0_1px_var(--color-accent-subtle)]",
          !hasExpandableContent &&
            "group-data-[state=open]:border-border-default/60 group-data-[state=open]:shadow-none", // Prevent highlighting if not expandable (the trigger is disabled, so this only bites a defaultExpanded row with no content)
          disabled && "opacity-50 pointer-events-none",
          className,
        )}
        data-row-id={id}
      >
        <div className="flex items-center gap-2 flex-wrap min-h-[var(--editor-row-min-height,32px)]">
          <CollapsibleTrigger
            disabled={!hasExpandableContent || disabled}
            className={cn(
              "flex-1 min-w-[12rem] min-h-8 px-2.5 py-1 flex items-center gap-2 text-left focus:outline-none focus:bg-bg-hover/20 w-full",
              hasExpandableContent &&
                !disabled &&
                "cursor-pointer hover:bg-bg-hover/30",
            )}
          >
            <div className="flex items-start gap-2.5 flex-grow min-w-0 pointer-events-none">
              {/* pointer-events-none on content to prevent interfering with button click if complex? No, standard button is fine. */}
              {hasExpandableContent && (
                <div className="w-3 h-3 mt-1 flex items-center justify-center shrink-0">
                  <ChevronRight className="w-3 h-3 text-text-secondary group-data-[state=open]:hidden" />
                  <ChevronDown className="w-3 h-3 text-accent hidden group-data-[state=open]:block" />
                </div>
              )}
              <div className="flex flex-col gap-0.5 min-w-0 text-left">
                <span
                  className={cn(
                    "text-[13px] font-bold leading-tight truncate transition-colors",
                    "group-data-[state=open]:text-text-primary",
                    "group-data-[state=closed]:text-text-secondary",
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
          </CollapsibleTrigger>

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
        <CollapsibleContent className="data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-top-1 duration-200 overflow-hidden">
          <div className="h-px bg-border-default/60 mx-3" />
          <div className="p-4 bg-bg-secondary/20">{expandedContent}</div>
        </CollapsibleContent>
      </div>
    </CollapsibleRoot>
  );
}
