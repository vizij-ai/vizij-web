import { useEffect, useMemo, useRef, useState } from "react";
import Hugo from "../assets/Hugo.glb";
import Quori from "../assets/Quori.glb";
import { useMotionValue, useTransform } from "motion/react";
import { createVizijStore, Group, loadGLTF, useVizijStore, Vizij, VizijContext } from "vizij";
import { useShallow } from "zustand/shallow";
import { instanceOfRawVector3, RawValue, RawVector2, RawVector3 } from "@semio/utils";
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

const HugoMapping = {
  x: [
    {
      name: "L_Eye translation",
      applyTo: "x",
      from: 1.33,
      to: 1.63,
    },
    {
      name: "R_Eye translation",
      applyTo: "x",
      from: -1.48,
      to: -1.13,
    },
  ],
  y: [
    {
      name: "L_Eye translation",
      applyTo: "y",
      from: 0.2,
      to: 0.4,
    },
    {
      name: "R_Eye translation",
      applyTo: "y",
      from: 0.2,
      to: 0.4,
    },
  ],
};

const QuoriMapping = {
  x: [
    {
      name: "L_Eye translation",
      applyTo: "x",
      from: 0.12,
      to: 0.16,
    },
    {
      name: "R_Eye translation",
      applyTo: "x",
      from: -0.14,
      to: -0.09,
    },
  ],
  y: [
    {
      name: "L_Eye translation",
      applyTo: "y",
      from: -0.06,
      to: -0.02,
    },
    {
      name: "LT_Lid translation",
      applyTo: "y",
      from: -0.02,
      to: 0,
    },
    {
      name: "LB_Lid translation",
      applyTo: "y",
      from: -0.1,
      to: -0.08,
    },
    {
      name: "R_Eye translation",
      applyTo: "y",
      from: -0.06,
      to: -0.02,
    },
    {
      name: "RT_Lid translation",
      applyTo: "y",
      from: -0.01,
      to: 0.01,
    },
    {
      name: "RB_Lid translation",
      applyTo: "y",
      from: -0.09,
      to: -0.07,
    },
  ],
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

type IDLookup = {
  root: string;
  [key: string]: string;
};

export function InnerVizijGazeDemo() {
  const gazeControllerRef = useRef<HTMLDivElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
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
  const lookingAtY = useTransform(() => -1 * (dragBoxPositionY.get() - draggableRange.y / 2));

  const [hugoIDs, setHugoIDs] = useState<IDLookup>({
    root: "",
  });
  const [quoriIDs, setQuoriIDs] = useState<IDLookup>({
    root: "",
  });

  const [imageProcessingInterval, setImageProcessingInterval] = useState<NodeJS.Timeout | null>(
    null,
  );

  const convertDragToPercent = (dragVal: number, minDrag: number, maxDrag: number) => {
    return (dragVal - minDrag) / (maxDrag - minDrag);
  };

  const convertPercentToFace = (percentVal: number, faceFrom: number, faceTo: number) => {
    return faceFrom + percentVal * Math.abs(faceFrom - faceTo);
  };

  const convertDragToFace = (
    dragVal: number,
    dragMin: number,
    dragMax: number,
    faceFrom: number,
    faceTo: number,
  ) => {
    const p = convertDragToPercent(dragVal, dragMin, dragMax);
    const f = convertPercentToFace(p, faceFrom, faceTo);
    return f;
  };

  lookingAtX.on("change", (latestVal) => {
    QuoriMapping.x.map((eachMapping) => {
      const valToSet = convertDragToFace(
        latestVal,
        (-1 * draggableRange.x) / 2,
        draggableRange.x / 2,
        eachMapping.from,
        eachMapping.to,
      );
      setVal(quoriIDs[eachMapping.name], "default", (currentVals) => {
        if (currentVals !== undefined && instanceOfRawVector3(currentVals)) {
          return {
            x: valToSet,
            y: currentVals.y,
            z: currentVals.z,
          };
        }
        return currentVals;
      });
    });
    HugoMapping.x.map((eachMapping) => {
      const valToSet = convertDragToFace(
        latestVal,
        (-1 * draggableRange.x) / 2,
        draggableRange.x / 2,
        eachMapping.from,
        eachMapping.to,
      );
      setVal(hugoIDs[eachMapping.name], "default", (currentVals) => {
        if (currentVals !== undefined && instanceOfRawVector3(currentVals)) {
          return {
            x: valToSet,
            y: currentVals.y,
            z: currentVals.z,
          };
        }
        return currentVals;
      });
    });
  });

  lookingAtY.on("change", (latestVal) => {
    QuoriMapping.y.map((eachMapping) => {
      const valToSet = convertDragToFace(
        latestVal,
        (-1 * draggableRange.y) / 2,
        draggableRange.y / 2,
        eachMapping.from,
        eachMapping.to,
      );
      setVal(quoriIDs[eachMapping.name], "default", (currentVals) => {
        if (currentVals !== undefined && instanceOfRawVector3(currentVals)) {
          return {
            x: currentVals.x,
            y: valToSet,
            z: currentVals.z,
          };
        }
        return currentVals;
      });
    });
    HugoMapping.y.map((eachMapping) => {
      const valToSet = convertDragToFace(
        latestVal,
        (-1 * draggableRange.y) / 2,
        draggableRange.y / 2,
        eachMapping.from,
        eachMapping.to,
      );
      setVal(hugoIDs[eachMapping.name], "default", (currentVals) => {
        if (currentVals !== undefined && instanceOfRawVector3(currentVals)) {
          return {
            x: currentVals.x,
            y: valToSet,
            z: currentVals.z,
          } as RawVector3;
        }
        return currentVals;
      });
    });
  });

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
      search: string[],
      setter: React.Dispatch<React.SetStateAction<IDLookup>>,
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

      const foundVals = Object.fromEntries(
        search.map((query) => {
          const foundShape = Object.values(loadedAnimatables).find((anim) => anim.name === query);
          const foundId = foundShape?.id;
          return [query, foundId ?? ""];
        }),
      );

      setter({
        root: (root as Group | undefined)?.id ?? "",
        ...foundVals,
      });
    };

    const hugoSearch = Array.from(
      new Set([...HugoMapping.x.map((v) => v.name), ...HugoMapping.y.map((v) => v.name)]),
    );
    const quoriSearch = Array.from(
      new Set([...QuoriMapping.x.map((v) => v.name), ...QuoriMapping.y.map((v) => v.name)]),
    );

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
            <Vizij rootId={quoriIDs.root} />
          </div>
        </div>
        <div>
          <p>Hugo</p>
          <div>
            <Vizij rootId={hugoIDs.root} />
          </div>
        </div>
      </div>
      <div>
        <p>Or have them look at you!</p>
        <button
          className="m-2 p-2 border border-white cursor-pointer rounded-md hover:bg-gray-800 "
          onClick={() => {
            navigator.mediaDevices
              .getUserMedia({
                video: {
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                },
              })
              .then((mediaStream) => {
                cameraStreamRef.current = mediaStream;
                if (cameraVideoRef.current) {
                  cameraVideoRef.current.srcObject = mediaStream;
                  cameraVideoRef.current.onloadedmetadata = () => {
                    cameraVideoRef.current?.play();
                  };
                }
                const tracks = mediaStream.getVideoTracks();
                const usedTrack = tracks[0];
                const imgCapturer = new ImageCapture(usedTrack);

                const intv = setInterval(() => {
                  const img = imgCapturer.grabFrame();
                  img.then((res: ImageBitmap) => {
                    console.log(res);
                  });
                }, 1000);
                setImageProcessingInterval(intv);
              });
          }}
        >
          Load Camera
        </button>
        <button
          className="cursor-pointer"
          onClick={() => {
            if (imageProcessingInterval !== null) {
              clearInterval(imageProcessingInterval);
            }
            if (cameraStreamRef.current) {
              const currentTrack = cameraStreamRef.current.getVideoTracks()[0];
              currentTrack.stop();
            }
            if (cameraVideoRef.current) {
              cameraVideoRef.current.srcObject = null;
            }
          }}
        >
          Stop
        </button>
        <video ref={cameraVideoRef} className="mx-auto"></video>
      </div>
    </div>
  );
}
