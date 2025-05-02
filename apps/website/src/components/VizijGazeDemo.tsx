import { useEffect, useMemo, useRef, useState } from "react";
import Hugo from "../assets/Hugo.glb";
import Quori from "../assets/Quori.glb";
import { useMotionValue, useTransform } from "motion/react";
import { createVizijStore, Group, loadGLTF, useVizijStore, Vizij, VizijContext } from "vizij";
import { useShallow } from "zustand/shallow";
import { RawValue, RawVector2 } from "@semio/utils";
import { motion } from "motion/react";

const QuoriBounds = {
  center: {
    x: 0.01,
    y: -0.04,
  },
  size: {
    x: 0.6,
    y: 0.4,
  },
};

const HugoBounds = {
  center: {
    x: 0,
    y: 0,
  },
  size: {
    x: 4,
    y: 5,
  },
};

const QuoriEyeZ = -0.154551163315773;
const HugoEyeZ = 0.06905446946620941;

const QuoriGazeExtremes = {
  leftEye: {
    minX: 0.12,
    maxX: 0.16,
    minY: -0.06,
    maxY: -0.02,
  },
  rightEye: {
    minX: -0.14,
    maxX: -0.09,
    minY: -0.06,
    maxY: -0.02,
  },
};
const HugoGazeExtremes = {
  leftEye: {
    minX: 1.33,
    maxX: 1.63,
    minY: 0.2,
    maxY: 0.4,
  },
  rightEye: {
    minX: -1.48,
    maxX: -1.13,
    minY: 0.2,
    maxY: 0.4,
  },
};

export function VizijGazeDemo() {
  const visemeDemoStore = useMemo(() => createVizijStore(), []);

  return (
    <>
      <VizijContext.Provider value={visemeDemoStore}>
        <InnerVizijGazeDemo></InnerVizijGazeDemo>
      </VizijContext.Provider>
    </>
  );
}

type GazeRigMapping = {
  rootId: string;
  rightEyeId: string;
  leftEyeId: string;
};

