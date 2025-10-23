import { FeatureRow } from "./FeatureRow";
import type { FeatureEntry, FeatureRowProps } from "./types";

type FeatureRowSharedProps = Omit<
  FeatureRowProps,
  "entry" | "isCollapsed" | "onToggleCollapse"
>;

interface FeatureGroup {
  elementId: string;
  elementName: string;
  elementType: string;
  entries: FeatureEntry[];
}

interface FeatureGroupListProps extends FeatureRowSharedProps {
  groups: FeatureGroup[];
  collapsedGroups: Set<string>;
  collapsedFeatureRows: Set<string>;
  onToggleGroup: (elementId: string) => void;
  onToggleFeatureCollapse: (featureId: string) => void;
}

export function FeatureGroupList({
  groups,
  collapsedGroups,
  collapsedFeatureRows,
  onToggleGroup,
  onToggleFeatureCollapse,
  ...rowProps
}: FeatureGroupListProps) {
  if (groups.length === 0) {
    return (
      <p className="sidebar__empty">No features match the current filters.</p>
    );
  }

  return (
    <div className="feature-panel__groups">
      {groups.map((group) => {
        const isCollapsed = collapsedGroups.has(group.elementId);
        return (
          <section className="feature-group" key={group.elementId}>
            <header className="feature-group__header">
              <button
                type="button"
                className="feature-group__toggle-btn"
                onClick={() => onToggleGroup(group.elementId)}
                aria-expanded={!isCollapsed}
                aria-label={
                  isCollapsed
                    ? `Expand ${group.elementName}`
                    : `Collapse ${group.elementName}`
                }
              >
                {isCollapsed ? "+" : "−"}
              </button>
              <div className="feature-group__summary">
                <h3 className="feature-group__title">{group.elementName}</h3>
                <span className="feature-group__type">{group.elementType}</span>
              </div>
            </header>
            {!isCollapsed && (
              <div className="feature-group__body">
                {group.entries.map((entry) => (
                  <FeatureRow
                    key={entry.id}
                    entry={entry}
                    isCollapsed={collapsedFeatureRows.has(entry.id)}
                    onToggleCollapse={onToggleFeatureCollapse}
                    {...rowProps}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
