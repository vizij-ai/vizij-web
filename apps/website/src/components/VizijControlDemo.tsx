import { useState } from "react";
import { AbiVizijWithControls } from "./AbiVizij";
import { HugoVizijWithControls } from "./HugoVizij";
import { QuoriVizijWithControls } from "./QuoriVizij";
import { JiboVizijWithControls } from "./JiboVizij";
import { BaxterVizijWithControls } from "./BaxterVizij";
import { TiagoVizijWithControls } from "./TiagoVizij";

function VizijWithControlSwitch({ robot }: { robot: string }) {
  switch (robot) {
    case "Abi":
      return (
        <div>
          <p>
            The face below is a replica face of{" "}
            <a
              href="https://www.dromeda.com.au/product"
              target="_blank"
              className="underline hover:text-gray-200"
            >
              Andromeda's Abi
            </a>{" "}
            robot.
          </p>
          <div>
            <AbiVizijWithControls />
          </div>
        </div>
      );
    case "Hugo":
      return (
        <div>
          <p>
            The face below is the forthcoming default{" "}
            <a
              href="https://peerbots.org"
              target="_blank"
              className="underline hover:text-gray-200"
            >
              Peerbots
            </a>{" "}
            screen-based face named Hugo.
          </p>
          <div>
            <HugoVizijWithControls />
          </div>
        </div>
      );
    case "Baxter":
      return (
        <div>
          <p>
            The face below is a replica face of the{" "}
            <a href="" target="_blank" className="underline hover:text-gray-200">
              Baxter
            </a>{" "}
            robot.
          </p>
          <div>
            <BaxterVizijWithControls />
          </div>
        </div>
      );
    case "Jibo":
      return (
        <div>
          <p>
            The face below is a replica face of the{" "}
            <a href="" target="_blank" className="underline hover:text-gray-200">
              Jibo
            </a>{" "}
            robot.
          </p>
          <div>
            <JiboVizijWithControls />
          </div>
        </div>
      );
    case "Tiago":
      return (
        <div>
          <p>
            The face below is a replica face of{" "}
            <a href="" target="_blank" className="underline hover:text-gray-200">
              Tiago
            </a>{" "}
            robot by
            <a href="" target="_blank" className="underline hover:text-gray-200">
              PAL Robotics
            </a>
            .
          </p>
          <div>
            <TiagoVizijWithControls />
          </div>
        </div>
      );

    default:
      return (
        <div>
          <p>
            The face below is the face for the
            <a href="https://quori.org" target="_blank" className="underline hover:text-gray-200">
              Quori robot
            </a>{" "}
          </p>
          <div>
            <QuoriVizijWithControls />
          </div>
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
          Select Quori
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
          Select Hugo
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
          Select Abi
        </button>
        <button
          className={
            "p-4 m-2 rounded-xl bg-gray-900 border border-white cursor-pointer font-bold " +
            (selectedRobot === "Baxter" && " bg-semio-blue border-0 text-gray-900")
          }
          onClick={() => {
            setSelectedRobot("Baxter");
          }}
        >
          Select Baxter
        </button>
        <button
          className={
            "p-4 m-2 rounded-xl bg-gray-900 border border-white cursor-pointer font-bold " +
            (selectedRobot === "Jibo" && " bg-semio-blue border-0 text-gray-900")
          }
          onClick={() => {
            setSelectedRobot("Jibo");
          }}
        >
          Select Jibo
        </button>
        <button
          className={
            "p-4 m-2 rounded-xl bg-gray-900 border border-white cursor-pointer font-bold " +
            (selectedRobot === "Tiago" && " bg-semio-blue border-0 text-gray-900")
          }
          onClick={() => {
            setSelectedRobot("Tiago");
          }}
        >
          Select Tiago
        </button>
      </div>
      <div>
        <VizijWithControlSwitch robot={selectedRobot} />
      </div>
    </>
  );
}
