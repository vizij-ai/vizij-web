import type { WorkbenchOption, WorkbenchView } from "./workbenchConfig";
import { cn } from "../../utils/cn";

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
    <nav className="flex flex-col gap-3" aria-label="Workbench views">
      {options.map((option) => {
        const isActive = option.id === activeWorkbench;
        return (
          <button
            key={option.id}
            type="button"
            className={cn(
              "flex w-full flex-col gap-1 rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 text-left transition-all hover:border-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600",
              isActive &&
              "border-blue-500 bg-gradient-to-br from-blue-900/20 to-slate-900 text-slate-50",
            )}
            onClick={() => onSelect(option.id)}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="text-base font-semibold text-slate-50">
              {option.label}
            </span>
            <span className="text-xs leading-snug text-slate-400">
              {option.description}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
