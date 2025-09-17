import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Hugo from "../assets/Hugo.glb";
import Quori from "../assets/Quori.glb";
import {
  AnimationProvider,
  useAnimation,
  valueAsNumber,
  Value,
} from "@vizij/animation-react";
import { createVizijStore, VizijContext } from "vizij";
import {
  Viseme,
  visemeMapper,
  VizijStandardControlVector,
  Pose,
  HugoLowLevelRig,
  QuoriLowLevelRig,
} from "@vizij/config";
import { useRiggedModelLoader } from "@vizij/rig";
import { usePollyTTS } from "../hooks/usePollyTTS";
import { TTSSettings } from "./viseme-demo/TTSSettings";
import { SpokenTextDisplay } from "./viseme-demo/SpokenTextDisplay";
import { CharacterView } from "./viseme-demo/CharacterView";

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
  } = useAnimation();
  const visemePid = players["visemePlayer"];

  const { rig: hugoRig } = useRiggedModelLoader(Hugo, HugoLowLevelRig);
  const { rig: quoriRig } = useRiggedModelLoader(Quori, QuoriLowLevelRig);

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

  const lastVisemesKeyRef = useRef<string | null>(null);

  // Playback controller: audio master clock drives animation via Seek
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [usePlayerForPose, setUsePlayerForPose] = useState(false);

  const seekAnimToMs = useCallback(
    (ms: number) => {
      if (!ready) return;
      if (visemePid === undefined || visemePid < 0) return;
      step(0, { player_cmds: [{ Seek: { player: visemePid, time: ms } }] });
    },
    [ready, visemePid, step],
  );

  const updateIndexFromMs = useCallback(
    (ms: number) => {
      if (spokenVisemes.length === 0) {
        setCurrentSpokenVisemeIndex(0);
        return;
      }
      let idx = 0;
      for (let i = 0; i < spokenVisemes.length; i++) {
        if (spokenVisemes[i].time <= ms) idx = i;
        else break;
      }
      setCurrentSpokenVisemeIndex(idx);
    },
    [spokenVisemes],
  );

  const frame = useCallback(() => {
    if (!audioRef.current) {
      rafRef.current = requestAnimationFrame(frame);
      return;
    }
    const tMs = audioRef.current.currentTime || 0;
    seekAnimToMs(tMs);
    updateIndexFromMs(tMs);
    rafRef.current = requestAnimationFrame(frame);
  }, [seekAnimToMs, updateIndexFromMs]);

  const startRAF = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(frame);
  }, [frame]);

  const stopRAF = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const handleAudioRef = useCallback((el: HTMLAudioElement | null) => {
    audioRef.current = el;
  }, []);

  const handleAudioPlay = useCallback(() => {
    setIsPlaying(true);
    setUsePlayerForPose(true);
    startRAF();
  }, [startRAF]);

  const handleAudioPause = useCallback(() => {
    setIsPlaying(false);
    stopRAF();
  }, [stopRAF]);

  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false);
    stopRAF();
    setUsePlayerForPose(false);
  }, [stopRAF]);

  const handleAudioTimeUpdate = useCallback(
    (tSec: number) => {
      if (isPlaying) return;
      const ms = Math.max(0, tSec * 1000);
      seekAnimToMs(ms);
      updateIndexFromMs(ms);
      setUsePlayerForPose(true);
    },
    [isPlaying, seekAnimToMs, updateIndexFromMs],
  );

  const handleAudioSeeked = useCallback(
    (tSec: number) => {
      const ms = Math.max(0, tSec * 1000);
      seekAnimToMs(ms);
      updateIndexFromMs(ms);
      setUsePlayerForPose(true);
    },
    [seekAnimToMs, updateIndexFromMs],
  );

  const currentPlayerId = visemePid ?? "visemePlayer";
  const scaleX = valueAsNumber(usePlayerValue(currentPlayerId, "X"));
  const scaleY = valueAsNumber(usePlayerValue(currentPlayerId, "Y"));
  const mouthMorph = valueAsNumber(usePlayerValue(currentPlayerId, "Morph"));

  const lastAppliedRef = useRef<{ x: number; y: number; morph: number } | null>(
    null,
  );

  useEffect(() => {
    if (!hugoRig || !quoriRig) return;
    const preview = visemeMapper[selectedViseme];
    const next = usePlayerForPose
      ? {
          x: scaleX ?? 1,
          y: scaleY ?? 1,
          morph: mouthMorph ?? 0,
        }
      : {
          x: preview.x_scale,
          y: preview.y_scale,
          morph: preview.morph,
        };
    const last = lastAppliedRef.current;
    if (
      last &&
      last.x === next.x &&
      last.y === next.y &&
      last.morph === next.morph
    ) {
      return;
    }
    lastAppliedRef.current = next;
    const pose = Pose.createWith(VizijStandardControlVector, {
      "mouth.x_scale": next.x,
      "mouth.y_scale": next.y,
      "mouth.morph": next.morph,
    });
    hugoRig.apply(pose);
    quoriRig.apply(pose);
  }, [
    hugoRig,
    quoriRig,
    scaleX,
    scaleY,
    mouthMorph,
    selectedViseme,
    usePlayerForPose,
  ]);

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
    // stop playback and reset
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    stopRAF();
    setIsPlaying(false);
    setUsePlayerForPose(false);
    setCurrentSpokenVisemeIndex(0);
    if (visemePid !== undefined && visemePid >= 0) {
      step(0, { player_cmds: [{ Seek: { player: visemePid, time: 0 } }] });
    }

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
    visemePid,
    step,
    stopRAF,
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
        scaleX: lookup.x_scale,
        scaleY: lookup.y_scale,
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
    console.log("Added animation", animation);
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
              onClick={() => {
                setSelectedViseme(v as Viseme);
                setUsePlayerForPose(false);
                if (audioRef.current) {
                  try {
                    audioRef.current.pause();
                  } catch {
                    /* ignore */
                  }
                }
              }}
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
        onPlay={handleAudioPlay}
        onPause={handleAudioPause}
        onEnded={handleAudioEnded}
        onTimeUpdate={handleAudioTimeUpdate}
        onSeeked={handleAudioSeeked}
        onAudioRef={handleAudioRef}
      />
      <div className="flex justify-center items-center gap-20 py-4">
        <CharacterView name="Quori" rootId={quoriRig?.rootId ?? ""} />
        <CharacterView name="Hugo" rootId={hugoRig?.rootId ?? ""} />
      </div>
    </div>
  );
}
