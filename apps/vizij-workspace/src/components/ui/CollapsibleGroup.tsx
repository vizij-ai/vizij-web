import { Collapsible as BaseCollapsible } from "@base-ui/react";
import type { ReactNode } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "../../utils/cn";

export interface CollapsibleGroupProps {
  title: string;
  subtitle?: ReactNode;
  defaultCollapsed?: boolean;
  itemCount?: number;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}

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
    <BaseCollapsible.Root defaultOpen={!defaultCollapsed}>
      <div
        className={cn(
          "bg-slate-900/40 border border-slate-800/60 rounded-xl overflow-hidden mb-2 transition-all duration-200 group",
          "data-[state=open]:shadow-lg data-[state=open]:shadow-black/20 data-[state=open]:border-slate-800",
          className,
        )}
      >
        <BaseCollapsible.Trigger
          className={cn(
            "flex w-full items-center justify-between px-3 py-2 bg-slate-800/20 cursor-pointer select-none transition-all duration-150 hover:bg-slate-800/40 focus:outline focus:outline-2 focus:outline-blue-500/50 focus:-outline-offset-2",
            "group-data-[state=open]:border-b group-data-[state=open]:border-slate-800/40",
          )}
        >
          <div className="flex items-start gap-3 flex-[1_1_60%] min-w-0 pointer-events-none">
            <div className="w-4 h-4 mt-0.5 flex items-center justify-center shrink-0">
              <ChevronDown className="w-3 h-3 text-blue-400 transition-transform hidden group-data-[state=open]:block" />
              <ChevronRight className="w-3 h-3 text-slate-500 transition-transform group-data-[state=open]:hidden" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0 text-left">
              <h3
                className={cn(
                  "m-0 text-[11px] font-black uppercase tracking-widest transition-colors",
                  "group-data-[state=open]:text-slate-100",
                  "group-data-[state=closed]:text-slate-400"
                )}
              >
                {title}
              </h3>
              {subtitle && (
                <p className="m-0 text-[10px] text-slate-500 font-medium leading-tight">
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
                <span className="text-[9px] font-black text-slate-500 bg-slate-950/40 px-1.5 py-0.5 rounded border border-slate-800/40 uppercase tracking-tighter">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
              )}
            </div>
          )}
        </BaseCollapsible.Trigger>
        <BaseCollapsible.Panel className="p-3 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-top-1 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-top-1 duration-200">
          {children}
        </BaseCollapsible.Panel>
      </div>
    </BaseCollapsible.Root>
  );
}
