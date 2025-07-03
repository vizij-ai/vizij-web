import { useEffect, useMemo, useRef, useState } from "react";
import Hugo from "../assets/Hugo.glb";
import Quori from "../assets/Quori.glb";
import { useSpring } from "motion/react";
import { createVizijStore, Group, loadGLTF, useVizijStore, Vizij, VizijContext } from "vizij";
import { useShallow } from "zustand/shallow";
import { RawValue, RawVector2 } from "@semio/utils";
import { useWasm } from "../hooks/useWasm";

type Viseme =
  | "sil"
  | "p"
  | "t"
  | "T"
  | "s"
  | "S"
  | "f"
  | "k"
  | "l"
  | "r"
  | "a"
  | "@"
  | "e"
  | "E"
  | "i"
  | "o"
  | "O"
  | "u";

const visemeMapper: {
  [key in Viseme]: {
    x: number;
    y: number;
    morph: number;
  };
} = {
  sil: { x: 1, y: 1, morph: 0 },
  p: { x: 0.82, y: 0.37, morph: 0.2 },
  t: { x: 1, y: 2.77, morph: 0.35 },
  T: { x: 1, y: 2.77, morph: 0.35 },
  s: { x: 1.6, y: 2.2, morph: 0.2 },
  S: { x: 1.6, y: 2.2, morph: 0.2 },
  f: { x: 0.7, y: 3.18, morph: 0.9 },
  k: { x: 1.2, y: 2.9, morph: 0.2 },
  l: { x: 0.79, y: 3.7, morph: 0.35 },
  r: { x: 0.85, y: 2.9, morph: 0.61 },
  a: { x: 1.18, y: 5.14, morph: 0.5 },
  "@": { x: 0.95, y: 3.3, morph: 0.61 },
  e: { x: 1, y: 5, morph: 0.37 },
  E: { x: 1, y: 5, morph: 0.37 },
  i: { x: 1.7, y: 3.89, morph: 0.44 },
  o: { x: 0.9, y: 6, morph: 0.5 },
  O: { x: 0.9, y: 6, morph: 0.5 },
  u: { x: 0.56, y: 4.15, morph: 0.5 },
};

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
// 24FPS

// TODO fetch this from environment variables and/or firebase connection
const apiURL = "https://us-central1-semio-vizij.cloudfunctions.net/api";

const PollyVoices: string[] = [
  "Danielle",
  "Gregory",
  "Ivy",
  "Joanna",
  "Kendra",
  "Kimberly",
  "Salli",
  "Joey",
  "Justin",
  "Kevin",
  "Matthew",
  "Ruth",
  "Stephen",
];

export function VizijVisemeDemo() {
  const visemeDemoStore = useMemo(() => createVizijStore(), []);

  return (
    <>
      <VizijContext.Provider value={visemeDemoStore}>
        <InnerVizijVisemeDemo></InnerVizijVisemeDemo>
      </VizijContext.Provider>
    </>
  );
}

type VisemeRigMapping = {
  rootId: string;
  scaleId: string;
  morphId: string;
};

