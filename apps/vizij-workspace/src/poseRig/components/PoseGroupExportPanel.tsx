import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { StandardRigInput } from "@vizij/utils";
import { buildPoseGraphSpec } from "../graphBuilder";
import type { PoseDefinition, StandardInputId } from "../types";
import { buildPoseWeightPathMap, slugifyLabel } from "../utils";
import { alertDialog, promptDialog } from "../../utils/dialogs";
import { downloadBlob } from "../../utils/download";
import { InstructionCallout } from "../../components/common/InstructionCallout";
import { Button, Switch, FieldRow, Tabs } from "../../components/ui";
import "./pose-group-export.css";

interface PoseGroupExportPanelProps {
  poses: PoseDefinition[];
  faceId?: string | null;
  neutralInputs: Record<StandardInputId, number>;
  standardInputs: StandardRigInput[];
  rigKind: "generic" | "face-specific";
  standardInputSchema?: { id: string; version: string };
  onImportPoseGraph: (file: File) => Promise<void>;
  importDisabled?: boolean;
  onUpdatePoseGroupBatch: (
    poseIds: Iterable<string>,
    group: string | null | undefined,
  ) => void;
}

interface PoseGroupDescriptor {
  key: string;
  label: string;
  slug: string;
  poses: PoseDefinition[];
}

