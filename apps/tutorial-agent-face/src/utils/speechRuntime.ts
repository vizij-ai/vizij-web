import { buildRigInputPath, type VizijAssetBundle } from "@vizij/runtime-react";

export const DEFAULT_SPEECH_TOPIC_PATHS = {
  speakingInputPath: "/speech/speaking",
  userSpeakingInputPath: "/speech/user_speaking",
  thinkingInputPath: "/speech/thinking",
} as const;

export type TutorialSpeechConfig = {
  speakingInputPath?: string;
  userSpeakingInputPath?: string;
  thinkingInputPath?: string;
  emotionGroupId?: string;
  visemeGroupId?: string;
  agentName?: string;
  voice?: string;
  systemPrompt?: string;
  mode?: "echo" | "conversation";
  autoActivateMic?: boolean;
  apiBaseUrl?: string;
};

export type SpeechTopicPaths = {
  speakingInputPath: string;
  userSpeakingInputPath: string;
  thinkingInputPath: string;
};

export type ResolvedTutorialSpeechRuntime = {
  speechConfig: TutorialSpeechConfig | null;
  activeMotionGraphId: string | null;
  speechPaths: SpeechTopicPaths;
};

type GraphLike = {
  spec?: {
    nodes?: Array<{
      type?: string;
      params?: { path?: string };
    }>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeInputPath(
  value: unknown,
  fallback: (typeof DEFAULT_SPEECH_TOPIC_PATHS)[keyof typeof DEFAULT_SPEECH_TOPIC_PATHS],
) {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function resolveSpeechConfig(
  metadata: Record<string, unknown> | null | undefined,
): TutorialSpeechConfig | null {
  if (!metadata) {
    return null;
  }
  const speechConfig = metadata.speechConfig;
  if (!isRecord(speechConfig)) {
    return null;
  }
  return speechConfig as TutorialSpeechConfig;
}

function collectGraphInputPaths(graph: GraphLike | null | undefined) {
  const paths = new Set<string>();
  const nodes = graph?.spec?.nodes;
  if (!Array.isArray(nodes)) {
    return paths;
  }

  nodes.forEach((node) => {
    if (node?.type !== "input") {
      return;
    }
    const path = node.params?.path;
    if (typeof path === "string" && path.trim().length > 0) {
      paths.add(path.trim());
    }
  });

  return paths;
}

function resolveActiveProgram(
  assetBundle: Pick<VizijAssetBundle, "programs" | "bundle">,
  activeMotionGraphId: string | null,
): GraphLike | null {
  if (!activeMotionGraphId) {
    return null;
  }

  const program = (assetBundle.programs ?? []).find(
    (entry) => entry.id === activeMotionGraphId,
  );
  if (program?.graph) {
    return program.graph;
  }

  const graphEntry = assetBundle.bundle?.graphs?.find(
    (entry) => entry.id === activeMotionGraphId,
  );
  return graphEntry ? { spec: graphEntry.spec } : null;
}

export function resolveTutorialSpeechRuntime(
  assetBundle: Pick<VizijAssetBundle, "bundle">,
): ResolvedTutorialSpeechRuntime {
  const metadata = isRecord(assetBundle.bundle?.metadata)
    ? assetBundle.bundle?.metadata
    : null;
  const speechConfig = resolveSpeechConfig(metadata);
  const activeMotionGraphId =
    typeof metadata?.activeMotionGraphId === "string" &&
    metadata.activeMotionGraphId.trim().length > 0
      ? metadata.activeMotionGraphId.trim()
      : null;

  return {
    speechConfig,
    activeMotionGraphId,
    speechPaths: {
      speakingInputPath: sanitizeInputPath(
        speechConfig?.speakingInputPath,
        DEFAULT_SPEECH_TOPIC_PATHS.speakingInputPath,
      ),
      userSpeakingInputPath: sanitizeInputPath(
        speechConfig?.userSpeakingInputPath,
        DEFAULT_SPEECH_TOPIC_PATHS.userSpeakingInputPath,
      ),
      thinkingInputPath: sanitizeInputPath(
        speechConfig?.thinkingInputPath,
        DEFAULT_SPEECH_TOPIC_PATHS.thinkingInputPath,
      ),
    },
  };
}

export function resolveActiveProgramInputPaths(
  assetBundle: Pick<VizijAssetBundle, "programs" | "bundle">,
  activeMotionGraphId: string | null,
) {
  return collectGraphInputPaths(
    resolveActiveProgram(assetBundle, activeMotionGraphId),
  );
}

export function hasGraphSpeechControl(options: {
  assetBundle: Pick<VizijAssetBundle, "programs" | "bundle">;
  activeMotionGraphId: string | null;
  faceId: string | null | undefined;
  speechPaths: SpeechTopicPaths;
}) {
  const faceId = options.faceId?.trim();
  if (!faceId || !options.activeMotionGraphId) {
    return false;
  }

  const inputPaths = resolveActiveProgramInputPaths(
    options.assetBundle,
    options.activeMotionGraphId,
  );
  const requiredPaths = [
    buildRigInputPath(faceId, options.speechPaths.speakingInputPath),
    buildRigInputPath(faceId, options.speechPaths.userSpeakingInputPath),
    buildRigInputPath(faceId, options.speechPaths.thinkingInputPath),
  ];

  return requiredPaths.every((path) => inputPaths.has(path));
}

export function shouldEnableDebugPoseFallback(options: {
  debugControlsOpen: boolean;
  hasGraphSpeechControl: boolean;
}) {
  return options.debugControlsOpen || !options.hasGraphSpeechControl;
}

export function resolveVisiblePrograms(
  assetBundle: Pick<VizijAssetBundle, "programs" | "bundle">,
) {
  if (Array.isArray(assetBundle.programs) && assetBundle.programs.length > 0) {
    return assetBundle.programs;
  }

  return (assetBundle.bundle?.graphs ?? [])
    .filter(
      (entry) =>
        Boolean(entry) &&
        typeof entry.id === "string" &&
        typeof entry.kind === "string" &&
        entry.kind.toLowerCase() === "motiongraph",
    )
    .map((entry) => ({
      id: entry.id,
      label: entry.label ?? entry.id,
      graph: {
        id: entry.id,
        spec: entry.spec,
      },
    }));
}
