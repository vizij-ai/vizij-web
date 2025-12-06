import React, { useState, useCallback, type ReactNode } from "react";
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
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleToggle = useCallback(() => {
    if (!expandedContent || disabled) return;
    setIsExpanded((prev) => !prev);
  }, [expandedContent, disabled]);

  const shouldIgnoreInteraction = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    // Only block clicks on action buttons/areas; allow empty control strip to toggle.
    return Boolean(target.closest(".collapsible-row__actions"));
  }, []);

  const handleHeaderClick = useCallback(
    (event: React.MouseEvent) => {
      if (shouldIgnoreInteraction(event.target)) {
        return;
      }
      handleToggle();
    },
    [handleToggle, shouldIgnoreInteraction],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!expandedContent || disabled) return;
      if (shouldIgnoreInteraction(event.target)) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleToggle();
      }
    },
    [expandedContent, disabled, handleToggle, shouldIgnoreInteraction],
  );

  const hasExpandableContent = Boolean(expandedContent);

  return (
    <div
      className={`collapsible-row ${isExpanded ? "collapsible-row--expanded" : ""} ${disabled ? "collapsible-row--disabled" : ""} ${className}`}
      data-row-id={id}
    >
      <div
        className={`collapsible-row__compact ${hasExpandableContent ? "collapsible-row__compact--clickable" : ""}`}
        onClick={hasExpandableContent ? handleHeaderClick : undefined}
        onKeyDown={hasExpandableContent ? handleKeyDown : undefined}
        role={hasExpandableContent ? "button" : undefined}
        tabIndex={hasExpandableContent && !disabled ? 0 : undefined}
        aria-expanded={hasExpandableContent ? isExpanded : undefined}
      >
        <div className="collapsible-row__header">
          {hasExpandableContent && (
            <span className="collapsible-row__toggle-icon">
              {isExpanded ? "▼" : "▶"}
            </span>
          )}
          <div className="collapsible-row__text">
            <span className="collapsible-row__title">{title}</span>
            {subtitle && (
              <span className="collapsible-row__subtitle">{subtitle}</span>
            )}
          </div>
        </div>
        <div className="collapsible-row__controls">
          {showSlider && value !== undefined && onValueChange && (
            <RowSlider
              value={value}
              min={min}
              max={max}
              step={step}
              onChange={onValueChange}
              disabled={disabled}
            />
          )}
          {actions && <div className="collapsible-row__actions">{actions}</div>}
        </div>
      </div>
      {isExpanded && expandedContent && (
        <>
          <div className="collapsible-row__divider" />
          <div className="collapsible-row__expanded">{expandedContent}</div>
        </>
      )}
    </div>
  );
}
