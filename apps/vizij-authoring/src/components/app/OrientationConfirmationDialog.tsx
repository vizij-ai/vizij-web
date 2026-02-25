import { Button, Modal } from "../ui";
import type { RotationAxis } from "./importOrientation";

interface OrientationConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  axisDegrees: Partial<Record<RotationAxis, number>>;
  axisAvailability: Partial<Record<RotationAxis, boolean>>;
  onRotateAxis: (axis: RotationAxis, direction: -1 | 1) => void;
}

const AXIS_LABELS: Record<RotationAxis, string> = {
  x: "X",
  y: "Y",
  z: "Z",
};

const AXES: readonly RotationAxis[] = ["x", "y", "z"];

export function OrientationConfirmationDialog({
  open,
  onClose,
  axisDegrees,
  axisAvailability,
  onRotateAxis,
}: OrientationConfirmationDialogProps) {
  const hasAnyAxis = AXES.some((axis) => axisAvailability[axis]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirm Scene Orientation"
      maxWidth="md"
      backdropClassName="bg-transparent backdrop-blur-none"
      containerClassName="items-start justify-end p-4 sm:p-6 md:p-8"
    >
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Is the imported face orientation correct? Rotate the scene in 90 deg
          steps if needed. Changes update the saved default rig configuration.
        </p>
        <p className="text-xs text-text-muted">
          If you do not see your face, it may be oriented incorrectly. Try
          adjusting the X or Y orientation until it becomes visible and faces
          the correct direction.
        </p>

        {hasAnyAxis ? (
          <div className="space-y-2">
            {AXES.map((axis) => {
              const isAvailable = axisAvailability[axis] === true;
              const degrees = axisDegrees[axis] ?? 0;
              return (
                <div
                  key={axis}
                  className="flex items-center justify-between rounded-lg border border-border-default bg-bg-panel/50 px-3 py-2"
                >
                  <div className="text-sm font-medium text-text-primary">
                    {AXIS_LABELS[axis]} Axis
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-14 text-right text-xs text-text-muted">
                      {`${degrees} deg`}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!isAvailable}
                      onClick={() => onRotateAxis(axis, -1)}
                    >
                      -90 deg
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!isAvailable}
                      onClick={() => onRotateAxis(axis, 1)}
                    >
                      +90 deg
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-text-muted">
            Scene rotation controls were not detected for this face. Continue
            and adjust orientation from rig inputs if needed.
          </p>
        )}

        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Orientation Looks Correct
          </Button>
        </div>
      </div>
    </Modal>
  );
}
