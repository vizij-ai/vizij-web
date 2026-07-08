export type GeminiSpeechState = {
  userSpeaking: boolean;
  thinking: boolean;
  modelSpeaking: boolean;
  awaitingModelResponse: boolean;
  hasObservedUserTurn: boolean;
};

export type GeminiSpeechEvent =
  | { type: "reset" }
  | { type: "user-turn-observed" }
  | { type: "user-speaking-start" }
  | { type: "user-speaking-stop" }
  | { type: "model-turn-start" }
  | { type: "model-turn-end" }
  | { type: "model-interrupted" };

export function createInitialGeminiSpeechState(): GeminiSpeechState {
  return {
    userSpeaking: false,
    thinking: false,
    modelSpeaking: false,
    awaitingModelResponse: false,
    hasObservedUserTurn: false,
  };
}

export function transitionGeminiSpeechState(
  state: GeminiSpeechState,
  event: GeminiSpeechEvent,
): GeminiSpeechState {
  switch (event.type) {
    case "reset":
      return createInitialGeminiSpeechState();
    case "user-turn-observed":
      return {
        ...state,
        awaitingModelResponse: true,
        hasObservedUserTurn: true,
        thinking: state.userSpeaking || state.modelSpeaking ? false : true,
      };
    case "user-speaking-start":
      return {
        ...state,
        userSpeaking: true,
        thinking: false,
        awaitingModelResponse: true,
        hasObservedUserTurn: true,
      };
    case "user-speaking-stop":
      return {
        ...state,
        userSpeaking: false,
        thinking:
          state.awaitingModelResponse &&
          state.hasObservedUserTurn &&
          !state.modelSpeaking,
      };
    case "model-turn-start":
      return {
        ...state,
        userSpeaking: false,
        thinking: false,
        modelSpeaking: true,
        awaitingModelResponse: false,
      };
    case "model-turn-end":
    case "model-interrupted":
      return {
        ...state,
        thinking: false,
        modelSpeaking: false,
        awaitingModelResponse: false,
        hasObservedUserTurn: false,
      };
    default:
      return state;
  }
}
