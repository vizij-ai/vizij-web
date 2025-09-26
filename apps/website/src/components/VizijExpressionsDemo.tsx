import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Hugo from "../assets/Hugo.glb";
import Quori from "../assets/Quori.glb";
import {
  AnimationProvider,
  useAnimation,
  valueAsNumber,
} from "@vizij/animation-react";
import { createVizijStore, VizijContext } from "@vizij/render";
import {
  Viseme,
  visemeMapper,
  Expression,
  expressionMapper,
  expressionPoses,
  VizijStandardControlVector,
  Pose,
  VizijLowRig,
  HugoLowLevelRig,
  QuoriLowLevelRig,
} from "@vizij/config";
import { useRiggedModelLoader } from "@vizij/rig";
import { usePollyTTS } from "../hooks/usePollyTTS";
import { TTSSettings } from "./viseme-demo/TTSSettings";
import { SpokenTextDisplay } from "./viseme-demo/SpokenTextDisplay";
import { CharacterView } from "./viseme-demo/CharacterView";
import { useBlendTree } from "./viseme-demo/BlendTree";
import { usePlayerValue } from "../hooks/usePlayerValue";

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
  const debug = false;

  const [expressionWeights, setExpressionWeightVector] = useState<
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

  const neutralPose = expressionPoses.neutral;

  const { rig: hugoRig, isLoading: hugoLoading } = useRiggedModelLoader(
    Hugo,
    HugoLowLevelRig,
  );
  const { rig: quoriRig, isLoading: quoriLoading } = useRiggedModelLoader(
    Quori,
    QuoriLowLevelRig,
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

  const {
    step,
    addAnimations,
    addPlayer,
    addInstances,
    listInstances,
    removeInstances,
    players,
    ready,
  } = useAnimation();

  const rafRef = useRef<number>();
  const lastTimeRef = useRef<number>(performance.now());
  const lastVisemesKeyRef = useRef<string | null>(null);
  const animationDurationRef = useRef<number>(0);
  const stopTimeoutRef = useRef<number>();

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
    } else if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, animationLoop]);

  useEffect(() => {
    return () => {
      if (stopTimeoutRef.current) {
        clearTimeout(stopTimeoutRef.current);
      }
    };
  }, []);

  const currentPlayerId = activePlayerId ?? "expressionPlayer";
  const visemeScaleXVal =
    valueAsNumber(usePlayerValue(currentPlayerId, "X")) ?? 1;
  const visemeScaleYVal =
    valueAsNumber(usePlayerValue(currentPlayerId, "Y")) ?? 1;
  const visemeMouthMorphVal =
    valueAsNumber(usePlayerValue(currentPlayerId, "Morph")) ?? 0;

  const visemePose = useMemo(
    () =>
      Pose.createWith(VizijStandardControlVector, {
        "mouth.x_scale": visemeScaleXVal,
        "mouth.y_scale": visemeScaleYVal,
        "mouth.morph": visemeMouthMorphVal,
      }),
    [visemeScaleXVal, visemeScaleYVal, visemeMouthMorphVal],
  );

  const inputPoses = useMemo(() => {
    const res = Object.entries(expressionWeights)
      .filter((expressionWeight) => expressionWeight[1] > 0)
      // .filter(([_, weight]) => weight > 0)
      .map(([expression, weight]) => ({
        pose: expressionPoses[expression as Expression],
        weight,
      }));

    if (debug) {
      console.log("Input changed::", res);
    }
    return res;
  }, [expressionWeights, debug]);

  const outputRigs: VizijLowRig[] = useMemo(() => {
    if (!quoriRig || !hugoRig) return [];
    return [quoriRig, hugoRig];
  }, [quoriRig, hugoRig]);

  useBlendTree({
    inputPoses,
    neutralPose,
    visemePose,
    outputRigs,
    debug,
  });

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

  useEffect(() => {
    if (!ready) return;
    if (activePlayerId !== null) return;
    const existingPlayer = players["expressionPlayer"];
    if (existingPlayer !== undefined) {
      setActivePlayerId(existingPlayer);
      return;
    }
    const pid = addPlayer("expressionPlayer");
    if (pid >= 0) {
      setActivePlayerId(pid);
    }
  }, [ready, players, addPlayer, activePlayerId]);

  const handleSpeak = async (text: string) => {
    await getTTSData(text, selectedVoice);
  };

  useEffect(() => {
    if (!ready) return;
    if (spokenVisemes.length === 0) return;

    const key = JSON.stringify(spokenVisemes);
    if (lastVisemesKeyRef.current === key) return;
    lastVisemesKeyRef.current = key;

    type TimedSetValue = {
      time: number;
      scaleX: number;
      scaleY: number;
      morph: number;
    };

    const timedSetVals = spokenVisemes.map<TimedSetValue>((v) => {
      const lookup = visemeMapper[v.value as Viseme];
      return {
        time: v.time,
        scaleX: lookup.x_scale,
        scaleY: lookup.y_scale,
        morph: lookup.morph,
      };
    });

    if (timedSetVals.length === 0) {
      return;
    }

    const finalViz = timedSetVals.reduce<TimedSetValue>(
      (prev, current) => (prev.time > current.time ? prev : current),
      timedSetVals[0],
    );
    const duration = finalViz.time;
    if (!(Number.isFinite(duration) && duration > 0)) return;

    animationDurationRef.current = duration;

    type TrackKey = "scaleX" | "scaleY" | "morph";
    type TrackPoint = { id: string; stamp: number; value: number };

    const createPoints = (key: TrackKey): TrackPoint[] =>
      timedSetVals.map((v) => ({
        id: crypto.randomUUID(),
        stamp: v.time / duration,
        value: v[key],
      }));

    const animation = {
      id: "expression-viseme",
      name: "Speak",
      tracks: [
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
      ],
      groups: {},
      duration,
      meta: { transitionType },
    };

    if (activePlayerId === null) return;

    const existingInstances = listInstances(activePlayerId) as { id: number }[];
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
  }, [
    spokenVisemes,
    transitionType,
    addAnimations,
    addInstances,
    listInstances,
    removeInstances,
    ready,
    activePlayerId,
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
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current);
    }
    if (animationDurationRef.current > 0) {
      const timeout = Math.max(0, animationDurationRef.current - vizemeOffset);
      stopTimeoutRef.current = window.setTimeout(
        () => setIsPlaying(false),
        timeout,
      );
    }
  };

  if (hugoLoading || quoriLoading || !hugoRig || !quoriRig) {
    return <div>Loading models...</div>;
  }

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
                value={expressionWeights[v as Expression] * 100}
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
                {Math.round(expressionWeights[v as Expression] * 100)}%
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
        playControlOnly={true}
      />

      <div className="flex justify-center items-center gap-20 py-6">
        <CharacterView name="Quori" rootId={quoriRig.rootId} />
        <CharacterView name="Hugo" rootId={hugoRig.rootId} />
      </div>
    </div>
  );
}
