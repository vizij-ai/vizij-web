import type { StandardRigInput } from "@vizij/utils";
import { NeutralEditor } from "./NeutralEditor";
import { PoseEditor } from "./PoseEditor";
import { PoseList } from "./PoseList";
import type { UsePoseRigAuthoringResult } from "../usePoseRigAuthoring";

const LIVE_EPSILON = 1e-6;

interface PoseRigWorkbenchProps {
  state: UsePoseRigAuthoringResult;
}

function sortInputs(inputs: StandardRigInput[]): StandardRigInput[] {
  return inputs.slice().sort((a, b) => a.label.localeCompare(b.label));
}

export function PoseRigWorkbench({ state }: PoseRigWorkbenchProps) {
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

  const { selectedPose } = state;

  const sortedInputs = sortInputs(state.standardInputs);
  const neutralValues = state.neutralInputs;
  const currentValues = state.currentValues;

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

  return (
    <section className="pose-rig-workbench">
      <header className="pose-rig-workbench__header">
        <div>
          <h2>Pose Rig Workbench</h2>
          <p>Overwrite values, build poses, and tweak graph contributions.</p>
        </div>
        <div className="pose-rig-workbench__actions">
          <button
            type="button"
            className="button subtle"
            onClick={state.captureNeutral}
          >
            Overwrite Neutral
          </button>
          <button type="button" className="button" onClick={state.applyNeutral}>
            Apply Neutral
          </button>
        </div>
      </header>
      <div className="pose-rig-workbench__body">
        <PoseList
          poses={state.poses}
          selectedPoseId={state.selectedPoseId}
          isNeutralSelected={state.isNeutralSelected}
          onSelectNeutral={state.selectNeutral}
          onApplyPose={state.applyPose}
          onCreatePose={state.createPose}
          onPoseNameChange={state.updatePoseName}
          onDuplicatePose={state.duplicatePose}
          onDeletePose={state.deletePose}
        />
        {state.isNeutralSelected ? (
          <NeutralEditor
            inputs={sortedInputs}
            values={currentValues}
            onValueChange={state.updateCurrentValue}
          />
        ) : (
          <PoseEditor
            pose={selectedPose}
            inputs={sortedInputs}
            neutralValues={neutralValues}
            currentValues={currentValues}
            onRename={handlePoseRename}
            onCapture={handlePoseCapture}
            onClear={handlePoseClear}
            onLiveValueChange={state.updateCurrentValue}
            onRemoveInput={handlePoseRemoveInput}
            onAddInput={handlePoseAddInput}
            hasLiveAdjustments={hasLiveAdjustments}
          />
        )}
      </div>
    </section>
  );
}
