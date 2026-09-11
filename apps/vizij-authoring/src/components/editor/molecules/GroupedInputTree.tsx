import type { ReactNode } from "react";
import { Folder } from "lucide-react";
import { TreeRow } from "../../ui/TreeRow";
import { ControlRow, type ControlRowValue } from "./ControlRow";

/**
 * A folder node. Declared here rather than imported so the layer owns its own
 * contract — vizij's `GroupedInputRowsByFolder` is a structural match, so it
 * satisfies this with no adapter.
 */
export interface GroupedInputFolder<TRow extends ControlRowValue> {
  id: string;
  label: string;
  children: GroupedInputFolder<TRow>[];
  rows: TRow[];
}

export interface GroupedInputTreeProps<TRow extends ControlRowValue> {
  groups: GroupedInputFolder<TRow>[];
  /** Indentation of this level. Recurses at `depth + 1`. */
  depth?: number;
  /** Namespaces React keys so two trees in one panel cannot collide. */
  keyPrefix: string;
  isFolderExpanded: (folderId: string) => boolean;
  onToggleFolder: (folderId: string) => void;
  isRowSelected: (row: TRow) => boolean;
  onSelectRow: (row: TRow) => void;
  onValueChange: (inputId: string, value: number) => void;
  isRowLocked?: (row: TRow) => boolean;
  /**
   * Trailing controls for a row. **This is the whole reason the component is
   * shaped as a render prop** — see the docblock.
   */
  renderRowActions?: (row: TRow) => ReactNode;
  /** Row key suffix. Defaults to `inputId`, which is unique in most trees. */
  rowKey?: (row: TRow) => string;
}

/**
 * A tree of collapsible folders whose leaves are numeric control rows.
 *
 * Extracted from two ~100-line copies in `VariablesPanel`
 * (`renderProceduralAvailableGroups` and `renderAnimationAvailableGroups`).
 *
 * ## What is actually shared, and what is not
 *
 * An earlier audit described these as "~100 identical lines, differing in the
 * expansion-state set and the actions fragment". Diffing them says otherwise: the
 * **per-row derived data** differs completely too. The procedural copy computes a
 * rig input path and motion-graph eligibility (`canAddInput`/`canAddOutput`); the
 * animation copy looks up a standard input, parses a pose-weight source id and
 * resolves a pose. Neither computation means anything to the other.
 *
 * So this component owns only what genuinely repeated: the recursive folder
 * scaffold, the expansion rule, and the common `ControlRow` wiring. Everything
 * per-row that differs — the derivation *and* the buttons it feeds — stays at the
 * call site inside `renderRowActions`. Trying to unify the derivations behind a
 * flag would have produced a component that knows about motion-graph eligibility
 * and pose weights, which is precisely the coupling `editor/` exists to avoid.
 *
 * ## Why the search override is not in here
 *
 * Both copies force every folder open while a search filter is active
 * (`filteredSearch.length > 0 || expandedIds.has(id)`). That is one line, but it
 * belongs to the caller's search state, so `isFolderExpanded` is a predicate
 * rather than a `Set` plus a `searchActive` flag. The component never learns that
 * searching is a concept.
 */
export function GroupedInputTree<TRow extends ControlRowValue>({
  groups,
  depth = 0,
  keyPrefix,
  isFolderExpanded,
  onToggleFolder,
  isRowSelected,
  onSelectRow,
  onValueChange,
  isRowLocked,
  renderRowActions,
  rowKey,
}: GroupedInputTreeProps<TRow>) {
  return (
    <>
      {groups.map((group) => {
        const expanded = isFolderExpanded(group.id);
        const hasChildren = group.children.length > 0 || group.rows.length > 0;
        return (
          <TreeRow
            key={`${keyPrefix}-folder:${group.id}`}
            depth={depth}
            label={group.label}
            hasChildren={hasChildren}
            isExpanded={expanded}
            onToggle={() => onToggleFolder(group.id)}
            icon={<Folder size={12} className="text-text-muted" />}
          >
            {expanded ? (
              <>
                {group.children.length > 0 ? (
                  <GroupedInputTree
                    groups={group.children}
                    depth={depth + 1}
                    keyPrefix={keyPrefix}
                    isFolderExpanded={isFolderExpanded}
                    onToggleFolder={onToggleFolder}
                    isRowSelected={isRowSelected}
                    onSelectRow={onSelectRow}
                    onValueChange={onValueChange}
                    isRowLocked={isRowLocked}
                    renderRowActions={renderRowActions}
                    rowKey={rowKey}
                  />
                ) : null}
                {group.rows.length > 0 ? (
                  <div className="flex flex-col gap-1.5 pt-1">
                    {group.rows.map((row) => (
                      <ControlRow
                        key={`${keyPrefix}:${rowKey ? rowKey(row) : row.inputId}`}
                        row={row}
                        selected={isRowSelected(row)}
                        depth={depth + 1}
                        locked={isRowLocked ? isRowLocked(row) : false}
                        onSelect={() => onSelectRow(row)}
                        onValueChange={onValueChange}
                        actions={
                          renderRowActions ? (
                            <div className="flex items-center gap-1">
                              {renderRowActions(row)}
                            </div>
                          ) : undefined
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </TreeRow>
        );
      })}
    </>
  );
}
