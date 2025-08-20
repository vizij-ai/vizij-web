import { useEffect, useMemo, useState } from "react";
import Hugo from "../assets/Hugo.glb";
import Quori from "../assets/Quori.glb";
import { useSpring } from "motion/react";
import { createVizijStore, useVizijStore, VizijContext } from "vizij";
import { useShallow } from "zustand/shallow";
import { Viseme, visemeMapper } from "../config/viseme";
import { Expression, expressionMapper } from "../config/expression";
import { HugoBounds, QuoriBounds, hugoSearch, quoriSearch } from "../config/models";
import { useModelLoader } from "../hooks/useModelLoader";
import { usePollyTTS } from "../hooks/usePollyTTS";
import { useWasmAnimationPlayer } from "../hooks/useWasmAnimationPlayer";
import { TTSSettings } from "./viseme-demo/TTSSettings";
import { SpokenTextDisplay } from "./viseme-demo/SpokenTextDisplay";
import { CharacterView } from "./viseme-demo/CharacterView";

const hugoInitialVals = [
  {
    name: "Black_S",
    value: { r: 0, g: 0, b: 0 },
  },
];

export function VizijExpressionsDemo() {
  const visemeDemoStore = useMemo(() => createVizijStore(), []);

  return (
    <VizijContext.Provider value={visemeDemoStore}>
      <InnerVizijExpressionsDemo />
    </VizijContext.Provider>
  );
}

