import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Hugo from "../assets/Hugo.glb";
import Quori from "../assets/Quori.glb";
import {
  AnimationProvider,
  useAnimation,
  valueAsNumber,
  Value,
} from "@vizij/animation-react";
import { createVizijStore, useVizijStore, VizijContext } from "vizij";
import { useShallow } from "zustand/shallow";
import { Viseme, visemeMapper } from "../config/viseme";
import { Expression, expressionMapper } from "../config/expression";
import {
  HugoBounds,
  QuoriBounds,
  hugoSearch,
  quoriSearch,
} from "../config/models";
import { useModelLoader } from "../hooks/useModelLoader";
import { usePollyTTS } from "../hooks/usePollyTTS";
import { TTSSettings } from "./viseme-demo/TTSSettings";
import { SpokenTextDisplay } from "./viseme-demo/SpokenTextDisplay";
import { CharacterView } from "./viseme-demo/CharacterView";

const hugoInitialVals = [
  {
    name: "Black_S",
    value: { r: 0, g: 0, b: 0 },
  },
];

function usePlayerValue(
  player: number | string,
  key: string,
): Value | undefined {
  const { subscribeToPlayerKey, getPlayerKeySnapshot } = useAnimation();
  const subscribe = useCallback(
    (cb: () => void) => subscribeToPlayerKey(player, key, cb),
    [subscribeToPlayerKey, player, key],
  );
  const getSnapshot = useCallback(
    () => getPlayerKeySnapshot(player, key),
    [getPlayerKeySnapshot, player, key],
  );

  const [, setTick] = useState(0);
  useEffect(() => {
    const unsub = subscribe(() => setTick((x) => x + 1));
    return unsub;
  }, [subscribe]);

  return getSnapshot();
}

export function VizijExpressionsDemo() {
  const visemeDemoStore = useMemo(() => createVizijStore(), []);

  return (
    <VizijContext.Provider value={visemeDemoStore}>
      <AnimationProvider
        animations={[]}
        autostart={false}
        prebind={(path) => path}
      >
        <InnerVizijExpressionsDemo />
      </AnimationProvider>
    </VizijContext.Provider>
  );
}

