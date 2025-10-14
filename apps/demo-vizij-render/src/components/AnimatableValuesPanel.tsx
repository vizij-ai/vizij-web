import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useVizijStore, useVizijStoreSetter } from "@vizij/render";
import {
  getLookup,
  instanceOfRawEuler,
  instanceOfRawRGB,
  instanceOfRawVector3,
  RawColor,
  RawEuler,
  RawRGB,
  RawValue,
  RawVector3,
  AnimatableValue,
  AnimatableNumber,
  AnimatableVector3,
  AnimatableEuler,
  AnimatableColor,
} from "@vizij/utils";
import { formatRawValue } from "../utils/format";

const DEFAULT_NAMESPACE = "default";

const XYZ_COMPONENTS = ["x", "y", "z"] as const;
const RGB_COMPONENTS = ["r", "g", "b"] as const;
const APPROX_EQUAL_EPSILON = 1e-6;

type VectorComponent =
  | (typeof XYZ_COMPONENTS)[number]
  | (typeof RGB_COMPONENTS)[number];

type VectorDescriptorType = "vector3" | "euler" | "rgb";

type BaseFeatureEntry = {
  id: string;
  elementId: string;
  elementName: string;
  elementType: string;
  featureKey: string;
  featureLabel: string;
  animated: boolean;
  animatableId?: string;
  descriptor?: AnimatableValue;
  staticValue?: RawValue;
};

type NumberFeatureEntry = BaseFeatureEntry & {
  type: "number";
};

type VectorFeatureEntry = BaseFeatureEntry & {
  type: "vector3";
  vector: {
    descriptorType: VectorDescriptorType;
    components: readonly VectorComponent[];
  };
};

type FeatureEntry = NumberFeatureEntry | VectorFeatureEntry;

type RenderableLike = {
  id: string;
  name?: string;
  type: string;
  features?: Record<
    string,
    | undefined
    | {
        animated: boolean;
        value: any;
      }
  >;
};

type SupportedKind =
  | { type: "number" }
  | { type: "vector3"; descriptorType: VectorDescriptorType };

function cloneRawValue<T extends RawValue>(value: T): T {
  if (value && typeof value === "object") {
    return JSON.parse(JSON.stringify(value)) as T;
  }
  return value;
}

function formatFeatureLabel(key: string): string {
  if (!key) return "Feature";
  return key
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getComponentsForDescriptor(
  descriptorType: VectorDescriptorType,
): readonly VectorComponent[] {
  return descriptorType === "rgb" ? RGB_COMPONENTS : XYZ_COMPONENTS;
}

function resolveSupportedKind(
  featureKey: string,
  descriptor: AnimatableValue | undefined,
  value: RawValue | undefined,
): SupportedKind | null {
  if (descriptor) {
    if (descriptor.type === "number") {
      return { type: "number" };
    }
    if (
      descriptor.type === "vector3" ||
      descriptor.type === "euler" ||
      descriptor.type === "rgb"
    ) {
      const descriptorType =
        descriptor.type === "vector3" ? "vector3" : descriptor.type;
      if (descriptorType === "rgb") {
        return { type: "vector3", descriptorType: "rgb" };
      }
      return {
        type: "vector3",
        descriptorType: descriptorType as Exclude<VectorDescriptorType, "rgb">,
      };
    }
    return null;
  }

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "number") {
    return { type: "number" };
  }

  if (instanceOfRawRGB(value)) {
    return { type: "vector3", descriptorType: "rgb" };
  }

  if (instanceOfRawEuler(value)) {
    return { type: "vector3", descriptorType: "euler" };
  }

  if (instanceOfRawVector3(value)) {
    if (featureKey.toLowerCase().includes("rotation")) {
      return { type: "vector3", descriptorType: "euler" };
    }
    return { type: "vector3", descriptorType: "vector3" };
  }

  return null;
}

