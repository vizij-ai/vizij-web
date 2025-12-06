import React, { useState, useCallback, type ReactNode } from "react";

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
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const handleToggle = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const shouldIgnoreInteraction = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return Boolean(target.closest(".collapsible-group__actions"));
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (shouldIgnoreInteraction(event.target)) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleToggle();
      }
    },
    [handleToggle, shouldIgnoreInteraction],
  );

  const handleHeaderClick = useCallback(
    (event: React.MouseEvent) => {
      if (shouldIgnoreInteraction(event.target)) {
        return;
      }
      handleToggle();
    },
    [handleToggle, shouldIgnoreInteraction],
  );

  return (
    <section
      className={`collapsible-group ${isCollapsed ? "collapsible-group--collapsed" : ""} ${className}`}
    >
      <header
        className="collapsible-group__header"
        onClick={handleHeaderClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
      >
        <div className="collapsible-group__title-area">
          <span className="collapsible-group__toggle-icon" aria-hidden>
            {isCollapsed ? "▶" : "▼"}
          </span>
          <div className="collapsible-group__text">
            <h3 className="collapsible-group__title">{title}</h3>
            {subtitle && (
              <p className="collapsible-group__subtitle">{subtitle}</p>
            )}
          </div>
        </div>
        {(actions || itemCount !== undefined) && (
          <div className="collapsible-group__meta">
            {actions && (
              <div
                className="collapsible-group__actions"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {actions}
              </div>
            )}
            {itemCount !== undefined && (
              <span className="collapsible-group__count">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
            )}
          </div>
        )}
      </header>
      {!isCollapsed && (
        <div className="collapsible-group__body">{children}</div>
      )}
    </section>
  );
}
