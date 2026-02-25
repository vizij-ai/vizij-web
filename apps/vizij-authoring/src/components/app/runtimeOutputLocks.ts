import type { RuntimeOutputWrite } from "@vizij/runtime-react";
import type { RawValue } from "@vizij/utils";

type LockableComponent = "x" | "y" | "z" | "r" | "g" | "b";
type CanonicalComponent = "x" | "y" | "z";

const COMPONENT_KEYS: readonly LockableComponent[] = [
  "x",
  "y",
  "z",
  "r",
  "g",
  "b",
];
const COMPONENT_SUFFIX_PATTERN = /^(.*):(x|y|z|r|g|b)$/;

export interface LockedRuntimeOutputIndex {
  lockedScalarTargetIds: ReadonlySet<string>;
  lockedComponentsByAnimatableId: ReadonlyMap<
    string,
    ReadonlySet<CanonicalComponent>
  >;
}

function canonicalComponent(component: LockableComponent): CanonicalComponent {
  if (component === "x" || component === "r") {
    return "x";
  }
  if (component === "y" || component === "g") {
    return "y";
  }
  return "z";
}

function aliasKeysForCanonical(
  component: CanonicalComponent,
): readonly LockableComponent[] {
  switch (component) {
    case "x":
      return ["x", "r"] as const;
    case "y":
      return ["y", "g"] as const;
    case "z":
      return ["z", "b"] as const;
    default:
      return [component];
  }
}

function parseComponentTargetId(targetId: string): {
  animatableId: string;
  component: LockableComponent;
  canonicalComponent: CanonicalComponent;
} | null {
  const match = targetId.match(COMPONENT_SUFFIX_PATTERN);
  if (!match || match.length < 3) {
    return null;
  }
  const animatableId = match[1]?.trim() ?? "";
  const component = match[2] as LockableComponent;
  if (!animatableId) {
    return null;
  }
  return {
    animatableId,
    component,
    canonicalComponent: canonicalComponent(component),
  };
}

export function buildLockedRuntimeOutputIndex(
  lockedTargetIds: ReadonlySet<string>,
): LockedRuntimeOutputIndex {
  const lockedScalarTargetIds = new Set<string>();
  const lockedComponentsByAnimatableId = new Map<
    string,
    Set<CanonicalComponent>
  >();

  lockedTargetIds.forEach((targetId) => {
    const normalized = targetId.trim();
    if (!normalized) {
      return;
    }
    const parsed = parseComponentTargetId(normalized);
    if (!parsed) {
      lockedScalarTargetIds.add(normalized);
      return;
    }
    const existing = lockedComponentsByAnimatableId.get(parsed.animatableId);
    if (existing) {
      existing.add(parsed.canonicalComponent);
      return;
    }
    lockedComponentsByAnimatableId.set(
      parsed.animatableId,
      new Set([parsed.canonicalComponent]),
    );
  });

  return {
    lockedScalarTargetIds,
    lockedComponentsByAnimatableId,
  };
}

function isRawObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectPresentComponentKeys(
  value: Record<string, unknown>,
): CanonicalComponent[] {
  const present = new Set<CanonicalComponent>();
  COMPONENT_KEYS.forEach((key) => {
    const componentValue = value[key];
    if (typeof componentValue === "number" && Number.isFinite(componentValue)) {
      present.add(canonicalComponent(key));
    }
  });
  return Array.from(present);
}

function resolveCanonicalComponentValue(
  value: Record<string, unknown>,
  component: CanonicalComponent,
): number | null {
  const aliases = aliasKeysForCanonical(component);
  for (const key of aliases) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function applyLockedRuntimeOutputWrite(
  write: RuntimeOutputWrite,
  index: LockedRuntimeOutputIndex,
): RuntimeOutputWrite | null {
  if (index.lockedScalarTargetIds.has(write.id)) {
    return null;
  }

  const componentTarget = parseComponentTargetId(write.id);
  if (componentTarget) {
    const lockedForAnimatable = index.lockedComponentsByAnimatableId.get(
      componentTarget.animatableId,
    );
    if (lockedForAnimatable?.has(componentTarget.canonicalComponent)) {
      return null;
    }
  }

  const lockedComponents = index.lockedComponentsByAnimatableId.get(write.id);
  if (!lockedComponents || lockedComponents.size === 0) {
    return write;
  }

  const outputValue = write.value;
  if (!isRawObject(outputValue)) {
    return write;
  }

  const presentComponents = collectPresentComponentKeys(outputValue);
  if (
    presentComponents.length > 0 &&
    presentComponents.every((key) => lockedComponents.has(key))
  ) {
    return null;
  }

  const currentValue = write.currentValue ?? undefined;
  if (!isRawObject(currentValue)) {
    // Without a prior vector value to preserve the locked components from,
    // safest behavior is to block this write.
    return null;
  }

  let changed = false;
  const merged: Record<string, unknown> = Object.assign(
    {},
    outputValue as Record<string, unknown>,
  );
  lockedComponents.forEach((component) => {
    const lockedValue = resolveCanonicalComponentValue(currentValue, component);
    if (lockedValue === null) {
      return;
    }
    aliasKeysForCanonical(component).forEach((key) => {
      if (merged[key] !== lockedValue) {
        merged[key] = lockedValue;
        changed = true;
      }
    });
  });

  if (!changed) {
    return write;
  }

  return {
    ...write,
    value: merged as unknown as RawValue,
  };
}
