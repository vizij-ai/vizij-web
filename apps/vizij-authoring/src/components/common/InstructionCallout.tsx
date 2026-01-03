import { useId, useState } from "react";
import type { ReactNode } from "react";

interface InstructionCalloutProps {
  label: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  size?: "default" | "compact";
  isOpen?: boolean;
  trigger?: "self" | "external";
  contentId?: string;
  onToggle?: (nextOpen: boolean) => void;
}

export function InstructionCallout({
  label,
  summary,
  children,
  defaultOpen = false,
  size = "default",
  isOpen,
  trigger = "self",
  contentId,
  onToggle,
}: InstructionCalloutProps) {
  const generatedId = useId();
  const resolvedContentId = contentId ?? generatedId;
  const isControlled = typeof isOpen === "boolean";
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = isControlled ? isOpen : internalOpen;
  const isExternalTrigger = trigger === "external";

  const handleToggle = () => {
    if (isControlled) {
      onToggle?.(!open);
      return;
    }
    setInternalOpen((current) => {
      const next = !current;
      onToggle?.(next);
      return next;
    });
  };

  const sectionProps =
    isExternalTrigger && !open
      ? {
          hidden: true,
        }
      : {};

  return (
    <section
      className={`instruction-callout instruction-callout--${size}`}
      data-open={open ? "true" : undefined}
      {...sectionProps}
    >
      {isExternalTrigger ? (
        <div className="instruction-callout__text">
          <span className="instruction-callout__label">{label}</span>
          {summary ? (
            <span className="instruction-callout__summary">{summary}</span>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className="instruction-callout__toggle"
          onClick={handleToggle}
          aria-expanded={open}
          aria-controls={resolvedContentId}
        >
          <div className="instruction-callout__text">
            <span className="instruction-callout__label">{label}</span>
            {summary ? (
              <span className="instruction-callout__summary">{summary}</span>
            ) : null}
          </div>
          <span className="instruction-callout__chevron" aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
        </button>
      )}
      <div
        id={resolvedContentId}
        className="instruction-callout__content"
        hidden={!open}
      >
        {children}
      </div>
    </section>
  );
}
