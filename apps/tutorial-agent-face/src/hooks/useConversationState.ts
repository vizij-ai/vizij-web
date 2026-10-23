import { useEffect } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";

export type ConversationState = {
  speaking: boolean;
  userSpeaking: boolean;
  thinking: boolean;
};

const KEYS = {
  speaking: "standard/vizij/conversation/speaking",
  userSpeaking: "standard/vizij/conversation/user_speaking",
  thinking: "standard/vizij/conversation/thinking",
} as const;

/**
 * Write the conversation's state to the face standard's conversation keys,
 * 1 or 0 each: the face's program reacts to who is speaking and whether the
 * agent is thinking. Everything goes back to 0 when the hook stops.
 */
export function useConversationState(
  enabled: boolean,
  state: ConversationState,
) {
  const { runtime } = useVizijRuntime();
  const { speaking, userSpeaking, thinking } = state;

  useEffect(() => {
    if (!runtime || !enabled) return;
    const write = (values: ConversationState) =>
      runtime.writeValues({
        [runtime.path(KEYS.speaking)]: values.speaking ? 1 : 0,
        [runtime.path(KEYS.userSpeaking)]: values.userSpeaking ? 1 : 0,
        [runtime.path(KEYS.thinking)]: values.thinking ? 1 : 0,
      });
    write({ speaking, userSpeaking, thinking });
    return () =>
      write({ speaking: false, userSpeaking: false, thinking: false });
  }, [enabled, runtime, speaking, thinking, userSpeaking]);
}
