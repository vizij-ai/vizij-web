import { useState } from "react";
import { AbiVizijWithControls } from "./AbiVizij";
import { HugoVizijWithControls } from "./HugoVizij";
import { QuoriVizijWithControls } from "./QuoriVizij";

function VizijWithControlSwitch({ robot }: { robot: string }) {
  switch (robot) {
    case "Abi":
      return (
        <div>
          <h3 className="text-xl text-semio-yellow m-2">Meet Abi</h3>
          <p>
            The below vizij is a replica face of{" "}
            <a
              href="https://www.dromeda.com.au/product"
              target="_blank"
              className="underline hover:text-gray-200"
            >
              Andromeda's Abi
            </a>{" "}
            robot.
          </p>
          <AbiVizijWithControls />
        </div>
      );
    case "Hugo":
      return (
        <div>
          <h3 className="text-xl text-semio-yellow m-2">Meet Hugo</h3>
          <p>
            The Hugo face below is the forthcoming default{" "}
            <a
              href="https://peerbots.org"
              target="_blank"
              className="underline hover:text-gray-200"
            >
              Peerbots
            </a>{" "}
            screen-based face.
          </p>
          <HugoVizijWithControls />
        </div>
      );

    default:
      return (
        <div>
          <h3 className="text-xl text-semio-yellow m-2">Meet Quori</h3>
          <p>Quori .... </p>
          <QuoriVizijWithControls />
        </div>
      );
  }
}

export function VizijControlDemo() {
  const [selectedRobot, setSelectedRobot] = useState<string>("Quori");
  return (
    <>
      <label>
        Select the robot you would like to customize
        <select
          className="p-2 m-2 bg-white text-black"
          onChange={(e) => {
            setSelectedRobot(e.target.value);
          }}
        >
          <option value={"Quori"}>Quori</option>
          <option value={"Hugo"}>Hugo</option>
          <option value={"Abi"}>Abi</option>
        </select>
      </label>
      <VizijWithControlSwitch robot={selectedRobot} />
    </>
  );
}
