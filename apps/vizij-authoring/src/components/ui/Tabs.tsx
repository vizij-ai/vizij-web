import type { ReactNode } from "react";
import { Tabs as RadixTabs } from "radix-ui";
import { cn } from "../../utils/cn";

export type TabId = string;

export interface TabItem {
  id: TabId;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  badge?: ReactNode;
  testId?: string;
  panelTestId?: string;
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
  fillPanels?: boolean;
}

/**
 * Tab bar + panels, built on `radix-ui`'s Tabs.
 *
 * radix rather than `@semio/ui`: semio's `Tabs` takes `TabChild.title` as a
 * `string`, forwards no `data-*` onto its `Tabs.Tab`, and has no `disabled` or
 * `badge`. This app's tabs carry five `data-testid`s and their accessible names
 * are asserted with both ends anchored — `/^Programs \(\d+\)$/` — so the label
 * must be the tab's entire text content. semio's version cannot express any of
 * that. `radix-ui` is the same stack `@semio/ui` is built on.
 *
 * The `underline` variant's accent bar works for the first time. It was gated on
 * `group-data-[state=active]:block`, a Radix-flavoured selector, while running on
 * Base UI, which emits `data-selected` — so the bar never rendered. Radix does
 * emit `data-state="active"`.
 *
 * Selection is derived by comparing `item.id === value` rather than from a
 * render-prop. Base UI passed `({ active })` into a function-form `className`;
 * radix has no such form, and `value` is controlled here anyway.
 *
 * `forceMount` on Content is deliberate and preserves existing behaviour: Base UI
 * kept every panel's subtree mounted and merely hid the inactive ones, so
 * switching tabs did not discard panel-local state (scroll position, expanded
 * rows). Radix unmounts inactive content by default, which would silently reset
 * that state — `VariablesPanel` is 8.7k lines and mounted twice. Dropping
 * `forceMount` would be a real perf win but is a behaviour change, so it belongs
 * in its own commit rather than smuggled into a substrate swap.
 *
 * **`forceMount` MUST be paired with `data-[state=inactive]:hidden`.** Radix
 * computes `present = forceMount || isSelected` and then sets `hidden={!present}`,
 * so with `forceMount` every panel is `present`, none receive `hidden`, and every
 * panel renders at once. An earlier revision shipped `forceMount` without the
 * hide and did exactly that. Do not remove one without the other.
 */
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
  fillPanels = false,
}: TabsProps) {
  return (
    <RadixTabs.Root
      value={value}
      onValueChange={(next) => onValueChange(next as TabId)}
      className={cn("flex w-full flex-col gap-4", className)}
    >
      <RadixTabs.List
        className={cn(
          "flex w-full flex-wrap overflow-visible",
          fillPanels && "shrink-0",
          {
            "gap-1 border-b border-border-default": variant === "default",
            "gap-1 rounded-xl border border-border-default bg-bg-input p-1":
              variant === "pill",
            "gap-4 border-b border-border-default px-2":
              variant === "underline",
          },
          listClassName,
        )}
      >
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <RadixTabs.Trigger
              key={item.id}
              value={item.id}
              disabled={item.disabled}
              data-testid={item.testId}
              className={cn(
                "group inline-flex items-center justify-center whitespace-nowrap transition-all focus:outline-none disabled:pointer-events-none disabled:opacity-50 relative cursor-pointer",
                {
                  // Default variant
                  "border-b-2 border-transparent px-3 py-2 text-[13px] font-bold text-text-secondary hover:text-text-primary":
                    variant === "default" && !selected,
                  "border-b-2 border-accent px-3 py-2 text-[13px] font-bold text-accent":
                    variant === "default" && selected,

                  // Pill variant
                  "rounded-lg border-0 px-3 py-1.5 text-[11px] font-bold text-text-secondary hover:bg-bg-hover hover:text-text-primary":
                    variant === "pill" && !selected,
                  "rounded-lg border-0 bg-bg-active px-3 py-1.5 text-[11px] font-bold text-text-primary shadow-sm":
                    variant === "pill" && selected,

                  // Underline variant (cleaner, premium)
                  "py-2 text-[12px] font-medium text-text-secondary hover:text-text-primary":
                    variant === "underline" && !selected,
                  "py-2 text-[12px] font-bold text-accent":
                    variant === "underline" && selected,

                  // Sizes (overrides if needed)
                  "text-[11px]": size === "sm",
                },
              )}
            >
              <span>{item.label}</span>
              {item.description && (
                <span className="ml-2 text-[10px] opacity-70 font-medium tracking-tight">
                  {item.description}
                </span>
              )}
              {item.badge && (
                <span className="ml-2 inline-flex items-center justify-center rounded-full bg-bg-active px-1.5 py-0.5 text-[9px] font-black text-text-muted border border-border-default/50 uppercase tracking-tighter">
                  {item.badge}
                </span>
              )}
              {variant === "underline" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t-full hidden group-data-[state=active]:block" />
              )}
            </RadixTabs.Trigger>
          );
        })}
      </RadixTabs.List>
      <div
        className={cn(
          "mt-1 focus:outline-none",
          fillPanels && "flex-1 min-h-0",
          panelClassName,
        )}
      >
        {items.map((item) => (
          <RadixTabs.Content
            key={item.id}
            value={item.id}
            forceMount
            data-testid={item.panelTestId}
            className={cn(
              "focus:outline-none",
              // REQUIRED alongside `forceMount`. Radix computes
              // `present = forceMount || isSelected` and then sets
              // `hidden={!present}`, so with forceMount every panel is `present`
              // and NONE get `hidden` — all panels render at once. Radix marks
              // inactive ones `data-state="inactive"`, so hiding has to be done
              // here.
              "data-[state=inactive]:hidden",
              fillPanels && "h-full min-h-0",
            )}
          >
            {renderPanel(item.id)}
          </RadixTabs.Content>
        ))}
      </div>
    </RadixTabs.Root>
  );
}
