import { type ReactNode } from "react";
import { cn } from "../../utils/cn";
import { useInTreeRoot } from "./TreeRoot";

interface TreeRowProps {
  depth: number;
  isExpanded?: boolean;
  hasChildren: boolean;
  label: string;
  icon?: ReactNode;
  actions?: ReactNode;
  isSelected?: boolean;
  onToggle: () => void;
  onSelect?: (event: React.MouseEvent<HTMLDivElement>) => void;
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

  const inTreeRoot = useInTreeRoot();

  // Left/Right/Enter/Space are the half of the tree pattern that needs this
  // row's own `onToggle`/`onSelect`; `TreeRoot` handles the purely positional
  // keys. See its docblock for why the pattern splits along that seam.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!inTreeRoot || disabled) return;
    // Only the row the key was aimed at responds. Without this a keypress in a
    // nested row would also be handled by every ancestor row on the way up.
    if (event.target !== event.currentTarget) return;

    switch (event.key) {
      case "ArrowRight":
        if (!hasChildren) return;
        if (isExpanded) {
          // Already open — move to the first child, which is the next treeitem
          // in document order.
          const next =
            event.currentTarget.querySelector<HTMLElement>('[role="treeitem"]');
          if (!next) return;
          next.focus();
        } else {
          onToggle();
        }
        break;
      case "ArrowLeft":
        if (hasChildren && isExpanded) {
          onToggle();
        } else {
          const parent =
            event.currentTarget.parentElement?.closest<HTMLElement>(
              '[role="treeitem"]',
            );
          if (!parent) return;
          parent.focus();
        }
        break;
      case "Enter":
      case " ":
        if (onSelect) {
          // The click handler's signature is a mouse event and the keyboard has
          // no equivalent. Rather than fabricate one, forward the keyboard event
          // — every consumer reads only `metaKey`/`ctrlKey` off it, which a
          // keyboard event carries natively.
          onSelect(event as unknown as React.MouseEvent<HTMLDivElement>);
        } else if (hasChildren) {
          onToggle();
        } else {
          return;
        }
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className="group/treeitem flex flex-col select-none outline-none"
      // `treeitem` sits on this wrapper rather than on the visual row below
      // because a treeitem's `role="group"` must be its DESCENDANT, and the
      // children container is a sibling of the row. The focus ring is pushed
      // back onto the row with the named group above so the outline does not
      // draw around the whole subtree.
      role={inTreeRoot ? "treeitem" : undefined}
      // Named explicitly, because the role sits on the wrapper and a name
      // computed from contents would therefore swallow the whole subtree: an
      // expanded branch would announce as "alpha alpha-one alpha-two", growing
      // as the user opens it. It also keeps the row's hover actions — which are
      // buttons with their own labels — out of the row's name.
      aria-label={inTreeRoot ? label : undefined}
      tabIndex={inTreeRoot ? -1 : undefined}
      aria-expanded={
        inTreeRoot && hasChildren ? Boolean(isExpanded) : undefined
      }
      aria-selected={
        inTreeRoot && isSelected !== undefined ? Boolean(isSelected) : undefined
      }
      aria-level={inTreeRoot ? depth + 1 : undefined}
      aria-disabled={inTreeRoot && disabled ? true : undefined}
      onKeyDown={inTreeRoot ? handleKeyDown : undefined}
    >
      <div
        className={cn(
          "group relative flex items-center gap-1.5 rounded px-2 min-h-[30px] transition-all cursor-pointer overflow-hidden",
          isSelected
            ? "bg-accent/10 text-accent shadow-premium shadow-accent-glow border border-accent/20"
            : "text-text-muted hover:bg-bg-hover hover:text-text-primary",
          disabled && "cursor-not-allowed opacity-45 hover:bg-transparent",
          "group-focus-visible/treeitem:ring-2 group-focus-visible/treeitem:ring-accent/70 group-focus-visible/treeitem:ring-inset",
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
            onSelect(e);
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
          // Inside a tree the expander is redundant with ArrowRight/ArrowLeft,
          // and `aria-expanded` already lives on the treeitem — so it is hidden
          // from AT and taken out of the tab order rather than being a second,
          // unnamed control announcing the same state.
          tabIndex={inTreeRoot ? -1 : undefined}
          aria-hidden={inTreeRoot ? true : undefined}
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
        <div className="flex flex-col" role={inTreeRoot ? "group" : undefined}>
          {children}
        </div>
      )}
    </div>
  );
}