function buildFeatureEntries(
  world: Record<string, RenderableLike>,
  animatables: Record<string, AnimatableValue>,
): FeatureEntry[] {
  const entries: FeatureEntry[] = [];

  Object.values(world).forEach((renderable) => {
    const elementName = renderable.name || renderable.id;
    if (!renderable.features) {
      return;
    }

    Object.entries(renderable.features).forEach(([featureKey, feature]) => {
      if (!feature) {
        return;
      }

      if (feature.animated) {
        const descriptor = animatables[feature.value];
        if (!descriptor) {
          return;
        }
        const supported = resolveSupportedKind(
          featureKey,
          descriptor,
          descriptor.default as RawValue,
        );
        if (!supported) {
          return;
        }
        if (supported.type === "number") {
          entries.push({
            id: `${renderable.id}:${featureKey}`,
            elementId: renderable.id,
            elementName,
            elementType: renderable.type,
            featureKey,
            featureLabel: formatFeatureLabel(featureKey),
            animated: true,
            animatableId: feature.value,
            descriptor,
            type: "number",
          });
          return;
        }
        entries.push({
          id: `${renderable.id}:${featureKey}`,
          elementId: renderable.id,
          elementName,
          elementType: renderable.type,
          featureKey,
          featureLabel: formatFeatureLabel(featureKey),
          animated: true,
          animatableId: feature.value,
          descriptor,
          type: "vector3",
          vector: {
            descriptorType: supported.descriptorType,
            components: getComponentsForDescriptor(supported.descriptorType),
          },
        });
        return;
      }

      const supported = resolveSupportedKind(
        featureKey,
        undefined,
        feature.value,
      );
      if (!supported) {
        return;
      }
      if (supported.type === "number") {
        entries.push({
          id: `${renderable.id}:${featureKey}`,
          elementId: renderable.id,
          elementName,
          elementType: renderable.type,
          featureKey,
          featureLabel: formatFeatureLabel(featureKey),
          animated: false,
          staticValue: feature.value,
          type: "number",
        });
        return;
      }
      entries.push({
        id: `${renderable.id}:${featureKey}`,
        elementId: renderable.id,
        elementName,
        elementType: renderable.type,
        featureKey,
        featureLabel: formatFeatureLabel(featureKey),
        animated: false,
        staticValue: feature.value,
        type: "vector3",
        vector: {
          descriptorType: supported.descriptorType,
          components: getComponentsForDescriptor(supported.descriptorType),
        },
      });
    });
  });

  return entries.sort((a, b) => {
    if (a.elementName === b.elementName) {
      return a.featureLabel.localeCompare(b.featureLabel);
    }
    return a.elementName.localeCompare(b.elementName);
  });
}

function computeTranslationBounds(componentValue: number): [number, number] {
  if (Math.abs(componentValue) < 1e-4) {
    return [-1, 1];
  }
  if (componentValue >= 0) {
    return [0, componentValue * 2];
  }
  return [componentValue * 2, 0];
}

function computeScaleBounds(componentValue: number): [number, number] {
  let min = 0;
  let max = 2;
  if (componentValue < min) {
    min = componentValue;
  }
  if (componentValue > max) {
    max = componentValue;
  }
  return [min, max];
}

function computeNumberBounds(
  defaultValue: number,
  featureKey: string,
): [number, number] {
  const key = featureKey.toLowerCase();
  if (key.includes("opacity")) {
    return [0, 1];
  }
  if (key.includes("scale")) {
    return computeScaleBounds(defaultValue);
  }
  if (key.includes("rotation")) {
    return [-Math.PI, Math.PI];
  }
  if (key.includes("translation") || key.includes("position")) {
    return computeTranslationBounds(defaultValue);
  }
  if (defaultValue === 0) {
    return [0, 1];
  }
  if (defaultValue > 0) {
    return [0, defaultValue * 2];
  }
  return [defaultValue * 2, 0];
}

function isApproximatelyEqual(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  if (
    a === null ||
    b === null ||
    a === undefined ||
    b === undefined ||
    Number.isNaN(a) ||
    Number.isNaN(b)
  ) {
    return false;
  }
  return Math.abs(a - b) < APPROX_EQUAL_EPSILON;
}

function ensureVectorValue(
  entry: VectorFeatureEntry,
  value: RawValue | undefined,
): RawVector3 | RawEuler | RawRGB {
  if (entry.vector.descriptorType === "rgb") {
    if (value && instanceOfRawRGB(value)) {
      return { r: value.r, g: value.g, b: value.b };
    }
    return { r: 0, g: 0, b: 0 };
  }

  const fallback = { x: 0, y: 0, z: 0 };
  if (value && instanceOfRawEuler(value)) {
    return { x: value.x, y: value.y, z: value.z };
  }
  if (value && instanceOfRawVector3(value)) {
    return { x: value.x, y: value.y, z: value.z };
  }
  return fallback;
}

function cloneVectorTuple(
  tuple: readonly [number | null, number | null, number | null],
): [number | null, number | null, number | null] {
  return [tuple[0], tuple[1], tuple[2]];
}

function getVectorConstraintDefaults(
  entry: VectorFeatureEntry,
  defaults: RawVector3 | RawEuler | RawRGB,
): {
  min: [number | null, number | null, number | null];
  max: [number | null, number | null, number | null];
} {
  if (entry.vector.descriptorType === "rgb") {
    return {
      min: [0, 0, 0],
      max: [1, 1, 1],
    };
  }

  if (entry.vector.descriptorType === "euler") {
    return {
      min: [-Math.PI, -Math.PI, -Math.PI],
      max: [Math.PI, Math.PI, Math.PI],
    };
  }

  const ranges = entry.vector.components.map((component) => {
    const value = (defaults as RawVector3)[component as keyof RawVector3] ?? 0;
    return computeNumberBounds(value, entry.featureKey);
  });

  return {
    min: [ranges[0][0], ranges[1][0], ranges[2][0]],
    max: [ranges[0][1], ranges[1][1], ranges[2][1]],
  };
}

