export type MicrophoneSupportCode =
  | "available"
  | "insecure-context"
  | "unsupported-browser";

export const MICROPHONE_INSECURE_CONTEXT_MESSAGE =
  "Microphone input requires HTTPS or localhost. Open this app on localhost, or run the dev server with HTTPS for LAN testing.";

export const MICROPHONE_UNSUPPORTED_MESSAGE =
  "This browser does not expose microphone capture on the current page.";

export const MICROPHONE_PERMISSION_DENIED_MESSAGE = "Microphone access denied.";

export const MICROPHONE_NOT_FOUND_MESSAGE =
  "No microphone was found for this browser session.";

export class MicrophoneInputError extends Error {
  readonly code: MicrophoneSupportCode | "permission-denied" | "not-found";

  constructor(
    code: MicrophoneSupportCode | "permission-denied" | "not-found",
    message: string,
  ) {
    super(message);
    this.name = "MicrophoneInputError";
    this.code = code;
  }
}

export type MicrophoneSupport = {
  code: MicrophoneSupportCode;
  message: string | null;
  supported: boolean;
};

type MicrophoneGlobals = {
  isSecureContext?: boolean;
  navigator?: {
    mediaDevices?: {
      getUserMedia?: unknown;
    };
  };
};

export function getMicrophoneSupport(
  globals: MicrophoneGlobals = globalThis,
): MicrophoneSupport {
  const getUserMedia = globals.navigator?.mediaDevices?.getUserMedia;
  if (typeof getUserMedia === "function") {
    return {
      code: "available",
      message: null,
      supported: true,
    };
  }

  if (!globals.isSecureContext) {
    return {
      code: "insecure-context",
      message: MICROPHONE_INSECURE_CONTEXT_MESSAGE,
      supported: false,
    };
  }

  return {
    code: "unsupported-browser",
    message: MICROPHONE_UNSUPPORTED_MESSAGE,
    supported: false,
  };
}

export function assertMicrophoneSupport(
  globals: MicrophoneGlobals = globalThis,
): void {
  const support = getMicrophoneSupport(globals);
  if (support.supported) {
    return;
  }

  throw new MicrophoneInputError(
    support.code,
    support.message ?? MICROPHONE_UNSUPPORTED_MESSAGE,
  );
}

export function toMicrophoneInputError(
  error: unknown,
  globals: MicrophoneGlobals = globalThis,
): MicrophoneInputError {
  if (error instanceof MicrophoneInputError) {
    return error;
  }

  const name = error instanceof DOMException ? error.name : null;
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return new MicrophoneInputError(
      "permission-denied",
      MICROPHONE_PERMISSION_DENIED_MESSAGE,
    );
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return new MicrophoneInputError("not-found", MICROPHONE_NOT_FOUND_MESSAGE);
  }

  const support = getMicrophoneSupport(globals);
  if (!support.supported) {
    return new MicrophoneInputError(
      support.code,
      support.message ?? MICROPHONE_UNSUPPORTED_MESSAGE,
    );
  }

  return new MicrophoneInputError(
    "unsupported-browser",
    error instanceof Error ? error.message : MICROPHONE_UNSUPPORTED_MESSAGE,
  );
}
