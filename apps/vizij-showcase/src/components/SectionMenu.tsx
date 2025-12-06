import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useActiveSectionId } from "../hooks/useActiveSectionId";

export type SectionMenuItem = {
  id: string;
  label: string;
};

type SectionMenuProps = {
  sections: SectionMenuItem[];
};

export function SectionMenu({ sections }: SectionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const toggleId = useId();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const sectionIds = useMemo(
    () => sections.map((section) => section.id),
    [sections],
  );
  const activeSectionId = useActiveSectionId(sectionIds);
  const activeLabel =
    sections.find((section) => section.id === activeSectionId)?.label ??
    sections[0]?.label ??
    "Sections";

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleClickOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        target &&
        !panelRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handleClickOutside);
    return () =>
      document.removeEventListener("pointerdown", handleClickOutside);
  }, [isOpen]);

  const handleNavigate = (sectionId: string) => {
    setIsOpen(false);
    const node = document.getElementById(sectionId);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <>
      {isOpen ? (
        <div
          className="section-menu__backdrop"
          role="presentation"
          onClick={() => setIsOpen(false)}
        />
      ) : null}

      <div className="section-menu">
        <button
          id={toggleId}
          ref={buttonRef}
          type="button"
          className="section-menu__toggle"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <span className="section-menu__icon" aria-hidden>
            <span className="section-menu__icon-line" />
            <span className="section-menu__icon-line" />
            <span className="section-menu__icon-line" />
          </span>
          <span className="section-menu__label">Sections</span>
          <span className="section-menu__current">{activeLabel}</span>
        </button>

        <nav
          id={panelId}
          aria-labelledby={toggleId}
          aria-label="Showcase sections"
          className={`section-menu__drawer${isOpen ? " is-open" : ""}`}
          ref={panelRef}
        >
          <p className="section-menu__drawer-label">Jump to</p>
          <ul className="section-menu__list">
            {sections.map((section, index) => {
              const isActive = section.id === activeSectionId;
              return (
                <li key={section.id} className="section-menu__item">
                  <button
                    type="button"
                    className={`section-menu__link${
                      isActive ? " is-active" : ""
                    }`}
                    onClick={() => handleNavigate(section.id)}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <span className="section-menu__link-left">
                      <span className="section-menu__index" aria-hidden>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="section-menu__name">
                        {section.label}
                      </span>
                    </span>
                    <span className="section-menu__pill">
                      {isActive ? "Now" : "Go"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </>
  );
}
