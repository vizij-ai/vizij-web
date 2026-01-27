import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import type { StandardRigInput } from "@vizij/utils";
import type { PoseDefinition, StandardInputId } from "../types";
import { FilterableSelect } from "../../components/common/FilterableSelect";
import { formatRigPathLabel } from "../../utils/rigPaths";
import { slugifyLabel } from "../utils";
import {
  Button,
  CollapsibleGroup,
  CollapsibleRow,
  Input,
} from "../../components/ui";

interface PoseEditorProps {
  pose: PoseDefinition | null;
  neutralValues: Record<StandardInputId, number>;
  currentValues: Record<StandardInputId, number>;
  inputs: StandardRigInput[];
  faceId?: string | null;
  disabled?: boolean;
  onRename: (name: string) => void;
  onCapture: () => void;
  onApply: () => void;
  onClear: () => void;
  onGroupChange: (poseId: string, group: string | null | undefined) => void;
  onLiveValueChange: (inputId: string, value: number) => void;
  onRemoveInput: (inputId: string) => void;
  onAddInput: (inputId: string) => void;
  hasLiveAdjustments?: boolean;
}

const LIVE_EPSILON = 1e-6;

function formatGroupName(group: string | null | undefined): string {
  const segments = (group ?? "")
    .split("/")
    .map((segment) =>
      segment
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase()),
    )
    .filter(Boolean);
  if (segments.length === 0) {
    return "Root";
  }
  return segments.join(" / ");
}

function resolveRange(input: StandardRigInput): { min: number; max: number } {
  const defaultValue = input.defaultValue ?? 0;
  const min = Number.isFinite(input.range.min)
    ? input.range.min
    : defaultValue - 1;
  const max = Number.isFinite(input.range.max)
    ? input.range.max
    : defaultValue + 1;
  if (min === max) {
    return { min: defaultValue - 1, max: defaultValue + 1 };
  }
  return { min, max };
}

function computeStep(input: StandardRigInput): number {
  const { min, max } = resolveRange(input);
  const span = Math.abs(max - min);
  if (!Number.isFinite(span) || span === 0) {
    return 0.01;
  }
  return span / 200;
}

