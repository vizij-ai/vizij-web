import { useMemo, useState } from "react";
import type { PoseDefinition } from "../types";
import { slugifyLabel } from "../utils";
import { Button, Input, CollapsibleRow, Tabs } from "../../components/ui";

interface PoseListProps {
  poses: PoseDefinition[];
  selectedPoseId: string | null;
  isNeutralSelected: boolean;
  disabled?: boolean;
  posePathLabels?: Map<string, string>;
  onSelectNeutral: () => void;
  onApplyPose: (poseId: string) => void;
  onPoseNameChange: (poseId: string, name: string) => void;
  onDuplicatePose: (poseId: string) => void;
  onDeletePose: (poseId: string) => void;
  batchSelectedIds?: Set<string>;
  onBatchToggleSelect?: (poseId: string) => void;
  onSelectPose?: (poseId: string) => void;
}

export function PoseList({
  poses,
  selectedPoseId,
  isNeutralSelected,
  disabled,
  posePathLabels,
  onSelectNeutral,
  onApplyPose,
  onPoseNameChange,
  onDuplicatePose,
  onDeletePose,
  batchSelectedIds = new Set(),
  onBatchToggleSelect,
  onSelectPose,
}: PoseListProps) {
  const [activeGroupTab, setActiveGroupTab] = useState<string>("neutral");

  const sorted = useMemo(() => {
    return poses.slice().sort((a, b) => {
      const aTime = Date.parse(a.updatedAt ?? a.createdAt ?? "");
      const bTime = Date.parse(b.updatedAt ?? b.createdAt ?? "");
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return a.name.localeCompare(b.name);
      }
      return bTime - aTime;
    });
  }, [poses]);

  const grouped = useMemo(() => {
    const entries = new Map<
      string,
      { key: string; label: string; poses: PoseDefinition[] }
    >();
    sorted.forEach((pose) => {
      const trimmed = pose.group?.trim();
      const label = trimmed && trimmed.length > 0 ? trimmed : "Ungrouped";
      const slug = slugifyLabel(trimmed, "ungrouped");
      const key = `${slug}::${label.toLowerCase()}`;
      const existing = entries.get(key);
      if (existing) {
        existing.poses.push(pose);
      } else {
        entries.set(key, { key, label, poses: [pose] });
      }
    });
    return Array.from(entries.values()).sort((a, b) => {
      if (a.label === "Ungrouped") {
        return 1;
      }
      if (b.label === "Ungrouped") {
        return -1;
      }
      return a.label.localeCompare(b.label, undefined, {
        sensitivity: "base",
      });
    });
  }, [sorted]);

  const listHint =
    sorted.length === 0
      ? "Capture or add a pose to begin building the library."
      : null;

  const tabs = [
    { id: "neutral", label: "Neutral", badge: null },
    ...grouped.map((group) => ({
      id: group.key,
      label: group.label,
      badge: group.poses.length,
    })),
  ];

  return (
    <div className="pose-rig-panel pose-rig-panel--list">
      <div className="pose-rig-list">
        <Tabs
          items={tabs}
          value={activeGroupTab}
          onValueChange={(id) => setActiveGroupTab(id)}
          size="sm"
          variant="pill"
          renderPanel={(tabId) => {
            if (tabId === "neutral") {
              return (
                <CollapsibleRow
                  id="pose-neutral"
                  title="Neutral Pose"
                  subtitle="Baseline rig"
                  className={
                    isNeutralSelected
                      ? "pose-rig-list__item pose-rig-list__item--active"
                      : "pose-rig-list__item"
                  }
                  actions={
                    <Button
                      variant="primary"
                      onClick={onSelectNeutral}
                      disabled={disabled}
                      pill
                      size="sm"
                    >
                      {isNeutralSelected ? "Active" : "Edit"}
                    </Button>
                  }
                  expandedContent={
                    <div className="pose-rig-list__neutral-actions">
                      <Button
                        variant="subtle"
                        onClick={onSelectNeutral}
                        disabled={disabled}
                      >
                        Go to Neutral Controls
                      </Button>
                    </div>
                  }
                  defaultExpanded={isNeutralSelected}
                  showSlider={false}
                />
              );
            }

            const group = grouped.find((g) => g.key === tabId);
            if (!group) {
              return <p className="pose-rig-empty">No poses in this group.</p>;
            }

            return (
              <div className="pose-rig-list__group-body">
                {group.poses.map((pose) => {
                  const isSelected = selectedPoseId === pose.id;
                  const pathLabel =
                    posePathLabels?.get(pose.id) ?? "No stored rig path";
                  const updatedLabel = pose.updatedAt
                    ? new Date(pose.updatedAt).toLocaleString()
                    : pose.createdAt
                      ? new Date(pose.createdAt).toLocaleString()
                      : "Unknown";
                  const isBatchSelected = batchSelectedIds.has(pose.id);

                  const actions = (
                    <div className="pose-rig-list__actions">
                      <Button
                        variant="subtle"
                        className="collapsible-row__icon-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectPose?.(pose.id);
                          onApplyPose(pose.id);
                        }}
                        disabled={disabled}
                        aria-label={`Play ${pose.name}`}
                        title="Play pose"
                      >
                        View Pose
                      </Button>
                      <Button
                        variant="subtle"
                        className="collapsible-row__icon-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDuplicatePose(pose.id);
                        }}
                        disabled={disabled}
                        aria-label={`Duplicate ${pose.name}`}
                        title="Duplicate pose"
                      >
                        Duplicate
                      </Button>
                      <Button
                        variant="danger"
                        className="collapsible-row__icon-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeletePose(pose.id);
                        }}
                        disabled={disabled}
                        aria-label={`Remove ${pose.name}`}
                        title="Remove pose"
                      >
                        Remove
                      </Button>
                      {onBatchToggleSelect ? (
                        <label className="pose-rig-list__batch-checkbox pose-rig-list__batch-checkbox--inline">
                          <Input
                            type="checkbox"
                            aria-label={`Select ${pose.name} for batch actions`}
                            checked={isBatchSelected}
                            disabled={disabled}
                            onChange={(event) => {
                              event.stopPropagation();
                              onBatchToggleSelect(pose.id);
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                  );

                  return (
                    <CollapsibleRow
                      id={pose.id}
                      key={pose.id}
                      title={pose.name}
                      subtitle={pathLabel}
                      actions={actions}
                      className={
                        isSelected
                          ? "pose-rig-list__item pose-rig-list__item--active"
                          : "pose-rig-list__item"
                      }
                      expandedContent={
                        <div className="pose-rig-list__expanded-row">
                          <Input
                            type="text"
                            className="pose-rig-list__name-input"
                            value={pose.name}
                            disabled={disabled}
                            onChange={(event) =>
                              onPoseNameChange(pose.id, event.target.value)
                            }
                          />
                          <span className="pose-rig-list__meta pose-rig-list__meta--timestamp">
                            Updated {updatedLabel}
                          </span>
                        </div>
                      }
                      defaultExpanded={isSelected}
                      showSlider={false}
                    />
                  );
                })}
              </div>
            );
          }}
        />
        {listHint && <p className="pose-rig-empty">{listHint}</p>}
      </div>
    </div>
  );
}
