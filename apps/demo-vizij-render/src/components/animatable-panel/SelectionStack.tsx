import type { Selection } from "@vizij/render";

interface SelectionStackProps {
  selectionStack: Selection[];
  world: Record<string, { name?: string }>;
  onFocusSelectionIndex: (index: number) => void;
}

function selectionKey(sel: Selection) {
  return `${sel.namespace}:${sel.type}:${sel.id}`;
}

export function SelectionStack({
  selectionStack,
  world,
  onFocusSelectionIndex,
}: SelectionStackProps) {
  if (selectionStack.length === 0) {
    return null;
  }

  return (
    <div
      className="feature-panel__stack"
      role="group"
      aria-label="Selection stack"
    >
      <h3 className="feature-panel__stack-title">Selection stack</h3>
      <ol className="feature-panel__stack-list">
        {selectionStack.map((sel, index) => {
          const renderable = world[sel.id];
          const label = renderable?.name || sel.id;
          const isActive = index === 0;
          return (
            <li
              key={selectionKey(sel)}
              className={`feature-panel__stack-item${isActive ? " feature-panel__stack-item--active" : ""}`}
            >
              <button
                type="button"
                className="feature-panel__stack-button"
                onClick={() => onFocusSelectionIndex(index)}
                disabled={isActive}
              >
                <span className="feature-panel__stack-label">{label}</span>
                <span className="feature-panel__stack-meta">{sel.type}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