function getUnitsForEntry(entry: FeatureEntry): string | undefined {
  const key = entry.featureKey.toLowerCase();
  if (entry.type === "number") {
    if (key.includes("rotation") || key.includes("angle")) {
      return "rad";
    }
    if (key.includes("translation") || key.includes("position")) {
      return "m";
    }
    return undefined;
  }

  if (entry.vector.descriptorType === "euler" || key.includes("rotation")) {
    return "rad";
  }
  if (key.includes("translation") || key.includes("position")) {
    return "m";
  }
  return undefined;
}

function buildDefaultAnimatable(
  entry: FeatureEntry,
  defaultValue: RawValue,
): AnimatableValue | null {
  const labelBase = `${entry.elementName} ${entry.featureLabel}`;

  if (entry.type === "number") {
    const numericDefault = typeof defaultValue === "number" ? defaultValue : 0;
    const [min, max] = computeNumberBounds(numericDefault, entry.featureKey);
    const units = getUnitsForEntry(entry);

    const descriptor: AnimatableNumber = {
      id: crypto.randomUUID(),
      name: labelBase,
      type: "number",
      default: numericDefault,
      constraints: {
        min,
        max,
      },
      pub: {
        public: true,
        output: labelBase,
        units,
      },
    };
    return descriptor;
  }

  const defaults = ensureVectorValue(entry, defaultValue);
  const { min, max } = getVectorConstraintDefaults(entry, defaults);
  const units = getUnitsForEntry(entry);

  if (entry.vector.descriptorType === "rgb") {
    const descriptor: AnimatableColor = {
      id: crypto.randomUUID(),
      name: labelBase,
      type: "rgb",
      default: defaults as RawColor,
      constraints: {
        min,
        max,
      },
      pub: {
        public: true,
        output: labelBase,
      },
    };
    return descriptor;
  }

  if (entry.vector.descriptorType === "euler") {
    const descriptor: AnimatableEuler = {
      id: crypto.randomUUID(),
      name: labelBase,
      type: "euler",
      default: defaults as RawEuler,
      constraints: {
        min,
        max,
      },
      pub: {
        public: true,
        output: labelBase,
        units: units ?? "rad",
      },
    };
    return descriptor;
  }

  const descriptor: AnimatableVector3 = {
    id: crypto.randomUUID(),
    name: labelBase,
    type: "vector3",
    default: defaults as RawVector3,
    constraints: {
      min,
      max,
    },
    pub: {
      public: true,
      output: labelBase,
      units,
    },
  };
  return descriptor;
}

function isAnimatableReferencedElsewhere(
  world: Record<string, RenderableLike>,
  targetElementId: string,
  targetFeatureKey: string,
  animatableId: string,
): boolean {
  return Object.values(world).some((renderable) => {
    if (!renderable.features) {
      return false;
    }
    return Object.entries(renderable.features).some(([featureKey, feature]) =>
      Boolean(
        feature &&
          feature.animated &&
          feature.value === animatableId &&
          !(
            renderable.id === targetElementId && featureKey === targetFeatureKey
          ),
      ),
    );
  });
}

