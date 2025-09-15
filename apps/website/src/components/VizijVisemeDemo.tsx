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

export function VizijVisemeDemo() {
  const visemeDemoStore = useMemo(() => createVizijStore(), []);

  return (
    <VizijContext.Provider value={visemeDemoStore}>
      <AnimationProvider
        animations={[]}
        autostart={false}
        prebind={(path) => path}
      >
        <InnerVizijVisemeDemo />
      </AnimationProvider>
    </VizijContext.Provider>
  );
}

export function InnerVizijVisemeDemo() {
  const [selectedVoice, setSelectedVoice] = useState<string>("Ruth");
  const [currentSpokenVisemeIndex, setCurrentSpokenVisemeIndex] =
    useState<number>(0);
  const [selectedViseme, setSelectedViseme] = useState<Viseme>("sil");
  const [isPlaying, setIsPlaying] = useState(false);
  const createdPlayerRef = useRef(false);

  const {
    ready,
    players,
    step,
    addAnimations,
    addPlayer,
    addInstances,
    listInstances,
    removeInstances,
    getPlayerKeySnapshot,
  } = useAnimation();
  const visemePid = players["visemePlayer"];

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
  const lastVisemesKeyRef = useRef<string | null>(null);

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

  const currentPlayerId = visemePid ?? "visemePlayer";
  const scaleX = valueAsNumber(usePlayerValue(currentPlayerId, "X"));
  const scaleY = valueAsNumber(usePlayerValue(currentPlayerId, "Y"));
  const mouthMorph = valueAsNumber(usePlayerValue(currentPlayerId, "Morph"));

  useEffect(() => {
    if (
      quoriIDs.scaleId &&
      hugoIDs.scaleId &&
      scaleX !== undefined &&
      scaleY !== undefined
    ) {
      setVal(quoriIDs.scaleId, "default", { x: scaleX, y: scaleY, z: 1 });
      setVal(hugoIDs.scaleId, "default", { x: scaleX, y: scaleY, z: 1 });
    }
  }, [scaleX, scaleY, quoriIDs.scaleId, hugoIDs.scaleId, setVal]);

  useEffect(() => {
    if (quoriIDs.morphId && hugoIDs.morphId && mouthMorph !== undefined) {
      setVal(quoriIDs.morphId, "default", mouthMorph);
      setVal(hugoIDs.morphId, "default", mouthMorph);
    }
  }, [mouthMorph, quoriIDs.morphId, hugoIDs.morphId, setVal]);

  useEffect(() => {
    if (!ready || createdPlayerRef.current) return;
    if (players["visemePlayer"] !== undefined) {
      createdPlayerRef.current = true;
      return;
    }
    const pid = addPlayer("visemePlayer");
    if (pid >= 0) {
      createdPlayerRef.current = true;
    }
  }, [ready, players, addPlayer]);

  useEffect(() => {
    if (visemePid === undefined || visemePid < 0) return;

    const { x, y, morph } = visemeMapper[selectedViseme];
    const transitionDuration = 100;

    const currentX = valueAsNumber(getPlayerKeySnapshot(visemePid, "X")) ?? 1;
    const currentY = valueAsNumber(getPlayerKeySnapshot(visemePid, "Y")) ?? 1;
    const currentMorph =
      valueAsNumber(getPlayerKeySnapshot(visemePid, "Morph")) ?? 0;

    const animation = {
      id: `viseme-transition-${selectedViseme}`,
      name: `Transition to ${selectedViseme}`,
      duration: transitionDuration,
      groups: {},
      tracks: [
        {
          id: "X",
          name: "X",
          animatableId: "X",
          points: [
            { id: "p1", stamp: 0.0, value: currentX },
            { id: "p2", stamp: 1.0, value: x },
          ],
        },
        {
          id: "Y",
          name: "Y",
          animatableId: "Y",
          points: [
            { id: "p1", stamp: 0.0, value: currentY },
            { id: "p2", stamp: 1.0, value: y },
          ],
        },
        {
          id: "Morph",
          name: "Morph",
          animatableId: "Morph",
          points: [
            { id: "p1", stamp: 0.0, value: currentMorph },
            { id: "p2", stamp: 1.0, value: morph },
          ],
        },
      ],
    };

    const existingInstances = listInstances(visemePid) as { id: number }[];
    if (existingInstances.length > 0) {
      removeInstances(
        existingInstances.map((inst) => ({
          playerName: "visemePlayer",
          instId: inst.id,
        })),
      );
    }

    const [animId] = addAnimations([animation]);
    addInstances([{ playerName: "visemePlayer", animIndexOrId: animId }]);

    step(0, { player_cmds: [{ Play: { player: visemePid } }] });
  }, [
    addAnimations,
    addInstances,
    getPlayerKeySnapshot,
    listInstances,
    removeInstances,
    selectedViseme,
    step,
    visemePid,
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
    if (!ready) return;
    if (visemePid === undefined || visemePid < 0) return;
    if (spokenVisemes.length === 0) return;

    const key = JSON.stringify(spokenVisemes);
    if (lastVisemesKeyRef.current === key) return;
    lastVisemesKeyRef.current = key;

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

    if (!(Number.isFinite(duration) && duration > 0)) return;

    const createPoints = (key: "scaleX" | "scaleY" | "morph") =>
      timedSetVals.map((v) => ({
        id: crypto.randomUUID(),
        stamp: v.time / duration,
        value: v[key],
      }));

    const tracks = [
      { id: "X", name: "X", points: createPoints("scaleX"), animatableId: "X" },
      { id: "Y", name: "Y", points: createPoints("scaleY"), animatableId: "Y" },
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
      tracks: tracks,
      groups: {},
      duration: duration,
    };

    const existingInstances = listInstances(visemePid) as { id: number }[];
    if (existingInstances.length > 0) {
      removeInstances(
        existingInstances.map((inst) => ({
          playerName: "visemePlayer",
          instId: inst.id,
        })),
      );
    }

    const [animId] = addAnimations([animation]);
    addInstances([{ playerName: "visemePlayer", animIndexOrId: animId }]);
  }, [
    spokenVisemes,
    ready,
    visemePid,
    listInstances,
    addAnimations,
    addInstances,
    removeInstances,
  ]);

  const handlePlay = () => {
    spokenVisemes.forEach((v, ind) => {
      setTimeout(() => {
        if (Object.keys(visemeMapper).includes(v.value)) {
          setCurrentSpokenVisemeIndex(ind);
        }
      }, v.time);
    });
    if (visemePid === undefined || visemePid < 0) return;
    step(0, {
      player_cmds: [
        { Seek: { player: visemePid, time: 0 } },
        { Play: { player: visemePid } },
      ],
    });
    setIsPlaying(true);
  };

  return (
    <div className="my-8">
      <div>
        <h4>Select Viseme</h4>
        <div>
          {Object.keys(visemeMapper).map((v) => (
            <button
              className={
                "m-2 p-2 border border-white cursor-pointer rounded-md hover:bg-gray-800 " +
                (selectedViseme === v ? " bg-gray-700" : "")
              }
              key={v}
              value={v}
              onClick={() => setSelectedViseme(v as Viseme)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <TTSSettings
        selectedVoice={selectedVoice}
        onVoiceChange={setSelectedVoice}
        onSpeak={handleSpeak}
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