export function PoseGroupExportPanel({
  poses,
  faceId,
  neutralInputs,
  standardInputs,
  rigKind,
  standardInputSchema,
  onImportPoseGraph,
  importDisabled,
  onUpdatePoseGroupBatch,
}: PoseGroupExportPanelProps) {
  const [activeGroupTab, setActiveGroupTab] = useState<string>("none");
  const [isImportingGraph, setIsImportingGraph] = useState(false);
  const [blendMode, setBlendMode] = useState<"average" | "additive">("average");
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const poseGroups = useMemo<PoseGroupDescriptor[]>(() => {
    const map = new Map<string, PoseGroupDescriptor>();
    poses.forEach((pose) => {
      const trimmed = pose.group?.trim();
      const label = trimmed && trimmed.length > 0 ? trimmed : "Ungrouped";
      const slug = slugifyLabel(trimmed, "poses");
      const key = `${slug}::${label.toLowerCase()}`;
      const entry = map.get(key);
      if (entry) {
        entry.poses.push(pose);
      } else {
        map.set(key, { key, label, slug, poses: [pose] });
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.label === "Ungrouped") {
        return 1;
      }
      if (b.label === "Ungrouped") {
        return -1;
      }
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });
  }, [poses]);

  const faceSegmentLabel =
    rigKind === "generic"
      ? "standard"
      : faceId && faceId.trim().length > 0
        ? faceId.trim()
        : "face";
  const fileFaceSlug = useMemo(
    () => slugifyLabel(rigKind === "generic" ? "standard" : faceId, "face"),
    [faceId, rigKind],
  );

  const previewLookup = useMemo(() => {
    const previews = new Map<
      string,
      Array<{ id: string; name: string; path: string }>
    >();
    poseGroups.forEach((group) => {
      if (!group.poses.length) {
        previews.set(group.key, []);
        return;
      }
      const pathMap = buildPoseWeightPathMap(group.poses, faceId ?? null);
      const sample = group.poses.slice(0, 3).map((pose) => ({
        id: pose.id,
        name: pose.name,
        path: pathMap.get(pose.id)?.absolutePath ?? "",
      }));
      previews.set(group.key, sample);
    });
    return previews;
  }, [faceId, poseGroups]);

  useEffect(() => {
    if (poseGroups.length === 0) {
      setActiveGroupTab("none");
    } else if (!poseGroups.some((g) => g.key === activeGroupTab)) {
      setActiveGroupTab(poseGroups[0].key);
    }
  }, [activeGroupTab, poseGroups]);

  const workflowSteps = [
    "Assign each pose to a group in the Pose Editor to define rig path prefixes.",
    "Use the grouped library to collapse/expand clusters while you curate poses.",
    "Export a driver graph per group below; we automatically include the group segment in each path.",
    "Need to reuse an existing rig graph? Click Import Pose Graph to bring it into this workspace and remap it to the current face.",
  ];

  const triggerImport = () => {
    if (importDisabled || isImportingGraph) {
      return;
    }
    importInputRef.current?.click();
  };

  const handleImportChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (importDisabled || isImportingGraph) {
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    try {
      setIsImportingGraph(true);
      await onImportPoseGraph(file);
    } finally {
      setIsImportingGraph(false);
    }
  };

  const handleRenameGroup = (group: PoseGroupDescriptor) => {
    const defaultValue = group.label === "Ungrouped" ? "" : group.label;
    const result = promptDialog(
      `Rename "${group.label}" group (leave blank for Ungrouped)`,
      defaultValue,
    );
    if (result === null) {
      return;
    }
    const trimmed = result.trim();
    const poseIds = group.poses.map((pose) => pose.id);
    onUpdatePoseGroupBatch(poseIds, trimmed.length > 0 ? trimmed : null);
  };

  const handleExportGroup = (group: PoseGroupDescriptor) => {
    if (!group.poses.length) {
      alertDialog("Add at least one pose to the group before exporting.");
      return;
    }
    if (!standardInputs.length) {
      alertDialog("Configure standard inputs before exporting a pose graph.");
      return;
    }
    const { spec } = buildPoseGraphSpec({
      faceId: faceSegmentLabel,
      neutralInputs,
      poses: group.poses,
      standardInputs,
      blendMode,
      rigKind,
    });
    const exportFileName = `${fileFaceSlug}-${group.slug}.pose.${rigKind}.graph.json`;
    const blob = new Blob([JSON.stringify(spec, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, exportFileName);
  };

  return (
    <div className="pose-rig-panel pose-group-export">
      <div className="pose-group-export__summary">
        <div>
          <p className="pose-group-export__eyebrow">Export target</p>
          <strong>
            {rigKind === "generic" ? "Generic rig" : "Face-specific rig"}
          </strong>
          <div className="pose-group-export__path-hint">
            Paths:{" "}
            <code>
              rig/{faceSegmentLabel}/&lt;group&gt;/&lt;pose&gt;.weight
            </code>
          </div>
        </div>
        <FieldRow
          label="Blend mode"
          hint="Average keeps non-participating poses from diluting channels; additive sums weighted deltas."
          control={
            <div className="button-group button-group--segmented">
              <Button
                size="sm"
                variant={blendMode === "average" ? "primary" : "subtle"}
                onClick={() => setBlendMode("average")}
              >
                Average
              </Button>
              <Button
                size="sm"
                variant={blendMode === "additive" ? "primary" : "subtle"}
                onClick={() => setBlendMode("additive")}
              >
                Additive
              </Button>
            </div>
          }
        />
      </div>
      <div className="pose-group-export__group-actions">
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.graph.json"
          hidden
          onChange={handleImportChange}
        />
        <Button
          onClick={triggerImport}
          disabled={importDisabled || isImportingGraph}
          pill
          size="sm"
        >
          {isImportingGraph ? "Importing…" : "Import Pose Graph"}
        </Button>
      </div>
      <InstructionCallout
        label="Pose group workflow steps"
        summary="Tag poses, curate groups, export driver graphs"
      >
        <ol>
          {workflowSteps.map((step, index) => (
            <li key={step}>
              <strong>Step {index + 1}.</strong> {step}
            </li>
          ))}
        </ol>
      </InstructionCallout>

      <FieldRow
        label="Rig kind"
        hint="Generic exports without a face segment; face-specific uses the current faceId."
        control={
          <span className="pose-group-export__badge">
            {rigKind === "generic" ? "Generic (standard)" : "Face-specific"}
          </span>
        }
      />
      {standardInputSchema ? (
        <FieldRow
          label="Standard input schema"
          hint="Version used for coverage and exports"
          control={
            <span className="pose-group-export__schema">
              {standardInputSchema.id} · {standardInputSchema.version}
            </span>
          }
        />
      ) : null}

      {poseGroups.length === 0 ? (
        <p className="pose-group-export__empty">
          Capture or tag a pose to enable group exports.
        </p>
      ) : (
        <Tabs
          items={poseGroups.map((group) => ({
            id: group.key,
            label: group.label,
            badge: group.poses.length,
          }))}
          value={activeGroupTab}
          onValueChange={(id) => setActiveGroupTab(id)}
          renderPanel={(tabId) => {
            const group = poseGroups.find((g) => g.key === tabId);
            if (!group) {
              return (
                <p className="pose-group-export__empty">
                  Capture or tag a pose to enable group exports.
                </p>
              );
            }
            const preview = previewLookup.get(group.key) ?? [];
            const subtitle = (
              <>
                {group.poses.length} pose
                {group.poses.length === 1 ? "" : "s"} · Paths start at
                <code>{` rig/${faceSegmentLabel}/${group.slug}/`}</code>
              </>
            );
            const actions = (
              <div className="pose-group-export__group-actions">
                <Button
                  variant="subtle"
                  onClick={() => handleRenameGroup(group)}
                  size="sm"
                >
                  Rename
                </Button>
                <Button
                  variant="primary"
                  onClick={() => handleExportGroup(group)}
                  size="sm"
                >
                  Export Group
                </Button>
              </div>
            );
            return (
              <div className="pose-group-export__group-tab">
                <header className="pose-group-export__group-header">
                  <div>
                    <h4>{group.label}</h4>
                    <p className="pose-group-export__subtitle">{subtitle}</p>
                  </div>
                  {actions}
                </header>
                <div className="pose-group-export__group-body">
                  <ul className="pose-group-export__poses">
                    {group.poses.map((pose) => (
                      <li key={pose.id}>
                        <strong>{pose.name}</strong>
                      </li>
                    ))}
                  </ul>
                  {preview.length > 0 ? (
                    <div className="pose-group-export__preview">
                      <span className="pose-group-export__preview-label">
                        Sample paths ({preview.length} of {group.poses.length})
                      </span>
                      <ul>
                        {preview.map((entry) => (
                          <li key={entry.id}>
                            <strong>{entry.name}</strong> →
                            <code>{entry.path || "rig/..."}</code>
                          </li>
                        ))}
                        {group.poses.length > preview.length ? (
                          <li className="pose-group-export__preview-more">
                            ...{group.poses.length - preview.length} additional
                            poses
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div className="pose-group-export__group-actions">
                  <FieldRow
                    label="Include in export"
                    control={
                      <Switch
                        size="sm"
                        checked={group.label !== "Ungrouped"}
                        onChange={(event) =>
                          onUpdatePoseGroupBatch(
                            group.poses.map((pose) => pose.id),
                            event.target.checked ? group.label : null,
                          )
                        }
                      />
                    }
                  />
                </div>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