export function AnimatableValuesPanel({ namespace }: { namespace: string }) {
  const world = useVizijStore((state) => state.world);
  const animatables = useVizijStore((state) => state.animatables);
  const setValue = useVizijStore((state) => state.setValue);
  const setStoreState = useVizijStoreSetter();

  const featureEntries = useMemo(
    () => buildFeatureEntries(world, animatables),
    [world, animatables],
  );

  const groupedEntries = useMemo(() => {
    const grouped = new Map<string, FeatureEntry[]>();
    featureEntries.forEach((entry) => {
      if (!grouped.has(entry.elementId)) {
        grouped.set(entry.elementId, []);
      }
      grouped.get(entry.elementId)!.push(entry);
    });
    return Array.from(grouped.entries()).map(([elementId, entries]) => {
      const descriptor = entries[0];
      return {
        elementId,
        elementName: descriptor.elementName,
        elementType: descriptor.elementType,
        entries,
      };
    });
  }, [featureEntries]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const knownGroupIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setCollapsedGroups((previous) => {
      let changed = false;
      const next = new Set(previous);
      const currentIds = new Set(
        groupedEntries.map((group) => group.elementId),
      );

      // Remove stale ids and forget them.
      previous.forEach((id) => {
        if (!currentIds.has(id)) {
          next.delete(id);
          knownGroupIdsRef.current.delete(id);
          changed = true;
        }
      });

      // Ensure new groups start collapsed.
      groupedEntries.forEach((group) => {
        if (!knownGroupIdsRef.current.has(group.elementId)) {
          knownGroupIdsRef.current.add(group.elementId);
          next.add(group.elementId);
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [groupedEntries]);

  const toggleGroup = useCallback((elementId: string) => {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(elementId)) {
        next.delete(elementId);
      } else {
        next.add(elementId);
      }
      return next;
    });
  }, []);

  const updateAnimatableDescriptor = useCallback(
    (
      animatableId: string,
      updater: (current: AnimatableValue) => AnimatableValue,
      options?: { newDefault?: RawValue },
    ) => {
      setStoreState((state) => {
        const current = state.animatables[animatableId];
        if (!current) {
          return state;
        }
        const updated = updater(current);
        if (updated === current) {
          return state;
        }
        const partial: any = {
          animatables: {
            ...state.animatables,
            [animatableId]: updated,
          },
        };
        if (options?.newDefault !== undefined) {
          const nextValues = new Map(state.values);
          nextValues.set(
            getLookup(DEFAULT_NAMESPACE, animatableId),
            options.newDefault,
          );
          partial.values = nextValues;
        }
        return partial;
      });
    },
    [setStoreState],
  );

  const updateStaticFeature = useCallback(
    (entry: FeatureEntry, nextValue: RawValue) => {
      setStoreState((state) => {
        const renderable = state.world[entry.elementId];
        if (!renderable) {
          return state;
        }
        const nextFeatures = {
          ...renderable.features,
          [entry.featureKey]: {
            animated: false,
            value: nextValue,
          },
        };
        return {
          world: {
            ...state.world,
            [entry.elementId]: {
              ...renderable,
              features: nextFeatures,
            },
          },
        } as Partial<typeof state>;
      });
    },
    [setStoreState],
  );

  const convertToAnimated = useCallback(
    (entry: FeatureEntry, baseValue: RawValue) => {
      const animatable = buildDefaultAnimatable(entry, baseValue);
      if (!animatable) {
        return;
      }

      setStoreState((state) => {
        const renderable = state.world[entry.elementId];
        if (!renderable) {
          return state;
        }
        const nextAnimatables = {
          ...state.animatables,
          [animatable.id]: animatable,
        };
        const nextFeatures = {
          ...renderable.features,
          [entry.featureKey]: {
            animated: true,
            value: animatable.id,
          },
        };
        const nextValues = new Map(state.values);
        nextValues.set(
          getLookup(DEFAULT_NAMESPACE, animatable.id),
          cloneRawValue(animatable.default as RawValue),
        );
        return {
          animatables: nextAnimatables,
          values: nextValues,
          world: {
            ...state.world,
            [entry.elementId]: {
              ...renderable,
              features: nextFeatures,
            },
          },
        } as Partial<typeof state>;
      });
    },
    [setStoreState],
  );

  const convertToStatic = useCallback(
    (entry: FeatureEntry) => {
      if (!entry.descriptor || !entry.animatableId) {
        return;
      }
      const animatableId = entry.animatableId;
      const defaultValue = cloneRawValue(entry.descriptor.default as RawValue);
      setStoreState((state) => {
        const renderable = state.world[entry.elementId];
        if (!renderable) {
          return state;
        }
        const nextAnimatables = { ...state.animatables };
        const nextFeatures = {
          ...renderable.features,
          [entry.featureKey]: {
            animated: false,
            value: defaultValue,
          },
        };
        const nextValues = new Map(state.values);
        const animatableStillUsed = isAnimatableReferencedElsewhere(
          state.world,
          entry.elementId,
          entry.featureKey,
          animatableId,
        );
        if (!animatableStillUsed) {
          delete nextAnimatables[animatableId];
          nextValues.delete(getLookup(DEFAULT_NAMESPACE, animatableId));
        }
        return {
          animatables: nextAnimatables,
          values: nextValues,
          world: {
            ...state.world,
            [entry.elementId]: {
              ...renderable,
              features: nextFeatures,
            },
          },
        } as Partial<typeof state>;
      });
    },
    [setStoreState],
  );

  const handleAnimatedToggle = useCallback(
    (entry: FeatureEntry, makeAnimated: boolean) => {
      if (makeAnimated) {
        const base =
          entry.staticValue ??
          (entry.descriptor?.default as RawValue | undefined) ??
          0;
        convertToAnimated(entry, cloneRawValue(base));
      } else {
        convertToStatic(entry);
      }
    },
    [convertToAnimated, convertToStatic],
  );

  const handleNameChange = useCallback(
    (entry: FeatureEntry, nextName: string) => {
      if (!entry.animatableId || !entry.descriptor) {
        return;
      }
      updateAnimatableDescriptor(entry.animatableId, (current) => ({
        ...current,
        name: nextName,
      }));
    },
    [updateAnimatableDescriptor],
  );

  const handleLabelChange = useCallback(
    (entry: FeatureEntry, nextLabel: string) => {
      if (!entry.animatableId || !entry.descriptor) {
        return;
      }
      updateAnimatableDescriptor(entry.animatableId, (current) => ({
        ...current,
        pub: {
          ...current.pub,
          output: nextLabel,
          public: true,
        },
      }));
    },
    [updateAnimatableDescriptor],
  );

  const handleDefaultUpdate = useCallback(
    (entry: FeatureEntry, nextValue: RawValue) => {
      if (!entry.animatableId || !entry.descriptor) {
        return;
      }
      updateAnimatableDescriptor(
        entry.animatableId,
        (current) => ({
          ...current,
          default: nextValue as never,
        }),
        { newDefault: nextValue },
      );
    },
    [updateAnimatableDescriptor],
  );

  const handleConstraintUpdate = useCallback(
    (
      entry: FeatureEntry,
      updater: (
        current: NonNullable<AnimatableValue["constraints"]>,
      ) => NonNullable<AnimatableValue["constraints"]>,
    ) => {
      if (!entry.animatableId || !entry.descriptor) {
        return;
      }
      updateAnimatableDescriptor(entry.animatableId, (current) => {
        const currentConstraints =
          current.constraints ??
          ({} as NonNullable<AnimatableValue["constraints"]>);
        const updatedConstraints = updater({
          ...currentConstraints,
        });
        return {
          ...current,
          constraints: updatedConstraints,
        } as AnimatableValue;
      });
    },
    [updateAnimatableDescriptor],
  );

  return (
    <div className="sidebar__panel feature-panel">
      <div className="sidebar__panel-header">
        <h2 className="sidebar__panel-title">Features</h2>
        <span className="sidebar__badge">{featureEntries.length}</span>
      </div>
      {featureEntries.length === 0 ? (
        <p className="sidebar__empty">No features detected.</p>
      ) : (
        <div className="feature-panel__groups">
          {groupedEntries.map((group) => (
            <section className="feature-group" key={group.elementId}>
              <header className="feature-group__header">
                <button
                  type="button"
                  className="feature-group__toggle-btn"
                  onClick={() => toggleGroup(group.elementId)}
                  aria-expanded={!collapsedGroups.has(group.elementId)}
                  aria-label={
                    collapsedGroups.has(group.elementId)
                      ? `Expand ${group.elementName}`
                      : `Collapse ${group.elementName}`
                  }
                >
                  {collapsedGroups.has(group.elementId) ? "+" : "−"}
                </button>
                <div className="feature-group__summary">
                  <h3 className="feature-group__title">{group.elementName}</h3>
                  <span className="feature-group__type">
                    {group.elementType}
                  </span>
                </div>
              </header>
              {!collapsedGroups.has(group.elementId) && (
                <div className="feature-group__body">
                  {group.entries.map((entry) => (
                    <FeatureRow
                      key={entry.id}
                      entry={entry}
                      namespace={namespace}
                      onToggleAnimated={handleAnimatedToggle}
                      onNameChange={handleNameChange}
                      onLabelChange={handleLabelChange}
                      onDefaultChange={handleDefaultUpdate}
                      onConstraintChange={handleConstraintUpdate}
                      onStaticUpdate={updateStaticFeature}
                      setValue={setValue}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FeatureRow({
  entry,
  namespace,
  onToggleAnimated,
  onNameChange,
  onLabelChange,
  onDefaultChange,
  onConstraintChange,
  onStaticUpdate,
  setValue,
}: {
  entry: FeatureEntry;
  namespace: string;
  onToggleAnimated: (entry: FeatureEntry, makeAnimated: boolean) => void;
  onNameChange: (entry: FeatureEntry, value: string) => void;
  onLabelChange: (entry: FeatureEntry, value: string) => void;
  onDefaultChange: (entry: FeatureEntry, value: RawValue) => void;
  onConstraintChange: (
    entry: FeatureEntry,
    updater: (
      constraints: NonNullable<AnimatableValue["constraints"]>,
    ) => NonNullable<AnimatableValue["constraints"]>,
  ) => void;
  onStaticUpdate: (entry: FeatureEntry, value: RawValue) => void;
  setValue: (
    id: string,
    namespace: string,
    value: RawValue | ((current: RawValue | undefined) => RawValue | undefined),
  ) => void;
}) {
  const descriptor = entry.descriptor;

  const handleAnimatedChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onToggleAnimated(entry, event.target.checked);
    },
    [entry, onToggleAnimated],
  );

  const handleNameInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onNameChange(entry, event.target.value);
    },
    [entry, onNameChange],
  );

  const handleLabelInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onLabelChange(entry, event.target.value);
    },
    [entry, onLabelChange],
  );

  const updateDefault = useCallback(
    (value: RawValue) => {
      onDefaultChange(entry, value);
      if (entry.animatableId) {
        setValue(entry.animatableId, namespace, value);
      }
    },
    [entry, namespace, onDefaultChange, setValue],
  );

  const updateConstraints = useCallback(
    (
      updater: (
        constraints: NonNullable<AnimatableValue["constraints"]>,
      ) => NonNullable<AnimatableValue["constraints"]>,
    ) => {
      onConstraintChange(entry, updater);
    },
    [entry, onConstraintChange],
  );

  const renderAnimatedControls = () => {
    if (!descriptor) {
      return null;
    }

    if (entry.type === "number") {
      const numberDescriptor = descriptor as AnimatableNumber;
      const defaultValue =
        typeof numberDescriptor.default === "number"
          ? numberDescriptor.default
          : 0;
      const constraints = numberDescriptor.constraints ?? {};
      const fallback = computeNumberBounds(defaultValue, entry.featureKey);
      const currentMin = constraints.min ?? fallback[0];
      const currentMax = constraints.max ?? fallback[1];
      const isPinched =
        isApproximatelyEqual(currentMin, defaultValue) &&
        isApproximatelyEqual(currentMax, defaultValue);

      return (
        <div className="feature-row__matrix feature-row__matrix--columns-1">
          <div className="feature-row__matrix-cell feature-row__matrix-cell--label" />
          <div className="feature-row__matrix-cell feature-row__matrix-cell--header">
            Value
          </div>
          <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
            Default
          </div>
          <div className="feature-row__matrix-cell">
            <input
              type="number"
              className="feature-row__input feature-row__input--compact"
              value={defaultValue}
              step={0.1}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isFinite(parsed)) {
                  updateDefault(parsed);
                  if (isPinched) {
                    updateConstraints((current) => {
                      const next = { ...(current as any) };
                      next.min = parsed;
                      next.max = parsed;
                      return next;
                    });
                  }
                }
              }}
              aria-label="Default value"
            />
          </div>
          <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
            Min
          </div>
          <div className="feature-row__matrix-cell">
            <input
              type="number"
              className="feature-row__input feature-row__input--compact"
              value={currentMin}
              step={0.1}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isFinite(parsed)) {
                  updateConstraints((current) => {
                    const next = { ...(current as any) };
                    next.min = parsed;
                    return next;
                  });
                }
              }}
              aria-label="Minimum value"
            />
          </div>
          <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
            Max
          </div>
          <div className="feature-row__matrix-cell">
            <input
              type="number"
              className="feature-row__input feature-row__input--compact"
              value={currentMax}
              step={0.1}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isFinite(parsed)) {
                  updateConstraints((current) => {
                    const next = { ...(current as any) };
                    next.max = parsed;
                    return next;
                  });
                }
              }}
              aria-label="Maximum value"
            />
          </div>
          <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
            Pinch
          </div>
          <div className="feature-row__matrix-cell">
            <label className="feature-row__pinch-toggle">
              <input
                type="checkbox"
                checked={isPinched}
                onChange={(event) => {
                  const checked = event.target.checked;
                  if (checked) {
                    updateConstraints((current) => {
                      const next = { ...(current as any) };
                      next.min = defaultValue;
                      next.max = defaultValue;
                      return next;
                    });
                  }
                }}
                aria-label="Pinch value"
              />
              <span>Pinch</span>
            </label>
          </div>
        </div>
      );
    }

    const vectorDescriptor =
      entry.vector.descriptorType === "rgb"
        ? (descriptor as AnimatableColor)
        : entry.vector.descriptorType === "euler"
          ? (descriptor as AnimatableEuler)
          : (descriptor as AnimatableVector3);

    const current = ensureVectorValue(entry, vectorDescriptor.default);
    const fallbackConstraints = getVectorConstraintDefaults(entry, current);
    const resolvedMin =
      vectorDescriptor.constraints?.min ?? fallbackConstraints.min;
    const resolvedMax =
      vectorDescriptor.constraints?.max ?? fallbackConstraints.max;
    const vectorColumnsClass =
      entry.vector.components.length === 2
        ? "feature-row__matrix feature-row__matrix--columns-2"
        : "feature-row__matrix feature-row__matrix--columns-3";

    return (
      <div className={vectorColumnsClass}>
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label" />
        {entry.vector.components.map((component) => (
          <div
            className="feature-row__matrix-cell feature-row__matrix-cell--header"
            key={`${component}-header`}
          >
            {component.toUpperCase()}
          </div>
        ))}
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
          Default
        </div>
        {entry.vector.components.map((component, index) => {
          const componentDefault = (current as any)[component];
          const componentMin = resolvedMin[index];
          const componentMax = resolvedMax[index];
          const componentPinched =
            isApproximatelyEqual(componentMin, componentDefault) &&
            isApproximatelyEqual(componentMax, componentDefault);
          return (
            <div
              className="feature-row__matrix-cell"
              key={`${component}-default`}
            >
              <input
                type="number"
                className="feature-row__input feature-row__input--compact"
                value={componentDefault}
                min={entry.vector.descriptorType === "rgb" ? 0 : undefined}
                max={entry.vector.descriptorType === "rgb" ? 1 : undefined}
                step={entry.vector.descriptorType === "rgb" ? 0.01 : 0.1}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isFinite(parsed)) {
                    return;
                  }
                  const next = {
                    ...current,
                    [component]: parsed,
                  } as typeof current;
                  updateDefault(next);
                  if (componentPinched) {
                    updateConstraints((currentConstraints) => {
                      const nextConstraints = {
                        ...(currentConstraints as any),
                      };
                      const nextMin = cloneVectorTuple(
                        (nextConstraints.min ?? resolvedMin) as [
                          number | null,
                          number | null,
                          number | null,
                        ],
                      );
                      const nextMax = cloneVectorTuple(
                        (nextConstraints.max ?? resolvedMax) as [
                          number | null,
                          number | null,
                          number | null,
                        ],
                      );
                      nextMin[index] = parsed;
                      nextMax[index] = parsed;
                      nextConstraints.min = nextMin;
                      nextConstraints.max = nextMax;
                      return nextConstraints;
                    });
                  }
                }}
                aria-label={`${component.toUpperCase()} default`}
              />
            </div>
          );
        })}
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
          Min
        </div>
        {entry.vector.components.map((component, index) => (
          <div className="feature-row__matrix-cell" key={`${component}-min`}>
            <input
              type="number"
              className="feature-row__input feature-row__input--compact"
              value={resolvedMin[index] ?? 0}
              min={entry.vector.descriptorType === "rgb" ? 0 : undefined}
              max={entry.vector.descriptorType === "rgb" ? 1 : undefined}
              step={entry.vector.descriptorType === "rgb" ? 0.01 : 0.1}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                updateConstraints((currentConstraints) => {
                  const next = { ...(currentConstraints as any) };
                  const nextMin = cloneVectorTuple(
                    (next.min ?? resolvedMin) as [
                      number | null,
                      number | null,
                      number | null,
                    ],
                  );
                  nextMin[index] = parsed;
                  next.min = nextMin;
                  if (!next.max) {
                    next.max = cloneVectorTuple(resolvedMax as any);
                  }
                  return next;
                });
              }}
              aria-label={`${component.toUpperCase()} minimum`}
            />
          </div>
        ))}
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
          Max
        </div>
        {entry.vector.components.map((component, index) => (
          <div className="feature-row__matrix-cell" key={`${component}-max`}>
            <input
              type="number"
              className="feature-row__input feature-row__input--compact"
              value={resolvedMax[index] ?? 0}
              min={entry.vector.descriptorType === "rgb" ? 0 : undefined}
              max={entry.vector.descriptorType === "rgb" ? 1 : undefined}
              step={entry.vector.descriptorType === "rgb" ? 0.01 : 0.1}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                updateConstraints((currentConstraints) => {
                  const next = { ...(currentConstraints as any) };
                  const nextMax = cloneVectorTuple(
                    (next.max ?? resolvedMax) as [
                      number | null,
                      number | null,
                      number | null,
                    ],
                  );
                  nextMax[index] = parsed;
                  next.max = nextMax;
                  if (!next.min) {
                    next.min = cloneVectorTuple(resolvedMin as any);
                  }
                  return next;
                });
              }}
              aria-label={`${component.toUpperCase()} maximum`}
            />
          </div>
        ))}
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
          Pinch
        </div>
        {entry.vector.components.map((component, index) => {
          const componentDefault = (current as any)[component];
          const componentMin = resolvedMin[index];
          const componentMax = resolvedMax[index];
          const componentPinched =
            isApproximatelyEqual(componentMin, componentDefault) &&
            isApproximatelyEqual(componentMax, componentDefault);
          return (
            <div
              className="feature-row__matrix-cell"
              key={`${component}-pinch`}
            >
              <label className="feature-row__pinch-toggle">
                <input
                  type="checkbox"
                  checked={componentPinched}
                  onChange={(event) => {
                    if (event.target.checked) {
                      updateConstraints((currentConstraints) => {
                        const next = { ...(currentConstraints as any) };
                        const nextMin = cloneVectorTuple(
                          (next.min ?? resolvedMin) as [
                            number | null,
                            number | null,
                            number | null,
                          ],
                        );
                        const nextMax = cloneVectorTuple(
                          (next.max ?? resolvedMax) as [
                            number | null,
                            number | null,
                            number | null,
                          ],
                        );
                        nextMin[index] = componentDefault;
                        nextMax[index] = componentDefault;
                        next.min = nextMin;
                        next.max = nextMax;
                        return next;
                      });
                    }
                  }}
                  aria-label={`${component.toUpperCase()} pinch`}
                />
                <span>Pinch</span>
              </label>
            </div>
          );
        })}
      </div>
    );
  };

  const renderStaticControls = () => {
    if (entry.animated) {
      return null;
    }

    if (entry.type === "number") {
      const numeric =
        typeof entry.staticValue === "number" ? entry.staticValue : 0;
      return (
        <div className="feature-row__matrix feature-row__matrix--columns-1">
          <div className="feature-row__matrix-cell feature-row__matrix-cell--label" />
          <div className="feature-row__matrix-cell feature-row__matrix-cell--header">
            Value
          </div>
          <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
            Value
          </div>
          <div className="feature-row__matrix-cell">
            <input
              type="number"
              className="feature-row__input feature-row__input--compact"
              value={numeric}
              step={0.1}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isFinite(parsed)) {
                  onStaticUpdate(entry, parsed);
                }
              }}
              aria-label="Value"
            />
          </div>
        </div>
      );
    }

    const current = ensureVectorValue(
      entry,
      entry.staticValue ?? entry.descriptor?.default,
    );
    const vectorColumnsClass =
      entry.vector.components.length === 2
        ? "feature-row__matrix feature-row__matrix--columns-2"
        : "feature-row__matrix feature-row__matrix--columns-3";

    return (
      <div className={vectorColumnsClass}>
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label" />
        {entry.vector.components.map((component) => (
          <div
            className="feature-row__matrix-cell feature-row__matrix-cell--header"
            key={`${component}-static-header`}
          >
            {component.toUpperCase()}
          </div>
        ))}
        <div className="feature-row__matrix-cell feature-row__matrix-cell--label">
          Value
        </div>
        {entry.vector.components.map((component) => (
          <div className="feature-row__matrix-cell" key={`${component}-static`}>
            <input
              type="number"
              className="feature-row__input feature-row__input--compact"
              value={(current as any)[component]}
              min={entry.vector.descriptorType === "rgb" ? 0 : undefined}
              max={entry.vector.descriptorType === "rgb" ? 1 : undefined}
              step={entry.vector.descriptorType === "rgb" ? 0.01 : 0.1}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                const next = {
                  ...current,
                  [component]: parsed,
                } as typeof current;
                onStaticUpdate(entry, next);
              }}
              aria-label={`${component.toUpperCase()} value`}
            />
          </div>
        ))}
      </div>
    );
  };

  const badgeLabel =
    entry.type === "number"
      ? "NUMBER"
      : entry.vector.descriptorType.toUpperCase();

  return (
    <div className="feature-row">
      <div className="feature-row__header">
        <div className="feature-row__summary">
          <div className="feature-row__title">
            <strong>{entry.featureLabel}</strong>
            <span className="feature-row__badge">{badgeLabel}</span>
          </div>
          <div className="feature-row__subtitle">
            <span>{entry.elementName}</span>
            <span>•</span>
            <span>{entry.elementType}</span>
          </div>
        </div>
        <label className="feature-row__toggle">
          <input
            type="checkbox"
            checked={entry.animated}
            onChange={handleAnimatedChange}
          />
          <span>Animatable</span>
        </label>
      </div>

      {entry.animated && descriptor ? (
        <div className="feature-row__body">
          <div className="feature-row__grid">
            <label className="feature-row__field">
              <span>Name</span>
              <input
                className="feature-row__input"
                value={descriptor.name ?? ""}
                onChange={handleNameInput}
                spellCheck={false}
              />
            </label>
            <label className="feature-row__field">
              <span>Display Label</span>
              <input
                className="feature-row__input"
                value={descriptor.pub?.output ?? ""}
                onChange={handleLabelInput}
                spellCheck={false}
              />
            </label>
          </div>
          {renderAnimatedControls()}
          <div className="feature-row__metrics">
            <span>
              Default:{" "}
              <strong>{formatRawValue(descriptor.default as RawValue)}</strong>
            </span>
          </div>
        </div>
      ) : (
        <div className="feature-row__body">
          {renderStaticControls()}
          <div className="feature-row__metrics">
            <span>
              Value: <strong>{formatRawValue(entry.staticValue)}</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
