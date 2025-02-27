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
          <div>
            <AbiVizijWithControls />
          </div>
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
          <div>
            <HugoVizijWithControls />
          </div>
        </div>
      );
    case "Baxter":
      return (
        <div>
          {/* <h3 className="text-xl text-white font-bold m-2">Meet Hugo</h3> */}
          <p>Baxter</p>
          <div>
            <BaxterVizijWithControls />
          </div>
        </div>
      );
    case "Jibo":
      return (
        <div>
          {/* <h3 className="text-xl text-white font-bold m-2">Meet Hugo</h3> */}
          <p>Jibo</p>
          <div>
            <JiboVizijWithControls />
          </div>
        </div>
      );
    case "Tiago":
      return (
        <div>
          {/* <h3 className="text-xl text-white font-bold m-2">Meet Hugo</h3> */}
          <p>Tiago</p>
          <div>
            <TiagoVizijWithControls />
          </div>
        </div>
      );

    default:
      return (
        <div>
          {/* <h3 className="text-xl text-white font-bold m-2">Meet Quori</h3> */}
          <p>Quori .... </p>
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
        <button
          className={
            "p-4 m-2 rounded-xl bg-gray-900 border border-white cursor-pointer font-bold " +
            (selectedRobot === "Baxter" && " bg-semio-blue border-0 text-gray-900")
          }
          onClick={() => {
            setSelectedRobot("Baxter");
          }}
        >
          Meet Baxter
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
          Meet Jibo
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
          Meet Tiago
        </button>
      </div>
      <div>
        <VizijWithControlSwitch robot={selectedRobot} />
      </div>
    </>
  );
}
