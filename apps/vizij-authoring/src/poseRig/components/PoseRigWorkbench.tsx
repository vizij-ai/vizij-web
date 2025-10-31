import type { StandardRigInput } from "@vizij/utils";
import { NeutralEditor } from "./NeutralEditor";
import { PoseEditor } from "./PoseEditor";
import { PoseList } from "./PoseList";
import { PoseSummary } from "./PoseSummary";
import type { UsePoseRigAuthoringResult } from "../usePoseRigAuthoring";

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

  const handlePoseDescriptionChange = (description: string) => {
    if (!selectedPose) {
      return;
    }
    state.updatePoseDescription(selectedPose.id, description);
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

  const handlePoseValueChange = (inputId: string, value: number) => {
    if (!selectedPose) {
      return;
    }
    state.updatePoseValue(selectedPose.id, inputId, value);
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

  return (
    <section className="pose-rig-workbench">
      <header className="pose-rig-workbench__header">
        <div>
          <h2>Pose Rig Workbench</h2>
          <p>Capture values, build poses, and preview graph contributions.</p>
        </div>
        <div className="pose-rig-workbench__actions">
          <button
            type="button"
            className="button subtle"
            onClick={state.captureNeutral}
          >
            Capture Neutral
          </button>
          <button type="button" className="button" onClick={state.applyNeutral}>
            Apply Neutral
          </button>
        </div>
      </header>
      <div className="pose-rig-workbench__body">
        <PoseSummary
          summary={state.poseGraphSummary}
          library={state.poseLibrary}
          onApplyNeutral={state.applyNeutral}
          onApplyPose={state.applyPose}
        />
        <PoseList
          poses={state.poses}
          selectedPoseId={state.selectedPoseId}
          isNeutralSelected={state.isNeutralSelected}
          onSelectNeutral={state.selectNeutral}
          onSelectPose={state.selectPose}
          onCreatePose={state.createPose}
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
            onRename={handlePoseRename}
            onDescriptionChange={handlePoseDescriptionChange}
            onCapture={handlePoseCapture}
            onClear={handlePoseClear}
            onValueChange={handlePoseValueChange}
            onRemoveInput={handlePoseRemoveInput}
            onAddInput={handlePoseAddInput}
          />
        )}
      </div>
    </section>
  );
}
