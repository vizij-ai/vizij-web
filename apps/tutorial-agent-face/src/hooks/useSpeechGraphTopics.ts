import { useCallback, useEffect, useMemo } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { buildRigInputPath } from "@vizij/studio-support";
import type { SpeechTopicPaths } from "../utils/speechRuntime";

type SpeechGraphTopicValues = {
  modelSpeaking: boolean;
  userSpeaking: boolean;
  thinking: boolean;
};

export function useSpeechGraphTopics(options: {
  enabled: boolean;
  ready: boolean;
  faceId: string | null | undefined;
  speechPaths: SpeechTopicPaths;
  values: SpeechGraphTopicValues;
}) {
  const { setInput } = useVizijRuntime();
  const { enabled, ready, faceId, speechPaths, values } = options;

  const absolutePaths = useMemo(() => {
    const faceSegment = faceId?.trim() || "face";
    return {
      speaking: buildRigInputPath(faceSegment, speechPaths.speakingInputPath),
      userSpeaking: buildRigInputPath(
        faceSegment,
        speechPaths.userSpeakingInputPath,
      ),
      thinking: buildRigInputPath(faceSegment, speechPaths.thinkingInputPath),
    };
  }, [faceId, speechPaths]);

  const resetAll = useCallback(() => {
    setInput(absolutePaths.speaking, { float: 0 });
    setInput(absolutePaths.userSpeaking, { float: 0 });
    setInput(absolutePaths.thinking, { float: 0 });
  }, [absolutePaths, setInput]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!enabled) {
      resetAll();
      return;
    }

    setInput(absolutePaths.speaking, {
      float: values.modelSpeaking ? 1 : 0,
    });
    setInput(absolutePaths.userSpeaking, {
      float: values.userSpeaking ? 1 : 0,
    });
    setInput(absolutePaths.thinking, {
      float: values.thinking ? 1 : 0,
    });
  }, [absolutePaths, enabled, ready, resetAll, setInput, values]);

  useEffect(() => {
    return () => {
      if (!ready) {
        return;
      }
      resetAll();
    };
  }, [ready, resetAll]);

  return absolutePaths;
}
