import type { ReactNode } from "react";
import { Tabs as BaseTabs } from "@base-ui/react";
import { cn } from "../../utils/cn";

export type TabId = string;

export interface TabItem {
  id: TabId;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  badge?: ReactNode;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: TabId;
  onValueChange: (next: TabId) => void;
  renderPanel: (id: TabId) => ReactNode;
  className?: string;
  listClassName?: string;
  panelClassName?: string;
  size?: "sm" | "md";
  variant?: "default" | "pill" | "underline";
}

export function Tabs({
  items,
  value,
  onValueChange,
  renderPanel,
  className,
  listClassName,
  panelClassName,
  size = "md",
  variant = "default",
}: TabsProps) {
  return (
    <BaseTabs.Root
      value={value}
      onValueChange={(val) => onValueChange(val as TabId)}
      className={cn("flex w-full flex-col gap-4", className)}
    >
      <BaseTabs.List
        className={cn(
          "flex w-full overflow-x-auto custom-scrollbar",
          {
            "gap-1 border-b border-slate-800": variant === "default",
            "gap-1 rounded-xl border border-slate-900 bg-slate-950 p-1":
              variant === "pill",
            "gap-4 border-b border-slate-800 px-2": variant === "underline",
          },
          listClassName,
        )}
      >
        {items.map((item) => (
          <BaseTabs.Tab
            key={item.id}
            value={item.id}
            disabled={item.disabled}
            className={({ active: selected }: { active: boolean }) =>
              cn(
                "group inline-flex items-center justify-center whitespace-nowrap transition-all focus:outline-none disabled:pointer-events-none disabled:opacity-50 relative cursor-pointer",

                {
                  // Default variant
                  "border-b-2 border-transparent px-3 py-2 text-[13px] font-bold text-slate-500 hover:text-slate-300":
                    variant === "default" && !selected,
                  "border-b-2 border-blue-500 px-3 py-2 text-[13px] font-bold text-blue-400":
                    variant === "default" && selected,

                  // Pill variant
                  "rounded-lg border-0 px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-900 hover:text-slate-300":
                    variant === "pill" && !selected,
                  "rounded-lg border-0 bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-slate-100 shadow-sm":
                    variant === "pill" && selected,

                  // Underline variant (cleaner, premium)
                  "py-2 text-[12px] font-medium text-slate-500 hover:text-slate-300":
                    variant === "underline" && !selected,
                  "py-2 text-[12px] font-bold text-blue-400":
                    variant === "underline" && selected,

                  // Sizes (overrides if needed)
                  "text-[11px]": size === "sm",
                },
              )
            }
          >
            <span>{item.label}</span>
            {item.description && (
              <span className="ml-2 text-[10px] opacity-70 font-medium tracking-tight">
                {item.description}
              </span>
            )}
            {item.badge && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-slate-800/50 px-1.5 py-0.5 text-[9px] font-black text-slate-400 border border-white/5 uppercase tracking-tighter">
                {item.badge}
              </span>
            )}
            {variant === "underline" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full hidden group-data-[state=active]:block" />
            )}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
      <div className={cn("mt-1 focus:outline-none", panelClassName)}>
        {items.map((item) => (
          <BaseTabs.Panel key={item.id} value={item.id} className="focus:outline-none">
            {/* Optimization: only render content if active to match typical tab behavior, OR rely on Tabs.Panel hidden prop.
                 Base UI Tabs.Panel usually handles `hidden` or doesn't render children if not active if `keepMounted` is false.
                 By default functionality, it should be fine. */}
            {renderPanel(item.id)}
          </BaseTabs.Panel>
        ))}
      </div>
    </BaseTabs.Root>
  );
}
