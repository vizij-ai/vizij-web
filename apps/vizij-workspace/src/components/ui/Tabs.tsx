import type { ReactNode } from "react";
import "./tabs.css";

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
  variant?: "default" | "pill";
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
    <div
      className={["tabs", `tabs--${size}`, `tabs--${variant}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        role="tablist"
        className={["tabs__list", listClassName].filter(Boolean).join(" ")}
        aria-orientation="horizontal"
      >
        {items.map((item) => {
          const active = item.id === value;
          const disabled = item.disabled ?? false;
          const badgeContent = item.badge;
          const tabId = `tab-${item.id}`;
          const panelId = `panel-${item.id}`;
          return (
            <button
              key={item.id}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              disabled={disabled}
              className={[
                "tabs__trigger",
                active ? "is-active" : "",
                disabled ? "is-disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (!disabled) onValueChange(item.id);
              }}
            >
              <span className="tabs__label">{item.label}</span>
              {item.description ? (
                <span className="tabs__description">{item.description}</span>
              ) : null}
              {badgeContent ? (
                <span className="tabs__badge">{badgeContent}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`panel-${value}`}
        aria-labelledby={`tab-${value}`}
        className={["tabs__panel", panelClassName].filter(Boolean).join(" ")}
      >
        {renderPanel(value)}
      </div>
    </div>
  );
}
