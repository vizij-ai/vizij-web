import type { ReactNode } from "react";
import { Collapsible } from "radix-ui";
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
  /**
   * Glyph before the title, tinted to the accent while open.
   *
   * Added so `InstructionCallout` could stop being a second implementation of
   * this component — it was the only thing it needed that this did not have.
   */
  icon?: ReactNode;
}

/**
 * Titled, collapsible section, built on Radix's Collapsible primitives rather
 * than `@semio/ui`'s `Collapse`, which has no `actions` slot or `subtitle`.
 *
 * The open-state styling uses `data-[state=open]` / `group-data-[state=open]`
 * selectors, which Radix's `data-state` attribute drives; the `group` marker
 * sits on the Collapsible root, the element that carries it.
 */
export function CollapsibleGroup({
  title,
  subtitle,
  defaultCollapsed = true,
  itemCount,
  children,
  className = "",
  actions,
  icon,
}: CollapsibleGroupProps) {
  return (
    <Collapsible.Root
      defaultOpen={!defaultCollapsed}
      className={cn(
        "group block w-full bg-bg-secondary/40 border border-border-default/60 rounded-xl overflow-hidden mb-2 transition-all duration-200",
        "data-[state=open]:shadow-lg data-[state=open]:border-border-default",
        className,
      )}
    >
      <Collapsible.Trigger
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
          {icon && (
            <div className="mt-0.5 shrink-0 text-text-muted transition-colors group-data-[state=open]:text-accent">
              {icon}
            </div>
          )}
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
      </Collapsible.Trigger>
      <Collapsible.Content className="p-3 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-top-1 duration-200">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
