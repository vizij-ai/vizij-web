import { ReactNode } from "react";

import { AbiVizij, AbiVizijWithControls } from "./faces/AbiVizij";
import { BaxterVizij, BaxterVizijWithControls } from "./faces/BaxterVizij";
import { HugoVizij, HugoVizijWithControls } from "./faces/HugoVizij";
import { JiboVizij, JiboVizijWithControls } from "./faces/JiboVizij";
import { QuoriVizij, QuoriVizijWithControls } from "./faces/QuoriVizij";
import { TiagoVizij, TiagoVizijWithControls } from "./faces/TiagoVizij";

export type RobotId = "Quori" | "Hugo" | "Abi" | "Baxter" | "Jibo" | "Tiago";

type RobotComponent = () => JSX.Element;

export interface RobotProfile {
  id: RobotId;
  name: string;
  Face: RobotComponent;
  WithControls: RobotComponent;
  description: ReactNode;
}

export const ROBOT_PROFILES: RobotProfile[] = [
  {
    id: "Quori",
    name: "Quori",
    Face: QuoriVizij,
    WithControls: QuoriVizijWithControls,
    description: (
      <p>
        The face below is the face for the{" "}
        <a
          href="https://quori.org"
          target="_blank"
          className="underline hover:text-gray-200"
        >
          Quori robot
        </a>
        .
      </p>
    ),
  },
  {
    id: "Hugo",
    name: "Hugo",
    Face: HugoVizij,
    WithControls: HugoVizijWithControls,
    description: (
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
    ),
  },
  {
    id: "Abi",
    name: "Abi",
    Face: AbiVizij,
    WithControls: AbiVizijWithControls,
    description: (
      <p>
        The face below is a replica face of{" "}
        <a
          href="https://www.dromeda.com.au/product"
          target="_blank"
          className="underline hover:text-gray-200"
        >
          Andromeda&apos;s Abi
        </a>{" "}
        robot.
      </p>
    ),
  },
  {
    id: "Baxter",
    name: "Baxter",
    Face: BaxterVizij,
    WithControls: BaxterVizijWithControls,
    description: (
      <p>
        The face below is a replica face of the{" "}
        <a
          href="https://en.wikipedia.org/wiki/Baxter_(robot)"
          target="_blank"
          className="underline hover:text-gray-200"
        >
          Baxter
        </a>{" "}
        robot.
      </p>
    ),
  },
  {
    id: "Jibo",
    name: "Jibo",
    Face: JiboVizij,
    WithControls: JiboVizijWithControls,
    description: (
      <p>
        The face below is a replica face of the{" "}
        <a
          href="https://www.media.mit.edu/projects/jibo-research-platform/overview/"
          target="_blank"
          className="underline hover:text-gray-200"
        >
          Jibo
        </a>{" "}
        robot.
      </p>
    ),
  },
  {
    id: "Tiago",
    name: "Tiago",
    Face: TiagoVizij,
    WithControls: TiagoVizijWithControls,
    description: (
      <p>
        The face below is a replica face of the{" "}
        <a
          href="https://pal-robotics.com/robot/tiago-head/"
          target="_blank"
          className="underline hover:text-gray-200"
        >
          Tiago Head
        </a>{" "}
        robot by{" "}
        <a
          href="https://pal-robotics.com/"
          target="_blank"
          className="underline hover:text-gray-200"
        >
          PAL Robotics
        </a>
        .
      </p>
    ),
  },
];

export const ROBOT_PROFILE_MAP: Record<RobotId, RobotProfile> =
  ROBOT_PROFILES.reduce(
    (acc, profile) => {
      acc[profile.id] = profile;
      return acc;
    },
    {} as Record<RobotId, RobotProfile>,
  );
