import { useMemo, useState } from "react";
import { ROBOT_PROFILES, ROBOT_PROFILE_MAP, RobotId } from "./robotProfiles";

const buttonBaseClass =
  "p-4 m-2 rounded-xl bg-gray-900 border border-white cursor-pointer font-bold";

export function VizijControlDemo() {
  const [selectedRobot, setSelectedRobot] = useState<RobotId>("Quori");

  const selectedProfile = useMemo(
    () => ROBOT_PROFILE_MAP[selectedRobot],
    [selectedRobot],
  );

  if (!selectedProfile) {
    return null;
  }

  const SelectedRobotComponent = selectedProfile.WithControls;

  return (
    <>
      <div className="my-8">
        {ROBOT_PROFILES.map(({ id, name }) => {
          const isSelected = id === selectedRobot;
          const buttonClassName = `${buttonBaseClass}${
            isSelected ? " bg-semio-blue border-0 text-gray-900" : ""
          }`;

          return (
            <button
              key={id}
              className={buttonClassName}
              onClick={() => setSelectedRobot(id)}
            >
              Select {name}
            </button>
          );
        })}
      </div>
      <div>
        {selectedProfile.description}
        <div>
          <SelectedRobotComponent />
        </div>
      </div>
    </>
  );
}
