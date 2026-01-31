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
import { cn } from "../../utils/cn";

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
    <div className="flex flex-col gap-6">
      <div className="bg-slate-900/40 border border-white/5 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Export target</p>
            <strong className="text-sm text-slate-200">
              {rigKind === "generic" ? "Generic rig" : "Face-specific rig"}
            </strong>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[10px] text-slate-500 font-medium">Path prefix:</span>
              <code className="text-[10px] bg-slate-950/40 px-1.5 py-0.5 rounded border border-white/5 text-blue-400">
                rig/{faceSegmentLabel}/[group]/[pose].weight
              </code>
            </div>
          </div>
        </div>
        <div className="h-px bg-white/5" />
        <FieldRow
          label="Blend mode"
          hint="Average keeps non-participating poses from diluting channels; additive sums weighted deltas."
          control={
            <div className="inline-flex bg-slate-950/40 p-1 rounded-lg border border-white/5">
              <Button
                size="sm"
                variant={blendMode === "average" ? "primary" : "subtle"}
                onClick={() => setBlendMode("average")}
                className="h-7 px-3 text-[11px]"
              >
                Average
              </Button>
              <Button
                size="sm"
                variant={blendMode === "additive" ? "primary" : "subtle"}
                onClick={() => setBlendMode("additive")}
                className="h-7 px-3 text-[11px]"
              >
                Additive
              </Button>
            </div>
          }
        />
      </div>
      <div className="flex justify-end">
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
          variant="secondary"
          size="sm"
          className="h-8"
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

      <div className="space-y-3">
        <FieldRow
          label="Rig kind"
          hint="Generic exports without a face segment; face-specific uses the current faceId."
          control={
            <span className="bg-slate-900 px-2 py-1 rounded-md text-[11px] font-bold text-slate-300 border border-white/5">
              {rigKind === "generic" ? "Generic (standard)" : "Face-specific"}
            </span>
          }
        />
        {standardInputSchema ? (
          <FieldRow
            label="Standard input schema"
            hint="Version used for coverage and exports"
            control={
              <span className="bg-slate-900 px-2 py-1 rounded-md text-[11px] font-bold text-slate-400 border border-white/5 opacity-80">
                {standardInputSchema.id} · {standardInputSchema.version}
              </span>
            }
          />
        ) : null}
      </div>

      {poseGroups.length === 0 ? (
        <p className="text-center py-12 text-slate-500 text-sm italic bg-slate-900/20 rounded-xl border border-dashed border-white/5">
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
              <div className="flex items-center gap-2">
                <Button
                  variant="subtle"
                  onClick={() => handleRenameGroup(group)}
                  size="sm"
                  className="h-8"
                >
                  Rename
                </Button>
                <Button
                  variant="primary"
                  onClick={() => handleExportGroup(group)}
                  size="sm"
                  className="h-8"
                >
                  Export Group
                </Button>
              </div>
            );
            return (
              <div className="mt-4 flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                <header className="flex justify-between items-start p-4 bg-slate-900/40 rounded-xl border border-white/5 mb-1">
                  <div>
                    <h4 className="text-sm font-bold text-slate-200">{group.label}</h4>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium">{subtitle}</p>
                  </div>
                  {actions}
                </header>
                <div className="p-4 bg-slate-900/20 rounded-xl border border-white/5">
                  <ul className="flex flex-wrap gap-2 mb-4">
                    {group.poses.map((pose) => (
                      <li key={pose.id} className="text-[10px] font-bold text-slate-300 bg-slate-950/40 px-2 py-1 rounded border border-white/5">
                        {pose.name}
                      </li>
                    ))}
                  </ul>
                  {preview.length > 0 ? (
                    <div className="bg-slate-950/40 p-3 rounded-lg border border-white/5">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">
                        Sample paths ({preview.length} of {group.poses.length})
                      </span>
                      <ul className="space-y-1.5">
                        {preview.map((entry) => (
                          <li key={entry.id} className="text-[11px] flex items-center gap-2 overflow-hidden">
                            <span className="font-bold text-slate-300 shrink-0">{entry.name}</span>
                            <span className="text-slate-600 shrink-0">→</span>
                            <code className="text-blue-400 bg-blue-500/5 px-1 rounded truncate">{entry.path || "rig/..."}</code>
                          </li>
                        ))}
                        {group.poses.length > preview.length ? (
                          <li className="text-[10px] text-slate-600 italic mt-2">
                            ...{group.poses.length - preview.length} additional
                            poses
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div className="p-4 bg-slate-900/40 rounded-xl border border-white/5">
                  <FieldRow
                    label="Include in export"
                    control={
                      <Switch
                        size="sm"
                        checked={group.label !== "Ungrouped"}
                        onChange={(checked) =>
                          onUpdatePoseGroupBatch(
                            group.poses.map((pose) => pose.id),
                            checked ? group.label : null,
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
