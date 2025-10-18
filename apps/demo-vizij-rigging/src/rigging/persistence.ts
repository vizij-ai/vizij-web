import type {
  EmotionDefinition,
  LowLevelRigSummary,
  RigConfigFile,
} from "./types";

export const RIG_CONFIG_VERSION = 1;

export function cloneEmotionDefinition(
  emotion: EmotionDefinition,
): EmotionDefinition {
  return {
    ...emotion,
    values: { ...emotion.values },
  };
}

export function buildRigConfig(options: {
  faceId: string | null;
  neutralInputs: Record<string, number>;
  emotions: EmotionDefinition[];
  lowLevel?: LowLevelRigSummary | null;
  previous?: RigConfigFile | null;
  title?: string;
  description?: string;
}): RigConfigFile {
  const {
    faceId,
    neutralInputs,
    emotions,
    lowLevel,
    previous,
    title,
    description,
  } = options;
  const now = new Date().toISOString();
  return {
    version: RIG_CONFIG_VERSION,
    faceId,
    title: title ?? previous?.title,
    description: description ?? previous?.description,
    neutralInputs: { ...neutralInputs },
    emotions: emotions.map(cloneEmotionDefinition),
    lowLevel: lowLevel ?? previous?.lowLevel ?? null,
    metadata: {
      createdAt: previous?.metadata?.createdAt ?? now,
      updatedAt: now,
      author: previous?.metadata?.author,
    },
  };
}

export function parseRigConfig(payload: unknown): RigConfigFile {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid rig config payload.");
  }
  const candidate = payload as Partial<RigConfigFile>;
  if (candidate.version !== RIG_CONFIG_VERSION) {
    throw new Error(
      `Unsupported rig config version: ${candidate.version ?? "unknown"}.`,
    );
  }
  if (!Array.isArray(candidate.emotions)) {
    throw new Error("Rig config missing emotion definitions.");
  }
  if (!candidate.neutralInputs || typeof candidate.neutralInputs !== "object") {
    throw new Error("Rig config missing neutral inputs.");
  }
  return {
    version: RIG_CONFIG_VERSION,
    faceId: candidate.faceId ?? null,
    title: candidate.title ?? undefined,
    description: candidate.description ?? undefined,
    neutralInputs: { ...(candidate.neutralInputs as Record<string, number>) },
    emotions: candidate.emotions.map((emotion) =>
      cloneEmotionDefinition(emotion),
    ),
    lowLevel:
      (candidate.lowLevel as LowLevelRigSummary | null | undefined) ?? null,
    metadata: candidate.metadata
      ? { ...candidate.metadata }
      : {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
  };
}

export function diffLowLevelSummaries(
  reference: LowLevelRigSummary | null,
  target: LowLevelRigSummary | null,
): string[] {
  if (!reference || !target) {
    return ["Missing low-level summary for comparison."];
  }
  const issues: string[] = [];
  if (reference.faceId !== target.faceId) {
    issues.push(
      `Face mismatch: config uses "${reference.faceId}", current face "${target.faceId}".`,
    );
  }

  const refInputs = new Set(
    reference.bindings.map((binding) => binding.inputId),
  );
  const targetInputs = new Set(
    target.bindings.map((binding) => binding.inputId),
  );
  refInputs.forEach((inputId) => {
    if (!inputId) {
      return;
    }
    if (!targetInputs.has(inputId)) {
      issues.push(`Input ${inputId} missing in current low-level rig.`);
    }
  });

  const refAnimIds = new Set(
    reference.bindings.map((binding) => binding.animatableId),
  );
  const targetAnimIds = new Set(
    target.bindings.map((binding) => binding.animatableId),
  );
  refAnimIds.forEach((animId) => {
    if (!targetAnimIds.has(animId)) {
      issues.push(
        `Animatable ${animId} referenced in config not found in current asset.`,
      );
    }
  });

  return issues;
}
