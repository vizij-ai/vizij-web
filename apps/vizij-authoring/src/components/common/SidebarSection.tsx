import { useId, useState } from "react";
import type { ReactNode } from "react";

type SidebarInstructions = {
  label: string;
  summary?: string;
  content: ReactNode;
  size?: "default" | "compact";
};

interface SidebarSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  instructions?: SidebarInstructions;
  defaultInstructionsOpen?: boolean;
}

export function SidebarSection({
  title,
  description,
  children,
  instructions,
  defaultInstructionsOpen = false,
}: SidebarSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultInstructionsOpen);
  const instructionId = useId();
  const instructionContent = instructions ?? null;
  const hasInstructions = Boolean(instructionContent);
  const Chevron = () => (
    <span className="sidebar__section-chevron" aria-hidden="true">
      {isOpen ? "▾" : "▸"}
    </span>
  );

  return (
    <section className="sidebar__section">
      <header
        className={`sidebar__section-header${
          hasInstructions ? " sidebar__section-header--collapsible" : ""
        }`}
      >
        {instructionContent ? (
          <>
            <button
              type="button"
              className="sidebar__section-trigger"
              onClick={() => setIsOpen((current) => !current)}
              aria-expanded={isOpen}
              aria-controls={instructionId}
            >
              <div className="sidebar__section-text">
                <h2 className="sidebar__section-title">{title}</h2>
                {description ? (
                  <p className="sidebar__section-description">{description}</p>
                ) : null}
              </div>
              <Chevron />
            </button>
            <div
              id={instructionId}
              className={`sidebar__section-instructions sidebar__section-instructions--${
                instructionContent.size ?? "compact"
              }`}
              aria-hidden={!isOpen}
              style={{ display: isOpen ? "flex" : "none" }}
              data-open={isOpen ? "true" : undefined}
            >
              <p className="sidebar__section-instructions-label">
                {instructionContent.label}
              </p>
              {instructionContent.summary ? (
                <p className="sidebar__section-instructions-summary">
                  {instructionContent.summary}
                </p>
              ) : null}
              <div className="sidebar__section-instructions-body">
                {instructionContent.content}
              </div>
            </div>
          </>
        ) : (
          <div className="sidebar__section-text">
            <h2 className="sidebar__section-title">{title}</h2>
            {description ? (
              <p className="sidebar__section-description">{description}</p>
            ) : null}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}