export function InnerVizijGazeDemo() {
  const gazeControllerRef = useRef<HTMLDivElement>(null);
  const addWorldElements = useVizijStore(useShallow((state) => state.addWorldElements));
  const setVal = useVizijStore(useShallow((state) => state.setValue));

  const draggableGazeBlockSize = { x: 75, y: 75 };
  const draggableRange = useMemo(() => {
    const h = gazeControllerRef.current?.clientHeight ?? 300;
    const w = gazeControllerRef.current?.clientWidth ?? 300;
    return {
      x: w - draggableGazeBlockSize.x,
      y: h - draggableGazeBlockSize.y,
    };
  }, [draggableGazeBlockSize, gazeControllerRef]);

  const dragBoxPositionX = useMotionValue(0);
  const dragBoxPositionY = useMotionValue(draggableRange.y / 2);
  const lookingAtX = useTransform(() => dragBoxPositionX.get());
  const lookingAtY = useTransform(() => dragBoxPositionY.get() - draggableRange.y / 2);

  const [hugoIDs, setHugoIDs] = useState<GazeRigMapping>({
    rootId: "",
    rightEyeId: "",
    leftEyeId: "",
  });
  const [quoriIDs, setQuoriIDs] = useState<GazeRigMapping>({
    rootId: "",
    rightEyeId: "",
    leftEyeId: "",
  });

  const convertXYDragToXYFace = (
    xDrag: number,
    yDrag: number,
    dragRange: { x: number; y: number },
    faceVals: { minX: number; maxX: number; minY: number; maxY: number },
  ) => {
    return {
      x:
        ((xDrag + dragRange.x / 2) / dragRange.x) * (faceVals.maxX - faceVals.minX) + faceVals.minX,
      y:
        faceVals.maxY - ((yDrag + dragRange.y / 2) / dragRange.y) * (faceVals.maxY - faceVals.minY),
    };
  };

  lookingAtX.on("change", (latestVal) => {
    const quoriRightEyeXY = convertXYDragToXYFace(
      latestVal,
      lookingAtY.get(),
      draggableRange,
      QuoriGazeExtremes.rightEye,
    );

    setVal(quoriIDs.rightEyeId, "default", {
      x: quoriRightEyeXY.x,
      y: quoriRightEyeXY.y,
      z: QuoriEyeZ,
    });

    const quoriLeftEyeXY = convertXYDragToXYFace(
      latestVal,
      lookingAtY.get(),
      draggableRange,
      QuoriGazeExtremes.leftEye,
    );
    setVal(quoriIDs.leftEyeId, "default", {
      x: quoriLeftEyeXY.x,
      y: quoriLeftEyeXY.y,
      z: QuoriEyeZ,
    });

    const hugoRightEyeXY = convertXYDragToXYFace(
      latestVal,
      lookingAtY.get(),
      draggableRange,
      HugoGazeExtremes.rightEye,
    );
    setVal(hugoIDs.rightEyeId, "default", {
      x: hugoRightEyeXY.x,
      y: hugoRightEyeXY.y,
      z: HugoEyeZ,
    });

    const hugoLeftEyeXY = convertXYDragToXYFace(
      latestVal,
      lookingAtY.get(),
      draggableRange,
      HugoGazeExtremes.leftEye,
    );
    setVal(hugoIDs.leftEyeId, "default", { x: hugoLeftEyeXY.x, y: hugoLeftEyeXY.y, z: HugoEyeZ });
  });

  lookingAtY.on("change", (latestVal) => {
    const quoriRightEyeXY = convertXYDragToXYFace(
      lookingAtX.get(),
      latestVal,
      draggableRange,
      QuoriGazeExtremes.rightEye,
    );
    setVal(quoriIDs.rightEyeId, "default", {
      x: quoriRightEyeXY.x,
      y: quoriRightEyeXY.y,
      z: QuoriEyeZ,
    });

    const quoriLeftEyeXY = convertXYDragToXYFace(
      lookingAtX.get(),
      latestVal,
      draggableRange,
      QuoriGazeExtremes.leftEye,
    );
    setVal(quoriIDs.leftEyeId, "default", {
      x: quoriLeftEyeXY.x,
      y: quoriLeftEyeXY.y,
      z: QuoriEyeZ,
    });

    const hugoRightEyeXY = convertXYDragToXYFace(
      lookingAtX.get(),
      latestVal,
      draggableRange,
      HugoGazeExtremes.rightEye,
    );
    setVal(hugoIDs.rightEyeId, "default", {
      x: hugoRightEyeXY.x,
      y: hugoRightEyeXY.y,
      z: HugoEyeZ,
    });

    const hugoLeftEyeXY = convertXYDragToXYFace(
      lookingAtX.get(),
      latestVal,
      draggableRange,
      HugoGazeExtremes.leftEye,
    );
    setVal(hugoIDs.leftEyeId, "default", { x: hugoLeftEyeXY.x, y: hugoLeftEyeXY.y, z: HugoEyeZ });
  });

  const quoriSearch = {
    rightEye: "R_Eye translation",
    leftEye: "L_Eye translation",
  };

  const hugoSearch = {
    rightEye: "R_Eye translation",
    leftEye: "L_Eye translation",
  };

  const hugoInitialVals = [
    {
      name: "Black_S",
      value: { r: 0, g: 0, b: 0 },
    },
  ];

  useEffect(() => {
    const loadVizij = async (
      glb: string,
      bounds: {
        center: RawVector2;
        size: RawVector2;
      },
      initialValues: { name: string; value: RawValue }[],
      search: { rightEye: string; leftEye: string },
      setter: React.Dispatch<React.SetStateAction<GazeRigMapping>>,
    ) => {
      const [loadedWorld, loadedAnimatables] = await loadGLTF(glb, ["default"], true, bounds);
      const root = Object.values(loadedWorld).find((e) => e.type === "group" && e.rootBounds);
      addWorldElements(loadedWorld, loadedAnimatables, false);

      initialValues?.forEach((v: { name: string; value: RawValue }) => {
        const foundVal = Object.values(loadedAnimatables).find((anim) => anim.name == v.name);
        if (foundVal) {
          setVal(foundVal.id, "default", v.value);
        }
      });
      const foundRightEye = Object.values(loadedAnimatables).find(
        (anim) => anim.name === search.rightEye,
      );

      const foundRightEyeId = foundRightEye?.id;
      const foundLeftEye = Object.values(loadedAnimatables).find(
        (anim) => anim.name === search.leftEye,
      );
      const foundLeftEyeId = foundLeftEye?.id;

      setter({
        rootId: (root as Group | undefined)?.id ?? "",
        rightEyeId: foundRightEyeId ?? "",
        leftEyeId: foundLeftEyeId ?? "",
      });
    };

    loadVizij(Hugo, HugoBounds, hugoInitialVals, hugoSearch, setHugoIDs);

    loadVizij(Quori, QuoriBounds, [], quoriSearch, setQuoriIDs);
  }, []);

  return (
    <div className="my-8">
      <div>
        <h4>Select Gaze Direction</h4>
        <div className="w-96 h-96 mx-auto bg-gray-400" ref={gazeControllerRef}>
          <motion.div
            className="cursor-grab"
            style={{
              width: draggableGazeBlockSize.x,
              height: draggableGazeBlockSize.y,
              backgroundColor: "#50c4b6",
              borderRadius: 10,
              color: "#000",
              x: dragBoxPositionX,
              y: dragBoxPositionY,
              touchAction: "none",
              margin: "auto",
            }}
            drag
            dragConstraints={gazeControllerRef}
            dragElastic={0}
            dragMomentum={false}
            onUpdate={(e: { x: number; y: number }) => {
              dragBoxPositionX.set(e.x);
              dragBoxPositionY.set(e.y);
            }}
          >
            Drag to control gaze
          </motion.div>
        </div>
        <button
          className="m-2 p-2 border border-white cursor-pointer rounded-md hover:bg-gray-800 "
          onClick={() => {
            dragBoxPositionX.set(0);
            dragBoxPositionY.set(draggableRange.y / 2);
          }}
        >
          Reset Gaze
        </button>
        <div>{/* Looking at ({lookingAt.get().x}, {lookingAt.get().y}) */}</div>
      </div>
      <div className="grid grid-cols-2">
        <div>
          <p>Quori</p>
          <div>
            <Vizij rootId={quoriIDs.rootId} />
          </div>
        </div>
        <div>
          <p>Hugo</p>
          <div>
            <Vizij rootId={hugoIDs.rootId} />
          </div>
        </div>
      </div>
    </div>
  );
}