export function InnerVizijExpressionsDemo() {
  const [selectedVoice, setSelectedVoice] = useState<string>("Ruth");
  const [currentSpokenVisemeIndex, setCurrentSpokenVisemeIndex] =
    useState<number>(0);
  const [vizemeOffset] = useState<number>(-50);
  const [transitionType] = useState<string>("cubic");
  const [isPlaying, setIsPlaying] = useState(false);
  const [activePlayerId, setActivePlayerId] = useState<number | null>(null);

  const {
    step,
    addAnimations,
    addPlayer,
    addInstances,
    listInstances,
    removeInstances,
  } = useAnimation();

  const [expressionWeightVector, setExpressionWeightVector] = useState<
    Record<Expression, number>
  >(() => {
    const initialWeights: Record<Expression, number> = {} as Record<
      Expression,
      number
    >;
    Object.keys(expressionMapper).forEach((expression) => {
      initialWeights[expression as Expression] = 0;
    });
    return initialWeights;
  });

  const setVal = useVizijStore(useShallow((state) => state.setValue));

  const hugoBoundsMemo = useMemo(() => HugoBounds, []);
  const hugoInitialValsMemo = useMemo(() => hugoInitialVals, []);
  const hugoSearchMemo = useMemo(() => hugoSearch, []);
  const quoriBoundsMemo = useMemo(() => QuoriBounds, []);
  const quoriSearchMemo = useMemo(() => quoriSearch, []);
  const emptyInitialVals = useMemo(() => [], []);

  const { rigMapping: hugoIDs } = useModelLoader(
    Hugo,
    hugoBoundsMemo,
    hugoInitialValsMemo,
    hugoSearchMemo,
  );
  const { rigMapping: quoriIDs } = useModelLoader(
    Quori,
    quoriBoundsMemo,
    emptyInitialVals,
    quoriSearchMemo,
  );

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

  const rafRef = useRef<number>();
  const lastTimeRef = useRef<number>(performance.now());

  const animationLoop = useCallback(
    (time: number) => {
      const dt = Math.max(0, (time - lastTimeRef.current) / 1000);
      step(dt);
      lastTimeRef.current = time;
      rafRef.current = requestAnimationFrame(animationLoop);
    },
    [step],
  );

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(animationLoop);
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, animationLoop]);

  const currentPlayerId = activePlayerId ?? "expressionPlayer";
  const visemeScaleX = valueAsNumber(usePlayerValue(currentPlayerId, "X"));
  const visemeScaleY = valueAsNumber(usePlayerValue(currentPlayerId, "Y"));
  const visemeMouthMorph = valueAsNumber(
    usePlayerValue(currentPlayerId, "Morph"),
  );

  useEffect(() => {
    let blendedX = 0;
    let blendedY = 0;
    let blendedMorph = 0;
    let totalWeight = 0;

    Object.entries(expressionWeightVector).forEach(([expression, weight]) => {
      if (weight > 0) {
        const expressionData = expressionMapper[expression as Expression];
        blendedX += expressionData.x * weight;
        blendedY += expressionData.y * weight;
        blendedMorph += expressionData.morph * weight;
        totalWeight += weight;
      }
    });

    if (totalWeight === 0) {
      const neutralData = expressionMapper.neutral;
      blendedX = neutralData.x;
      blendedY = neutralData.y;
      blendedMorph = neutralData.morph;
    } else {
      blendedX /= totalWeight;
      blendedY /= totalWeight;
      blendedMorph /= totalWeight;
    }

    const finalX = (blendedX + (visemeScaleX ?? 1)) / 2;
    const finalY = (blendedY + (visemeScaleY ?? 1)) / 2;
    const finalMorph = (blendedMorph + (visemeMouthMorph ?? 0)) / 2;

    if (quoriIDs.scaleId && hugoIDs.scaleId) {
      setVal(quoriIDs.scaleId, "default", { x: finalX, y: finalY, z: 1 });
      setVal(hugoIDs.scaleId, "default", { x: finalX, y: finalY, z: 1 });
    }
    if (quoriIDs.morphId && hugoIDs.morphId) {
      setVal(quoriIDs.morphId, "default", finalMorph);
      setVal(hugoIDs.morphId, "default", finalMorph);
    }
  }, [
    expressionWeightVector,
    visemeScaleX,
    visemeScaleY,
    visemeMouthMorph,
    quoriIDs.scaleId,
    hugoIDs.scaleId,
    quoriIDs.morphId,
    hugoIDs.morphId,
    setVal,
  ]);

  useEffect(() => {
    setSpokenAudio("");
    setSpokenSentences([]);
    setSpokenWords([]);
    setSpokenVisemes([]);
  }, [
    selectedVoice,
    setSpokenAudio,
    setSpokenSentences,
    setSpokenWords,
    setSpokenVisemes,
  ]);

  const handleSpeak = async (text: string) => {
    await getTTSData(text, selectedVoice);
  };

  useEffect(() => {
    if (spokenVisemes.length > 0) {
      const timedSetVals = spokenVisemes.map((v) => {
        const lookup = visemeMapper[v.value as Viseme];
        return {
          time: v.time,
          scaleX: lookup.x,
          scaleY: lookup.y,
          morph: lookup.morph,
        };
      });

      const finalViz = timedSetVals.reduce((prev, current) =>
        prev && prev.time > current.time ? prev : current,
      );
      const duration = finalViz.time;

      const createPoints = (key: "scaleX" | "scaleY" | "morph") =>
        timedSetVals.map((v) => ({
          id: crypto.randomUUID(),
          stamp: v.time / duration,
          value: v[key],
        }));

      const tracks = [
        {
          id: "X",
          name: "X",
          points: createPoints("scaleX"),
          animatableId: "X",
        },
        {
          id: "Y",
          name: "Y",
          points: createPoints("scaleY"),
          animatableId: "Y",
        },
        {
          id: "Morph",
          name: "Morph",
          points: createPoints("morph"),
          animatableId: "Morph",
        },
      ];

      const animation = {
        id: "Test Animation",
        name: "Speak",
        tracks,
        groups: {},
        duration,
      };

      const playerId = addPlayer("expressionPlayer");
      setActivePlayerId(playerId);

      const existingInstances = listInstances(playerId) as { id: number }[];
      if (existingInstances.length > 0) {
        removeInstances(
          existingInstances.map((inst) => ({
            playerName: "expressionPlayer",
            instId: inst.id,
          })),
        );
      }

      const [animId] = addAnimations([animation]);
      addInstances([{ playerName: "expressionPlayer", animIndexOrId: animId }]);
    }
  }, [
    spokenVisemes,
    transitionType,
    addAnimations,
    addPlayer,
    addInstances,
    listInstances,
    removeInstances,
  ]);

  const handlePlay = () => {
    spokenVisemes.forEach((v, ind) => {
      setTimeout(() => {
        if (Object.keys(expressionMapper).includes(v.value)) {
          setCurrentSpokenVisemeIndex(ind);
        }
      }, v.time + vizemeOffset);
    });

    if (activePlayerId === null) return;

    step(0, {
      player_cmds: [
        { Seek: { player: activePlayerId, time: vizemeOffset / -1000 } },
        { Play: { player: activePlayerId } },
      ],
    });
    setIsPlaying(true);
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
                value={expressionWeightVector[v as Expression] * 100}
                onChange={(e) => {
                  const newValue = parseInt(e.target.value) / 100;
                  setExpressionWeightVector((prev) => ({
                    ...prev,
                    [v as Expression]: newValue,
                  }));
                }}
                className="m-2"
              />
              <span>
                {Math.round(expressionWeightVector[v as Expression] * 100)}%
              </span>
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
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
      />
      <div className="flex justify-center items-center gap-20 py-4">
        <CharacterView name="Quori" rootId={quoriIDs.rootId} />
        <CharacterView name="Hugo" rootId={hugoIDs.rootId} />
      </div>
    </div>
  );
}
