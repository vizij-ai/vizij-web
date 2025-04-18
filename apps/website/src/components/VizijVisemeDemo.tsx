import { useEffect, useMemo, useRef, useState } from "react";
import Hugo from "../assets/Hugo.glb";
import Quori from "../assets/Quori.glb";
import { useSpring } from "motion/react";
import { createVizijStore, Group, loadGLTF, useVizijStore, Vizij, VizijContext } from "vizij";
import { useShallow } from "zustand/shallow";
import { RawValue, RawVector2 } from "@semio/utils";
import { PollyClient, SynthesizeSpeechCommand, VoiceId } from "@aws-sdk/client-polly";

import { accessKeyId, secretAccessKey } from "../aws_credentials.json";

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

const PollyVoices: VoiceId[] = [
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
  const textToSpeakInputRef = useRef<HTMLInputElement>(null);
  const speechAudioRef = useRef<HTMLAudioElement>(null);

  const [selectedVoice, setSelectedVoice] = useState<VoiceId>("Ruth");

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

  // const [timer, setTimer] = useState<number>(0);
  // const [playing, setPlaying] = useState<boolean>(false);

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

  const awsCredentials = {
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
  };

  const pollyClientInstance = new PollyClient({
    region: "us-east-1",
    credentials: awsCredentials,
  });

  const getPollyResponse = async () => {
    if (textToSpeakInputRef.current) {
      const pollyQuery = new SynthesizeSpeechCommand({
        Engine: "neural",
        LanguageCode: "en-US",
        OutputFormat: "json",
        SpeechMarkTypes: ["sentence", "word", "viseme"],
        Text: textToSpeakInputRef.current.value,
        TextType: "text",
        VoiceId: "Ruth",
      });
      const pollyResponse = await pollyClientInstance.send(pollyQuery);

      const pollyResString = await pollyResponse.AudioStream?.transformToString();

      if (pollyResString !== undefined) {
        const lines = pollyResString.split("\n");
        const parseableLines = lines.slice(0, lines.length - 1);
        const vals = parseableLines.map((s) => {
          return JSON.parse(s);
        });

        setSpokenSentences(vals?.filter((s) => s.type == "sentence"));
        setSpokenWords(vals?.filter((s) => s.type == "word"));
        setSpokenVisemes(vals?.filter((s) => s.type == "viseme"));
      }

      const pollyAudioQuery = new SynthesizeSpeechCommand({
        Engine: "neural",
        LanguageCode: "en-US",
        OutputFormat: "mp3",
        Text: textToSpeakInputRef.current.value,
        TextType: "text",
        VoiceId: selectedVoice,
      });

      const pollyAudioResponse = await pollyClientInstance.send(pollyAudioQuery);
      console.log(pollyAudioResponse);

      const pollyResByteArray = await pollyAudioResponse.AudioStream?.transformToByteArray();
      console.log(pollyResByteArray);
      if (pollyResByteArray !== undefined) {
        const audioBlob = new Blob([pollyResByteArray], { type: "audio/mpeg" });
        const audioSrc = URL.createObjectURL(audioBlob);

        setSpokenAudio(audioSrc);
      }
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
            setSelectedVoice(e.target.value as VoiceId);
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
              onPlay={() => {
                spokenVisemes.forEach((v, ind) => {
                  setTimeout(() => {
                    if (Object.keys(visemeMapper).includes(v.value)) {
                      setSelectedViseme(v.value as Viseme);
                      setCurrentSpokenVisemeIndex(ind);
                    }
                    // Make the visemes express slightly before the sound
                  }, v.time - 50);
                });
              }}
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
