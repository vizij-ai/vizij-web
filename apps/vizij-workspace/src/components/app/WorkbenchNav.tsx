import type { WorkbenchOption, WorkbenchView } from "./workbenchConfig";

interface WorkbenchNavProps {
  options: ReadonlyArray<WorkbenchOption>;
  activeWorkbench: WorkbenchView;
  onSelect: (view: WorkbenchView) => void;
}

/**
 * Compact navigation list used on the left sidebar to switch workbench views.
 */
export function WorkbenchNav({
  options,
  activeWorkbench,
  onSelect,
}: WorkbenchNavProps) {
  return (
    <nav className="workbench-nav" aria-label="Workbench views">
      {options.map((option) => {
        const isActive = option.id === activeWorkbench;
        return (
          <button
            key={option.id}
            type="button"
            className={`workbench-nav__button${isActive ? " is-active" : ""}`}
            onClick={() => onSelect(option.id)}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="workbench-nav__label">{option.label}</span>
            <span className="workbench-nav__description">
              {option.description}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