export function InnerVizijExpressionsDemo() {
  const [selectedVoice, setSelectedVoice] = useState<string>("Ruth");
  const [currentSpokenVisemeIndex, setCurrentSpokenVisemeIndex] = useState<number>(0);
  const [vizemeOffset, _setVizemeOffset] = useState<number>(-50);
  const [transitionType, _setTransitionType] = useState<string>("cubic");

  // Initialize expression weight vector with 0 for each expression
  const [expressionWeightVector, setExpressionWeightVector] = useState<Record<Expression, number>>(() => {
    const initialWeights: Record<Expression, number> = {} as Record<Expression, number>;
    Object.keys(expressionMapper).forEach((expression) => {
      initialWeights[expression as Expression] = 0;
    });
    return initialWeights;
  });

  const scaleX = useSpring(1);
  const scaleY = useSpring(1);
  const mouthMorph = useSpring(0);

  const setVal = useVizijStore(useShallow((state) => state.setValue));

  const hugoBoundsMemo = useMemo(() => HugoBounds, []);
  const hugoInitialValsMemo = useMemo(() => hugoInitialVals, []);
  const hugoSearchMemo = useMemo(() => hugoSearch, []);
  const quoriBoundsMemo = useMemo(() => QuoriBounds, []);
  const quoriSearchMemo = useMemo(() => quoriSearch, []);
  const emptyInitialVals = useMemo(() => [], []);

  const { rigMapping: hugoIDs } = useModelLoader(Hugo, hugoBoundsMemo, hugoInitialValsMemo, hugoSearchMemo);
  const { rigMapping: quoriIDs } = useModelLoader(Quori, quoriBoundsMemo, emptyInitialVals, quoriSearchMemo);

  const {
    spokenSentences,
    spokenWords,
    spokenVisemes,
    spokenAudio,
    getTTSData,
    setSpokenAudio,
    setSpokenSentences,
    setSpokenWords,
    setSpokenVisemes,
  } = usePollyTTS();

  const motionValues = useMemo(
    () => [
      { name: "X", motionValue: scaleX },
      { name: "Y", motionValue: scaleY },
      { name: "Morph", motionValue: mouthMorph },
    ],
    [scaleX, scaleY, mouthMorph],
  );

  const { setAnimationDuration, loadAnimation, play } = useWasmAnimationPlayer(
    motionValues,
  );

  useEffect(() => {
    const unsubscribeScaleX = scaleX.on("change", (latestVal) => {
      if (quoriIDs.scaleId && hugoIDs.scaleId) {
        setVal(quoriIDs.scaleId, "default", { x: latestVal, y: scaleY.get(), z: 1 });
        setVal(hugoIDs.scaleId, "default", { x: latestVal, y: scaleY.get(), z: 1 });
      }
    });

    const unsubscribeScaleY = scaleY.on("change", (latestVal) => {
      if (quoriIDs.scaleId && hugoIDs.scaleId) {
        setVal(quoriIDs.scaleId, "default", { x: scaleX.get(), y: latestVal, z: 1 });
        setVal(hugoIDs.scaleId, "default", { x: scaleX.get(), y: latestVal, z: 1 });
      }
    });

    const unsubscribeMouthMorph = mouthMorph.on("change", (latestVal) => {
      if (quoriIDs.morphId && hugoIDs.morphId) {
        setVal(quoriIDs.morphId, "default", latestVal);
        setVal(hugoIDs.morphId, "default", latestVal);
      }
    });

    return () => {
      unsubscribeScaleX();
      unsubscribeScaleY();
      unsubscribeMouthMorph();
    };
  }, [scaleX, scaleY, mouthMorph, quoriIDs.scaleId, quoriIDs.morphId, hugoIDs.scaleId, hugoIDs.morphId, setVal]);

  useEffect(() => {
    setSpokenAudio("");
    setSpokenSentences([]);
    setSpokenWords([]);
    setSpokenVisemes([]);
  }, [selectedVoice, setSpokenAudio, setSpokenSentences, setSpokenWords, setSpokenVisemes]);

  const handleSpeak = async (text: string) => {
    await getTTSData(text, selectedVoice);
  };

  useEffect(() => {
    if (spokenVisemes.length > 0) {
      const timedSetVals = spokenVisemes.map((v) => {
        const lookup = visemeMapper[v.value as Viseme];
        console.log("Viseme lookup:", v.value, lookup);
        return {
          time: v.time,
          scaleX: lookup.x,
          scaleY: lookup.y,
          morph: lookup.morph,
        };
      });

      const finalViz = timedSetVals.reduce((prev, current) => {
        return prev && prev.time > current.time ? prev : current;
      });
      const duration = finalViz.time;
      setAnimationDuration(duration);

      const scaleXPoints = timedSetVals.map((v) => ({
        id: crypto.randomUUID(),
        stamp: v.time / duration,
        value: v.scaleX,
      }));
      const scaleYPoints = timedSetVals.map((v) => ({
        id: crypto.randomUUID(),
        stamp: v.time / duration,
        value: v.scaleY,
      }));
      const morphPoints = timedSetVals.map((v) => ({
        id: crypto.randomUUID(),
        stamp: v.time / duration,
        value: v.morph,
      }));

      const tracks = [
        { id: crypto.randomUUID(), name: "X", points: scaleXPoints, animatableId: "X" },
        { id: crypto.randomUUID(), name: "Y", points: scaleYPoints, animatableId: "Y" },
        { id: crypto.randomUUID(), name: "Morph", points: morphPoints, animatableId: "Morph" },
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
        groups: { dataType: "Map", value: [] },
        transitions: { dataType: "Map", value: transitions },
        duration: duration,
      };
      loadAnimation(animation);
    }
  }, [spokenVisemes, transitionType, setAnimationDuration, loadAnimation]);

  const handlePlay = () => {
    spokenVisemes.forEach((v, ind) => {
      setTimeout(() => {
        if (Object.keys(expressionMapper).includes(v.value)) {
          setCurrentSpokenVisemeIndex(ind);
        }
      }, v.time + vizemeOffset);
    });
    play(vizemeOffset);
  };

  return (
    <div className="my-8">
    <div>
      <h4>Select Expressions</h4>
      <div>
        {Object.keys(expressionMapper).map((v) => (
          <div key={v} className="pt-2 mt-2">
            <label>{v}</label>
            <input
              type="range"
              min="0"
              max="100"
              value={expressionWeightVector[v as Expression]}
              onChange={(e) => {
                const newValue = parseInt(e.target.value);
                setExpressionWeightVector(prev => ({
                  ...prev,
                  [v as Expression]: newValue
                }));
              }}
              className="m-2"
            />
            <span>{expressionWeightVector[v as Expression]}%</span>
          </div>
        ))}
      </div>
    </div>
      <TTSSettings
        selectedVoice={selectedVoice}
        onVoiceChange={setSelectedVoice}
        onSpeak={handleSpeak}
        message="And say something too!"
      />
      <SpokenTextDisplay
        spokenSentences={spokenSentences}
        spokenWords={spokenWords}
        spokenVisemes={spokenVisemes}
        currentSpokenVisemeIndex={currentSpokenVisemeIndex}
        spokenAudio={spokenAudio}
        onPlay={handlePlay}
      />
      <div className="flex justify-center items-center gap-20 py-4">
        <CharacterView name="Quori" rootId={quoriIDs.rootId} />
        <CharacterView name="Hugo" rootId={hugoIDs.rootId} />
      </div>
    </div>
  );
}
