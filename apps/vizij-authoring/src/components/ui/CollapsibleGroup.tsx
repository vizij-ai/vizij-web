import type { ReactNode } from "react";
import {
  CollapsibleRoot,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@semio/ui";
import { IconChevronRight, IconChevronDown } from "@tabler/icons-react";
import { cn } from "../../utils/cn";

export interface CollapsibleGroupProps {
  title: ReactNode;
  subtitle?: ReactNode;
  defaultCollapsed?: boolean;
  itemCount?: number;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}

/**
 * Titled, collapsible section, built on the raw Collapsible primitives
 * `@semio/ui` re-exports (Radix, not semio's own `Collapse`, which has no
 * `actions` slot or `subtitle`).
 *
 * This fixes a whole layer of dead styling. The previous implementation used
 * Radix-flavoured `data-[state=open]` / `group-data-[state=open]` selectors while
 * running on Base UI, which emits `data-open` / `data-closed` / `data-panel-open`
 * instead — so the chevron never swapped, the title never brightened, and the
 * open-state shadow and border never appeared. Radix does emit `data-state`, so
 * the selectors now do what they always claimed to.
 *
 * The `group` marker also moved onto the Collapsible root. It used to sit on an
 * inner `div` that never carried `data-state` at all, which is the other half of
 * why the group selectors were inert.
 *
 * Hardcoded `zinc-*` surfaces and a `text-blue-400` chevron were replaced with
 * tokens; the old values were invisible or off-palette in light mode.
 */
export function CollapsibleGroup({
  title,
  subtitle,
  defaultCollapsed = true,
  itemCount,
  children,
  className = "",
  actions,
}: CollapsibleGroupProps) {
  return (
    <CollapsibleRoot
      defaultOpen={!defaultCollapsed}
      className={cn(
        "group block w-full bg-bg-secondary/40 border border-border-default/60 rounded-xl overflow-hidden mb-2 transition-all duration-200",
        "data-[state=open]:shadow-lg data-[state=open]:border-border-default",
        className,
      )}
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between px-3 py-2 bg-bg-hover/30 cursor-pointer select-none transition-all duration-150 hover:bg-bg-hover/60 focus:outline-none focus-visible:outline-none",
          "group-data-[state=open]:border-b group-data-[state=open]:border-border-default/60",
        )}
      >
        <div className="flex items-start gap-3 flex-[1_1_60%] min-w-0 pointer-events-none">
          <div className="w-4 h-4 mt-0.5 flex items-center justify-center shrink-0">
            <IconChevronDown className="w-3 h-3 text-accent hidden group-data-[state=open]:block" />
            <IconChevronRight className="w-3 h-3 text-text-muted group-data-[state=open]:hidden" />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0 text-left">
            <h3
              className={cn(
                "m-0 text-[11px] font-black uppercase tracking-widest transition-colors",
                "group-data-[state=open]:text-text-primary",
                "group-data-[state=closed]:text-text-secondary",
              )}
            >
              {title}
            </h3>
            {subtitle && (
              <p className="m-0 text-[10px] text-text-muted font-medium leading-tight">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {(actions || itemCount !== undefined) && (
          <div className="flex items-center gap-3 shrink-0">
            {actions && (
              <div
                className="flex items-center gap-1.5"
                onClick={(event) => event.stopPropagation()}
              >
                {actions}
              </div>
            )}
            {itemCount !== undefined && (
              <span className="text-[9px] font-black text-text-muted bg-bg-input/60 px-1.5 py-0.5 rounded border border-border-default/60 uppercase tracking-tighter">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            )}
          </div>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="p-3 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-top-1 duration-200">
        {children}
      </CollapsibleContent>
    </CollapsibleRoot>
  );
}
