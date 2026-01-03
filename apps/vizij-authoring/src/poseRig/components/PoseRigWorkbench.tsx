import { useEffect, useMemo, useState } from "react";
import type { StandardRigInput } from "@vizij/utils";
import { buildPoseWeightPathMap } from "../utils";
import { formatRigPathLabel } from "../../utils/rigPaths";
import { usePoseRig } from "../../state/PoseRigProvider";
import { useGraphRuntime } from "../../state/RigControllerProvider";
import { Button, Tabs, Input } from "../../components/ui";
import "./pose-rig-kind.css";
import { SceneRiggingSection } from "../../components/scene-composer/SceneRiggingSection";
import { PoseGroupExportPanel } from "./PoseGroupExportPanel";
import { PoseList } from "./PoseList";
import { PoseEditor } from "./PoseEditor";
import { NeutralEditor } from "./NeutralEditor";

const LIVE_EPSILON = 1e-6;

interface PoseRigWorkbenchProps {
  onImportPoseGraph: (file: File) => Promise<void>;
}

function sortInputs(inputs: StandardRigInput[]): StandardRigInput[] {
  return inputs.slice().sort((a, b) => a.label.localeCompare(b.label));
}

export function PoseRigWorkbench({ onImportPoseGraph }: PoseRigWorkbenchProps) {
  const state = usePoseRig();
  const faceId = useGraphRuntime((runtime) => runtime.faceId);
  const [activeTab, setActiveTab] = useState<"create" | "edit" | "import">(
    "create",
  );

  const selectedPose = useMemo(
    () => state.poses.find((p) => p.id === state.selectedPoseId) ?? null,
    [state.poses, state.selectedPoseId],
  );

  const isNeutralSelected =
    state.selectedPoseId === "__pose_rig_neutral__" ||
    state.selectedPoseId === null;

  const [batchSelection, setBatchSelection] = useState<Set<string>>(new Set());
  const [captureName, setCaptureName] = useState("");

  const sortedInputs = sortInputs(state.standardInputs);
  const neutralValues = state.neutralInputs;
  const currentValues = state.currentValues;

  const posePathLabels = useMemo(() => {
    if (state.poses.length === 0) {
      return new Map<string, string>();
    }
    const infoMap = buildPoseWeightPathMap(state.poses, faceId ?? null);
    const map = new Map<string, string>();
    state.poses.forEach((pose) => {
      const info = infoMap.get(pose.id);
      if (info) {
        map.set(pose.id, formatRigPathLabel(info.relativePath, faceId));
      }
    });
    return map;
  }, [faceId, state.poses]);

  useEffect(() => {
    setBatchSelection((current) => {
      if (current.size === 0) {
        return current;
      }
      const validIds = new Set(state.poses.map((pose) => pose.id));
      let changed = false;
      const next = new Set<string>();
      current.forEach((id) => {
        if (validIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [state.poses]);

  if (!state.ready) {
    return (
      <section className="pose-rig-workbench pose-rig-workbench--disabled">
        <header className="pose-rig-workbench__header">
          <div>
            <h2>Pose Rig Workbench</h2>
            <p>
              Load a Vizij asset and configure standard inputs to enable pose
              authoring.
            </p>
          </div>
        </header>
      </section>
    );
  }

  const handlePoseRename = (name: string) => {
    if (!selectedPose) {
      return;
    }
    state.updatePoseName(selectedPose.id, name);
  };

  const handlePoseCapture = () => {
    if (!selectedPose) {
      return;
    }
    state.capturePose(selectedPose.id);
  };

  const handlePoseClear = () => {
    if (!selectedPose) {
      return;
    }
    state.clearPose(selectedPose.id);
  };

  const handlePoseRemoveInput = (inputId: string) => {
    if (!selectedPose) {
      return;
    }
    state.removePoseInput(selectedPose.id, inputId);
  };

  const handlePoseAddInput = (inputId: string) => {
    if (!selectedPose) {
      return;
    }
    state.addPoseInput(selectedPose.id, inputId);
  };

  const hasLiveAdjustments =
    !!selectedPose &&
    Object.keys(selectedPose.values).some((inputId) => {
      const saved = selectedPose.values[inputId] ?? neutralValues[inputId] ?? 0;
      const live = currentValues[inputId] ?? neutralValues[inputId] ?? saved;
      return Math.abs(saved - live) > LIVE_EPSILON;
    });

  const handleToggleBatchSelect = (poseId: string) => {
    setBatchSelection((current) => {
      const next = new Set(current);
      if (next.has(poseId)) {
        next.delete(poseId);
      } else {
        next.add(poseId);
      }
      return next;
    });
  };

  const handleSelectNeutral = () => state.selectNeutral();
  const handleSelectPose = (poseId: string) => {
    state.selectPose(poseId);
    state.applyPose(poseId);
  };

  const handleUpdateCurrentValue = (inputId: string, value: number) => {
    state.updateCurrentValue(inputId, value);
  };

  const handleUpdatePoseGroup = (
    poseId: string,
    group: string | null | undefined,
  ) => {
    state.updatePoseGroup(poseId, group ?? null);
  };

  const handleCaptureNewPose = () => {
    const trimmed = captureName.trim();
    const name =
      trimmed.length > 0 ? trimmed : `Pose ${state.poses.length + 1}`;
    state.createPoseFromSnapshot(name);
    setCaptureName("");
  };

  return (
    <section className="pose-rig-workbench">
      <header className="pose-rig-workbench__header">
        <div>
          <h2>Pose Rig Workbench</h2>
          <p>Overwrite values, build poses, and tweak graph contributions.</p>
        </div>
      </header>
      <Tabs
        items={[
          { id: "create", label: "Creating" },
          { id: "edit", label: "Editing" },
          { id: "import", label: "Import/Export" },
        ]}
        value={activeTab}
        onValueChange={(id) => setActiveTab(id as "create" | "edit" | "import")}
        renderPanel={(tabId) => {
          if (tabId === "edit") {
            return (
              <div className="pose-rig-workbench__body">
                <PoseList
                  poses={state.poses}
                  selectedPoseId={state.selectedPoseId}
                  isNeutralSelected={isNeutralSelected}
                  onSelectNeutral={handleSelectNeutral}
                  onApplyPose={handleSelectPose}
                  onPoseNameChange={state.updatePoseName}
                  onDuplicatePose={state.duplicatePose}
                  onDeletePose={state.deletePose}
                  posePathLabels={posePathLabels}
                  onBatchToggleSelect={handleToggleBatchSelect}
                  batchSelectedIds={batchSelection}
                  onSelectPose={handleSelectPose}
                />
                {isNeutralSelected ? (
                  <NeutralEditor
                    inputs={sortedInputs}
                    values={currentValues}
                    onValueChange={handleUpdateCurrentValue}
                  />
                ) : (
                  <PoseEditor
                    pose={selectedPose}
                    inputs={sortedInputs}
                    faceId={faceId}
                    neutralValues={neutralValues}
                    currentValues={currentValues}
                    onRename={handlePoseRename}
                    onGroupChange={handleUpdatePoseGroup}
                    onCapture={handlePoseCapture}
                    onApply={() => state.applyPose(selectedPose?.id ?? "")}
                    onClear={handlePoseClear}
                    onLiveValueChange={handleUpdateCurrentValue}
                    onRemoveInput={handlePoseRemoveInput}
                    onAddInput={handlePoseAddInput}
                    hasLiveAdjustments={hasLiveAdjustments}
                  />
                )}
              </div>
            );
          }

          if (tabId === "import") {
            return (
              <div className="pose-rig-workbench__body">
                <PoseGroupExportPanel
                  poses={state.poses}
                  faceId={faceId}
                  neutralInputs={state.neutralInputs}
                  standardInputs={state.standardInputs}
                  rigKind={state.rigKind}
                  standardInputSchema={undefined}
                  onImportPoseGraph={onImportPoseGraph}
                  importDisabled={!state.ready}
                  onUpdatePoseGroupBatch={(ids, group) =>
                    state.updatePoseGroupBatch(ids, group ?? null)
                  }
                />
              </div>
            );
          }

          return (
            <div className="pose-rig-workbench__body">
              <div className="pose-rig-create">
                <div className="pose-rig-create__save">
                  <label className="field-label" htmlFor="pose-capture-name">
                    Save current pose as
                  </label>
                  <div className="pose-rig-create__row">
                    <Input
                      id="pose-capture-name"
                      type="text"
                      placeholder="Pose name"
                      value={captureName}
                      onChange={(event) => setCaptureName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleCaptureNewPose();
                        }
                      }}
                    />
                    <Button variant="primary" onClick={handleCaptureNewPose}>
                      Save Pose
                    </Button>
                  </div>
                </div>
              </div>

              <SceneRiggingSection
                showCoverage={false}
                allowEditActions={false}
                showMaterials={false}
                showDrivers
                showBindings={false}
                showFeatures={false}
                hiddenMode="omit"
                showHideControls={false}
                allowCreateDrivers={false}
              />
            </div>
          );
        }}
      />
    </section>
  );
}
