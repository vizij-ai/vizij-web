import { type ReactNode } from "react";
import { cn } from "../../utils/cn";

interface TreeRowProps {
  depth: number;
  isExpanded?: boolean;
  hasChildren: boolean;
  label: string;
  icon?: ReactNode;
  actions?: ReactNode;
  isSelected?: boolean;
  onToggle: () => void;
  onSelect?: () => void;
  highlightQuery?: string;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  disabledReason?: string;
  children?: ReactNode;
}

export function TreeRow({
  depth,
  isExpanded,
  hasChildren,
  label,
  icon,
  actions,
  isSelected,
  onToggle,
  onSelect,
  highlightQuery,
  className,
  style,
  disabled = false,
  disabledReason,
  children,
}: TreeRowProps) {
  const matchesQuery =
    highlightQuery &&
    highlightQuery.trim().length > 0 &&
    label.toLowerCase().includes(highlightQuery.toLowerCase());

  return (
    <div className="flex flex-col select-none">
      <div
        className={cn(
          "group relative flex items-center gap-1.5 rounded px-2 min-h-[30px] transition-all cursor-pointer overflow-hidden",
          isSelected
            ? "bg-accent/10 text-accent shadow-premium shadow-accent-glow border border-accent/20"
            : "text-text-muted hover:bg-bg-hover hover:text-text-primary",
          disabled && "cursor-not-allowed opacity-45 hover:bg-transparent",
          className,
        )}
        style={{ paddingLeft: `${depth * 12 + 12}px`, ...style }}
        title={disabledReason ?? undefined}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) {
            return;
          }
          // If we have select handler, call it. Otherwise toggle if children exist.
          if (onSelect) {
            onSelect();
          } else if (hasChildren) {
            onToggle();
          }
        }}
      >
        {/* Selection Accent Bar */}
        {isSelected && (
          <div className="absolute left-0 top-1 bottom-1 w-1 rounded-r-full bg-accent-gradient shadow-accent-glow" />
        )}

        {/* Expander Arrow */}
        <button
          type="button"
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-bg-active transition-transform duration-200",
            !hasChildren && "opacity-0 pointer-events-none",
            isExpanded && "rotate-90",
          )}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) {
              return;
            }
            onToggle();
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        {/* Custom Icon (usually passed as a prop) */}
        {icon && (
          <span className="flex items-center justify-center">{icon}</span>
        )}

        {/* Label */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className={cn(
              "text-[12px] font-semibold truncate flex-1 min-w-0 tracking-tight",
              matchesQuery &&
                "bg-yellow-200/80 dark:bg-yellow-500/30 text-text-primary rounded-sm px-0.5 -mx-0.5",
              isSelected && "text-accent",
            )}
            title={label}
          >
            {label}
          </span>

          {/* Actions (Hover) - visible when group hovered OR row selected */}
          {actions && (
            <div
              className={cn(
                "flex items-center gap-1.5 ml-auto opacity-0 transition-opacity",
                // Show actions on hover OR when selected
                "group-hover:opacity-100",
                isSelected && "opacity-100",
              )}
            >
              {actions}
            </div>
          )}
        </div>
      </div>

      {/* Children Container */}
      {hasChildren && isExpanded && children && (
        <div className="flex flex-col">{children}</div>
      )}
    </div>
  );
}
