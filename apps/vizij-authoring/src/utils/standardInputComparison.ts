import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";

export type StandardInputBindingStatus = "missing" | "unbound" | "bound";

interface StandardInputFaceContext {
  inputsByPath: Map<string, StandardRigInput>;
  inputIdsWithBindings: Set<string>;
  isLoaded: boolean;
}

interface StandardInputFacePresence {
  input: StandardRigInput | null;
  exists: boolean;
  hasBinding: boolean;
  status: StandardInputBindingStatus;
}

export interface StandardInputPresence {
  normalizedPath: string;
  reference: StandardInputFacePresence;
  main: StandardInputFacePresence;
}

function describeFacePresence(
  normalizedPath: string,
  context: StandardInputFaceContext,
): StandardInputFacePresence {
  const input = context.inputsByPath.get(normalizedPath) ?? null;
  const exists = context.isLoaded && Boolean(input);
  const hasBinding =
    exists && Boolean(input && context.inputIdsWithBindings.has(input.id));

  return {
    input,
    exists,
    hasBinding,
    status: !exists ? "missing" : hasBinding ? "bound" : "unbound",
  };
}

export function describeStandardInputPresence(
  path: string,
  context: {
    reference: StandardInputFaceContext;
    main: StandardInputFaceContext;
  },
): StandardInputPresence {
  const normalizedPath = normalizeStandardRigInputPath(path);

  return {
    normalizedPath,
    reference: describeFacePresence(normalizedPath, context.reference),
    main: describeFacePresence(normalizedPath, context.main),
  };
}
