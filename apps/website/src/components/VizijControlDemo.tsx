import { useState } from "react";
import { AbiVizijWithControls } from "./AbiVizij";
import { HugoVizijWithControls } from "./HugoVizij";
import { QuoriVizijWithControls } from "./QuoriVizij";

function VizijWithControlSwitch({ robot }: { robot: string }) {
  switch (robot) {
    case "Abi":
      return (
        <div>
          {/* <h3 className="text-xl text-white font-bold m-2">Meet Abi</h3> */}
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
          {/* <h3 className="text-xl text-white font-bold m-2">Meet Hugo</h3> */}
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
          {/* <h3 className="text-xl text-white font-bold m-2">Meet Quori</h3> */}
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
      <div className="my-8">
        <button
          className={
            "p-4 m-2 rounded-xl bg-gray-900 border border-white cursor-pointer font-bold " +
            (selectedRobot === "Quori" && " bg-semio-blue border-0 text-gray-900")
          }
          onClick={() => {
            setSelectedRobot("Quori");
          }}
        >
          Meet Quori
        </button>
        <button
          className={
            "p-4 m-2 rounded-xl bg-gray-900 border border-white cursor-pointer font-bold " +
            (selectedRobot === "Hugo" && " bg-semio-blue border-0 text-gray-900")
          }
          onClick={() => {
            setSelectedRobot("Hugo");
          }}
        >
          Meet Hugo
        </button>
        <button
          className={
            "p-4 m-2 rounded-xl bg-gray-900 border border-white cursor-pointer font-bold " +
            (selectedRobot === "Abi" && " bg-semio-blue border-0 text-gray-900")
          }
          onClick={() => {
            setSelectedRobot("Abi");
          }}
        >
          Meet Abi
        </button>
      </div>
      {/* <label className="my-4">
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
      </label> */}
      <VizijWithControlSwitch robot={selectedRobot} />
    </>
  );
}