export function PoseEditor({
  pose,
  neutralValues,
  currentValues,
  inputs,
  faceId,
  disabled,
  onRename,
  onCapture,
  onApply,
  onClear,
  onGroupChange,
  onLiveValueChange,
  onRemoveInput,
  onAddInput,
  hasLiveAdjustments,
}: PoseEditorProps) {
  const [pendingInput, setPendingInput] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState(pose?.group ?? "");

  useEffect(() => {
    if (!pose) {
      setGroupDraft("");
      return;
    }
    setGroupDraft(pose.group ?? "");
  }, [pose?.group, pose?.id]);

  const inputsById = useMemo(() => {
    return new Map(inputs.map((input) => [input.id, input]));
  }, [inputs]);

  const availableInputs = useMemo(() => {
    if (!pose) {
      return [];
    }
    return inputs.filter((input) => !(input.id in pose.values));
  }, [inputs, pose]);

  const availableInputOptions = useMemo(() => {
    return availableInputs.map((input) => ({
      value: input.id,
      label: input.label ?? input.path ?? input.id,
      keywords: [
        input.label ?? "",
        input.id,
        input.group ?? "",
        input.path ?? "",
      ].filter((entry) => entry.length > 0),
    }));
  }, [availableInputs]);

  const groupedEntries = useMemo(() => {
    if (!pose) {
      return new Map<string, Array<[StandardRigInput, number]>>();
    }
    const byGroup = new Map<string, Array<[StandardRigInput, number]>>();
    Object.entries(pose.values).forEach(([inputId, value]) => {
      const input = inputsById.get(inputId);
      if (!input) {
        return;
      }
      const key = input.group ?? "root";
      const list = byGroup.get(key) ?? [];
      list.push([input, value]);
      byGroup.set(key, list);
    });
    return byGroup;
  }, [inputsById, pose]);

  const handleAddInput = () => {
    if (!pendingInput) {
      return;
    }
    onAddInput(pendingInput);
    setPendingInput(null);
  };

  if (!pose) {
    return (
      <CollapsibleGroup
        key="pose-editor-empty"
        title="Pose Editor"
        subtitle="Select a pose to view stored values"
        className="pose-rig-panel pose-rig-panel--editor"
        defaultCollapsed
      >
        <div className="pose-rig-editor">
          <p className="pose-rig-empty">
            Select a saved pose to edit stored values.
          </p>
        </div>
      </CollapsibleGroup>
    );
  }

  const faceSegment = faceId?.trim()?.length ? faceId.trim() : "face";
  const groupSegment = slugifyLabel(pose.group, "poses");
  const poseSegment = slugifyLabel(pose.name, pose.id);
  const posePathPreview = `rig/${faceSegment}/${groupSegment}/${poseSegment}.weight`;

  const commitGroupDraft = () => {
    const trimmed = groupDraft.trim();
    const normalized = trimmed.length > 0 ? trimmed : "";
    const current = pose.group ?? "";
    if (normalized === current) {
      if (groupDraft !== current) {
        setGroupDraft(current);
      }
      return;
    }
    onGroupChange(pose.id, trimmed);
    setGroupDraft(normalized);
  };

  const resetGroupDraft = () => {
    setGroupDraft(pose.group ?? "");
  };

  const handleGroupKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitGroupDraft();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      resetGroupDraft();
      event.currentTarget.blur();
    }
  };

  return (
    <CollapsibleGroup
      key={`pose-editor-${pose.id}`}
      title="Pose Editor"
      subtitle="Overwrite from the live rig or tweak channels manually"
      className="pose-rig-panel pose-rig-panel--editor"
      defaultCollapsed={false}
    >
      <div className="pose-rig-editor pose-rig-editor--form">
        <label className="field-label" htmlFor="pose-rig-name">
          Name
        </label>
        <Input
          id="pose-rig-name"
          type="text"
          value={pose.name}
          disabled={disabled}
          onChange={(event) => onRename(event.target.value)}
        />

        <label className="field-label" htmlFor="pose-rig-group">
          Group
        </label>
        <Input
          id="pose-rig-group"
          type="text"
          placeholder="e.g. Emotions, Phonemes"
          value={groupDraft}
          disabled={disabled}
          onChange={(event) => setGroupDraft(event.target.value)}
          onBlur={commitGroupDraft}
          onKeyDown={handleGroupKeyDown}
        />
        <p className="pose-rig-group-hint">
          Paths will use <code>{posePathPreview}</code>
        </p>

        <div className="pose-rig-button-row">
          <Button
            variant="primary"
            className={
              hasLiveAdjustments ? "pose-rig-button--overwrite-active" : ""
            }
            onClick={onCapture}
            disabled={disabled}
          >
            Overwrite Saved Pose
          </Button>
          <Button variant="ghost" onClick={onApply} disabled={disabled}>
            Apply Pose
          </Button>
          <Button variant="subtle" onClick={onClear} disabled={disabled}>
            Clear Values
          </Button>
        </div>

        <div className="pose-rig-add-input">
          <FilterableSelect
            value={pendingInput}
            onChange={(nextValue) => setPendingInput(nextValue)}
            options={availableInputOptions}
            placeholder="Select rig input…"
            searchPlaceholder="Search inputs"
            noResultsLabel="No matches"
            disabled={disabled}
            className="pose-rig-input-select feature-tree__binding-slot-combobox"
            triggerClassName="feature-tree__property-select"
            menuClassName="feature-tree__binding-slot-menu"
            listClassName="feature-tree__binding-slot-option-list"
            filterInputClassName="feature-tree__binding-slot-filter"
            optionClassName="feature-tree__binding-slot-option"
            optionHighlightClassName="feature-tree__binding-slot-option--highlighted"
            emptyClassName="feature-tree__binding-slot-option feature-tree__binding-slot-option--empty"
            dataOptionAttribute="data-option"
          />
          <Button onClick={handleAddInput} disabled={disabled || !pendingInput}>
            Add
          </Button>
        </div>

        {hasLiveAdjustments && (
          <p className="pose-rig-live-hint">
            Live slider tweaks are applied immediately but not saved. Overwrite
            the pose to persist them.
          </p>
        )}

        {groupedEntries.size === 0 ? (
          <p className="pose-rig-empty">
            No overrides saved yet. Overwrite from the current pose or add
            inputs manually.
          </p>
        ) : (
          Array.from(groupedEntries.entries()).map(([group, entries]) => (
            <CollapsibleGroup
              key={group}
              title={formatGroupName(group)}
              itemCount={entries.length}
              className="pose-rig-input-group"
              actions={
                <Button
                  variant="danger"
                  className="collapsible-row__icon-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    entries.forEach(([input]) => onRemoveInput(input.id));
                  }}
                  disabled={disabled}
                  aria-label={`Remove inputs in ${formatGroupName(group)}`}
                  title="Remove all inputs in this group"
                >
                  ×
                </Button>
              }
            >
              <ul className="pose-rig-input-list">
                {entries.map(([input, value]) => {
                  const range = resolveRange(input);
                  const step = computeStep(input);
                  const neutral =
                    neutralValues[input.id] ?? input.defaultValue ?? 0;
                  const saved = value ?? neutral;
                  const liveValue = currentValues[input.id] ?? saved ?? neutral;
                  const isDirty = Math.abs(liveValue - saved) > LIVE_EPSILON;
                  const formattedPath = formatRigPathLabel(input.path, faceId);
                  const formatStat = (statValue: number) =>
                    Number.isFinite(statValue) ? statValue.toFixed(3) : "—";
                  const expandedContent = (
                    <div className="pose-rig-input-details">
                      <div className="pose-rig-input-stats">
                        <div>
                          <span className="pose-rig-input-stat-label">
                            Neutral
                          </span>
                          <span className="pose-rig-input-stat-value">
                            {formatStat(neutral)}
                          </span>
                        </div>
                        <div>
                          <span className="pose-rig-input-stat-label">
                            Saved
                          </span>
                          <span className="pose-rig-input-stat-value">
                            {formatStat(saved)}
                          </span>
                        </div>
                      </div>
                      <div className="pose-rig-input-range">
                        Range {formatStat(range.min)} – {formatStat(range.max)}
                      </div>
                    </div>
                  );
                  const actions = (
                    <Button
                      variant="subtle"
                      className="collapsible-row__icon-button"
                      onClick={() => onRemoveInput(input.id)}
                      disabled={disabled}
                      aria-label={`Remove ${input.label ?? input.id}`}
                      title="Remove input"
                    >
                      X
                    </Button>
                  );
                  return (
                    <li key={input.id} className="pose-rig-input-list__item">
                      <CollapsibleRow
                        id={input.id}
                        title={input.label ?? formattedPath ?? input.id}
                        subtitle={formattedPath}
                        value={liveValue}
                        min={range.min}
                        max={range.max}
                        step={step}
                        onValueChange={(next) =>
                          onLiveValueChange(input.id, next)
                        }
                        actions={actions}
                        expandedContent={expandedContent}
                        className={
                          isDirty
                            ? "pose-rig-input-row pose-rig-input-row--dirty"
                            : "pose-rig-input-row"
                        }
                        disabled={disabled}
                      />
                    </li>
                  );
                })}
              </ul>
            </CollapsibleGroup>
          ))
        )}
      </div>
    </CollapsibleGroup>
  );
}