export function InnerVizijVisemeDemo() {
  const wasm = useWasm(null);
  if (wasm.isLoaded) {
    console.log("loaded wasm");
  }
  const textToSpeakInputRef = useRef<HTMLInputElement>(null);
  const speechAudioRef = useRef<HTMLAudioElement>(null);

  const [selectedVoice, setSelectedVoice] = useState<string>("Ruth");

  const [spokenSentences, setSpokenSentences] = useState<
    { time: number; type: "sentence"; start: number; end: number; value: string }[]
  >([]);
  const [spokenWords, setSpokenWords] = useState<
    { time: number; type: "word"; start: number; end: number; value: string }[]
  >([]);
  const [spokenVisemes, setSpokenVisemes] = useState<
    { time: number; type: "viseme"; value: string }[]
  >([]);
  const [currentSpokenVisemeIndex, setCurrentSpokenVisemeIndex] = useState<number>(0);
  const [spokenAudio, setSpokenAudio] = useState<string>("");

  const [vizemeOffset, setVizemeOffset] = useState<number>(-50);
  const [transitionType, setTransitionType] = useState<string>("cubic");

  const [activePlayerId, setActivePlayerId] = useState<number | null>(null);
  const [animationDuration, setAnimationDuration] = useState<number>(0);

  const animationFrameRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const lastFrameTimeRef = useRef<number>();

  const addWorldElements = useVizijStore(useShallow((state) => state.addWorldElements));
  const setVal = useVizijStore(useShallow((state) => state.setValue));

  const [hugoIDs, setHugoIDs] = useState<VisemeRigMapping>({
    rootId: "",
    scaleId: "",
    morphId: "",
  });
  const [quoriIDs, setQuoriIDs] = useState<VisemeRigMapping>({
    rootId: "",
    scaleId: "",
    morphId: "",
  });

  const [selectedViseme, setSelectedViseme] = useState<Viseme>("sil");
  // { stiffness: 100, visualDuration: 0.1, bounce: 0.1 }
  const scaleX = useSpring(1);
  const scaleY = useSpring(1);
  const mouthMorph = useSpring(0);

  scaleX.on("change", (latestVal) => {
    setVal(quoriIDs.scaleId, "default", { x: latestVal, y: scaleY.get(), z: 1 });
    setVal(hugoIDs.scaleId, "default", { x: latestVal, y: scaleY.get(), z: 1 });
  });
  scaleY.on("change", (latestVal) => {
    setVal(quoriIDs.scaleId, "default", { x: scaleX.get(), y: latestVal, z: 1 });
    setVal(hugoIDs.scaleId, "default", { x: scaleX.get(), y: latestVal, z: 1 });
  });

  mouthMorph.on("change", (latestVal) => {
    setVal(quoriIDs.morphId, "default", latestVal);
    setVal(hugoIDs.morphId, "default", latestVal);
  });

  const quoriSearch = {
    scale: "Plane scale",
    morph: "Plane Key 1",
  };

  const hugoSearch = {
    scale: "Mouth scale",
    morph: "Mouth Key 1",
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
      search: { scale: string; morph: string },
      setter: React.Dispatch<React.SetStateAction<VisemeRigMapping>>,
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

      const foundScale = Object.values(loadedAnimatables).find(
        (anim) => anim.name === search.scale,
      );
      const foundScaleId = foundScale?.id;
      const foundMorph = Object.values(loadedAnimatables).find(
        (anim) => anim.name === search.morph,
      );
      const foundMorphId = foundMorph?.id;

      setter({
        rootId: (root as Group | undefined)?.id ?? "",
        scaleId: foundScaleId ?? "",
        morphId: foundMorphId ?? "",
      });
    };

    loadVizij(Hugo, HugoBounds, hugoInitialVals, hugoSearch, setHugoIDs);

    loadVizij(Quori, QuoriBounds, [], quoriSearch, setQuoriIDs);
  }, []);

  const getPollyResponse = async () => {
    if (textToSpeakInputRef.current) {
      fetch(`${apiURL}/tts/get-visemes`, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          voice: selectedVoice,
          text: textToSpeakInputRef.current.value,
        }),
      })
        .then((res) => {
          return res.json();
        })
        .then((visemeVals) => {
          console.log("Viseme Vals", visemeVals);
          setSpokenSentences(visemeVals["sentences"]);
          setSpokenWords(visemeVals["words"]);
          setSpokenVisemes(visemeVals["visemes"]);
          return visemeVals["visemes"];
        })
        .then((processedVisemes) => {
          const timedSetVals = processedVisemes.map(
            (v: { time: number; type: "viseme"; value: string }) => {
              const lookup = visemeMapper[v.value as Viseme];
              return {
                time: v.time,
                scaleX: lookup.x,
                scaleY: lookup.y,
                morph: lookup.morph,
              };
            },
          );
          console.log("processed visemes", processedVisemes);
          const finalViz = processedVisemes.reduce(
            (
              prev: { time: number; scaleX: number; scaleY: number; morph: number },
              current: { time: number; scaleX: number; scaleY: number; morph: number },
            ) => {
              return prev && prev.time > current.time ? prev : current;
            },
          );
          const duration = finalViz.time;
          setAnimationDuration(duration);
          console.log("duration", duration);
          const scaleXPoints = timedSetVals.map(
            (v: { time: number; scaleX: number; scaleY: number; morph: number }) => {
              return {
                id: crypto.randomUUID(),
                stamp: v.time / duration,
                value: v.scaleX,
              };
            },
          );
          const scaleYPoints = timedSetVals.map(
            (v: { time: number; scaleX: number; scaleY: number; morph: number }) => {
              return {
                id: crypto.randomUUID(),
                stamp: v.time / duration,
                value: v.scaleY,
              };
            },
          );
          const morphPoints = timedSetVals.map(
            (v: { time: number; scaleX: number; scaleY: number; morph: number }) => {
              return {
                id: crypto.randomUUID(),
                stamp: v.time / duration,
                value: v.morph,
              };
            },
          );

          const tracks = [
            {
              id: crypto.randomUUID(),
              name: "X",
              points: scaleXPoints,
              animatableId: "X",
            },
            {
              id: crypto.randomUUID(),
              name: "Y",
              points: scaleYPoints,
              animatableId: "Y",
            },
            {
              id: crypto.randomUUID(),
              name: "Morph",
              points: morphPoints,
              animatableId: "Morph",
            },
          ];

          const transitions = [];
          for (const track of tracks) {
            for (let i = 0; i < track.points.length - 1; i++) {
              const p1 = track.points[i];
              const p2 = track.points[i + 1];
              const transition = {
                id: crypto.randomUUID(),
                keypoints: [p1.id, p2.id],
                variant: transitionType,
                parameters: {},
              };
              transitions.push(transition);
            }
          }

          const animation = {
            id: "Test Animation",
            name: "Speak",
            tracks: tracks,
            groups: {
              dataType: Map,
              value: [],
            },
            transitions: {
              dataType: Map,
              value: transitions.map((t) => t),
            },
            duration: duration,
          };
          const animationString = JSON.stringify(animation);
          console.log("Loading animation:", animation);
          const animationId = wasm.loadAnimation(animationString);
          console.log("Loaded animation:", wasm.exportAnimation(animationId));
          const activePlayerId = wasm.createPlayer();
          setActivePlayerId(activePlayerId);

          // Add instance
          wasm.addInstance(activePlayerId, animationId);
          const initialUpdate = wasm.update(0);
          wasm.play(activePlayerId);
          console.log("Initial values", initialUpdate);
        });

      fetch(`${apiURL}/tts/get-audio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          voice: selectedVoice,
          text: textToSpeakInputRef.current.value,
        }),
      })
        .then((res) => {
          return res.blob();
        })
        .then((audioBlob) => {
          const audioSrc = URL.createObjectURL(audioBlob);
          setSpokenAudio(audioSrc);
        });
    }

  };

  useEffect(() => {
    const { x, y, morph } = visemeMapper[selectedViseme];
    scaleX.jump(x);
    scaleY.jump(y);
    mouthMorph.jump(morph);
  }, [selectedViseme]);

  useEffect(() => {
    setSpokenAudio("");
    setSpokenSentences([]);
    setSpokenWords([]);
    setSpokenVisemes([]);
  }, [selectedVoice]);

  const runAnimationLoop = (timestamp: number) => {
    if (startTimeRef.current === undefined) {
      startTimeRef.current = timestamp;
      lastFrameTimeRef.current = timestamp;
    }

    const elapsedTime = timestamp - startTimeRef.current;
    const deltaSinceLastFrame = timestamp - (lastFrameTimeRef.current ?? timestamp);

    if (deltaSinceLastFrame >= 1000 / 30) {
      // 30fps
      lastFrameTimeRef.current = timestamp;
      const updatedValues = wasm.update(deltaSinceLastFrame/1000);
      const t = wasm.getPlayerTime(activePlayerId)
      // console.log(`[${elapsedTime.toFixed(2)}ms], ${t} delta ${(deltaSinceLastFrame/1000).toFixed(3)} Animation values:`, updatedValues);
      if (updatedValues && updatedValues.size > 0) {
        const instanceValues = updatedValues.values().next().value; // this is a Map
        console.log(instanceValues);

        if (instanceValues instanceof Map) {
          const valX = instanceValues.get("X")?.Float;
          const valY = instanceValues.get("Y")?.Float;
          const valMorph = instanceValues.get("Morph")?.Float;
          console.log(valX, valY, valMorph);
          if (valX !== undefined) {
            scaleX.jump(valX);
          }
          if (valY !== undefined) {
            scaleY.jump(valY);
          }
          if (valMorph !== undefined) {
            mouthMorph.jump(valMorph);
          }
        }
      }
    }

    if (elapsedTime < animationDuration) {
      animationFrameRef.current = requestAnimationFrame(runAnimationLoop);
    } else {
      startTimeRef.current = undefined;
      lastFrameTimeRef.current = undefined;
    }
  };

  const handlePlay = () => {
    // existing logic
    wasm.seek(activePlayerId, vizemeOffset / -1000);
    spokenVisemes.forEach((v, ind) => {
      setTimeout(() => {
        if (Object.keys(visemeMapper).includes(v.value)) {
          // setSelectedViseme(v.value as Viseme);
          setCurrentSpokenVisemeIndex(ind);
        }
        // Make the visemes express slightly before the sound
      }, v.time + vizemeOffset);
    });

    // new animation loop logic
    if (wasm.isLoaded && activePlayerId !== null) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      startTimeRef.current = undefined;
      lastFrameTimeRef.current = undefined;
      animationFrameRef.current = requestAnimationFrame(runAnimationLoop);
    }
  };

  return (
    <div className="my-8">
      <div>
        <h4>Select Viseme</h4>
        <div>
          {Object.keys(visemeMapper).map((v) => {
            return (
              <button
                className={
                  "m-2 p-2 border border-white cursor-pointer rounded-md hover:bg-gray-800 " +
                  (selectedViseme == v ? " bg-gray-700" : "")
                }
                key={v}
                value={v}
                onClick={() => {
                  setSelectedViseme(v as Viseme);
                }}
              >
                {v}
              </button>
            );
          })}
        </div>
      </div>
      <div className="pt-2 mt-2">
        <div>Or say something instead!</div>
        <span>Speak as:</span>
        <select
          className="bg-white text-black p-2 mx-2"
          value={selectedVoice}
          onChange={(e) => {
            setSelectedVoice(e.target.value);
          }}
        >
          {PollyVoices.map((pv) => {
            return (
              <option key={pv} value={pv}>
                {pv}
              </option>
            );
          })}
        </select>
        <label>And say:</label>
        <input
          type="text"
          className="bg-white text-black p-2 m-2"
          ref={textToSpeakInputRef}
          onKeyDown={(e) => {
            if (e.key == "Enter") {
              getPollyResponse();
            }
          }}
        />
        <button
          className="p-2 m-2 border border-white cursor-pointer rounded-md hover:bg-gray-800"
          onClick={() => {
            getPollyResponse();
          }}
        >
          Speak!
        </button>
      </div>
      <div className="pt-2 mt-2">
        <label>Vizeme Offset</label>
        <input
          type="range"
          min="-200"
          max="0"
          value={vizemeOffset}
          onChange={(e) => setVizemeOffset(parseInt(e.target.value))}
          className="m-2"
        />
        <span>{vizemeOffset}ms</span>
      </div>
      <div className="pt-2 mt-2">
        <label>Transition Type</label>
        <select
          className="bg-white text-black p-2 mx-2"
          value={transitionType}
          onChange={(e) => setTransitionType(e.target.value)}
        >
          <option value="linear">Linear</option>
          <option value="bezier">Bezier</option>
          <option value="step">Step</option>
          <option value="cubic">Cubic</option>
          <option value="spring">Spring</option>
          <option value="ease_in_out">EaseInOut</option>
        </select>
      </div>
      <div>
        <div className="m-4">
          {spokenSentences.map((sent, ind) => {
            return (
              <div key={ind} className="inline-block p-2 ">
                {sent.value}
              </div>
            );
          })}
        </div>
        <div className="m-4">
          {spokenWords.map((word, ind) => {
            return (
              <div key={ind} className="inline-block p-2 ">
                {word.value}
              </div>
            );
          })}
        </div>
        <div className="m-4">
          {spokenVisemes.map((vis, ind) => {
            return (
              <div
                key={ind}
                className={
                  "inline-block p-2 " + (currentSpokenVisemeIndex == ind ? " text-semio-blue" : "")
                }
              >
                {vis.value}
              </div>
            );
          })}
        </div>
        {spokenAudio !== "" && (
          <div>
            <audio
              className="inline-block"
              ref={speechAudioRef}
              controls
              src={spokenAudio}
              onPlay={handlePlay}
            />
          </div>
        )}
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
