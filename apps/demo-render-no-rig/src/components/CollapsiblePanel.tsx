import { useState, type ReactNode } from "react";

interface CollapsiblePanelProps {
  title: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  headerEnd?: ReactNode;
  subtitle?: ReactNode;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
}

export function CollapsiblePanel({
  title,
  children,
  className,
  bodyClassName,
  headerEnd,
  subtitle,
  defaultOpen = true,
  onToggle,
}: CollapsiblePanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  const handleToggle = () => {
    setOpen((prev) => {
      const next = !prev;
      onToggle?.(next);
      return next;
    });
  };

  return (
    <div
      className={[
        "panel",
        "collapsible-panel",
        open ? "is-open" : "is-collapsed",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="panel-header">
        <div className="panel-heading">
          <h2>{title}</h2>
          {subtitle ? <span className="panel-subtitle">{subtitle}</span> : null}
        </div>
        <div className="panel-header-controls">
          {headerEnd}
          <button
            type="button"
            className="panel-toggle"
            aria-expanded={open}
            onClick={handleToggle}
          >
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      {open ? (
        <div
          className={["panel-body", bodyClassName].filter(Boolean).join(" ")}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
