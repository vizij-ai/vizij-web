import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  useVizijStore,
  useVizijStoreSetter,
  type Selection,
} from "@vizij/render";
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
import {
  STANDARD_RIG_INPUTS,
  findStandardRigInput,
  type StandardRigInput,
} from "../rig/standardRigInputs";
import {
  createDefaultRemap,
  type AnimatableBinding,
  type BindingMap,
  type StandardInputValues,
} from "../rig/state";
import type { AnimatableComponent } from "../rig/animatableMetadata";
import {
  computeNumberBounds,
  computeVectorBounds,
} from "../rig/animatableMetadata";

const DEFAULT_NAMESPACE = "default";

const XYZ_COMPONENTS = ["x", "y", "z"] as const;
const RGB_COMPONENTS = ["r", "g", "b"] as const;
const APPROX_EQUAL_EPSILON = 1e-6;

type VectorComponent =
  | (typeof XYZ_COMPONENTS)[number]
  | (typeof RGB_COMPONENTS)[number];

type VectorDescriptorType = "vector3" | "euler" | "rgb";
type BindingField = "inMin" | "inMax" | "outMin" | "outMax";

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

function formatStandardInputLabel(input: StandardRigInput): string {
  const groupName = input.group.replace(/_/g, " ");
  return `${input.label} · ${groupName}`;
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
  if (!descriptor) {
    console.log("resolver", featureKey, descriptor, value);
  }
  const key = featureKey.toLowerCase();

  switch (key) {
    case "color":
      return { type: "vector3", descriptorType: "rgb" };
    case "opacity":
      return { type: "number" };
    case "rotation":
      return { type: "vector3", descriptorType: "euler" };
    case "translation":
      return { type: "vector3", descriptorType: "vector3" };
    case "scale":
      return { type: "vector3", descriptorType: "vector3" };
  }

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
  const { min: computedMin, max: computedMax } = computeVectorBounds(
    entry.vector.descriptorType,
    entry.featureKey,
    defaults,
  );
  const units = getUnitsForEntry(entry);

  type VecThree = [number | null, number | null, number | null] | undefined;

  const min = [computedMin[0], computedMin[1], computedMin[2]] as VecThree;
  const max = [computedMax[0], computedMax[1], computedMax[2]] as VecThree;

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

interface AnimatableValuesPanelProps {
  namespace: string;
  faceId: string;
  onFaceIdChange(faceId: string): void;
  selectionStack: Selection[];
  onFocusSelectionIndex(index: number): void;
  onClearSelection(): void;
  components: AnimatableComponent[];
  bindings: BindingMap;
  onBindingInputChange(targetId: string, inputId: string | null): void;
  onBindingRemapChange(
    targetId: string,
    field: BindingField,
    value: number,
  ): void;
  onResetBinding(targetId: string): void;
  inputValues: StandardInputValues;
  onInputValueChange(inputId: string, value: number): void;
}

export function AnimatableValuesPanel({
  namespace,
  faceId,
  onFaceIdChange,
  selectionStack,
  onFocusSelectionIndex,
  onClearSelection,
  components,
  bindings,
  onBindingInputChange,
  onBindingRemapChange,
  onResetBinding,
  inputValues,
  onInputValueChange,
}: AnimatableValuesPanelProps) {
  const world = useVizijStore((state) => state.world);
  const animatables = useVizijStore((state) => state.animatables);
  const setValue = useVizijStore((state) => state.setValue);
  const setStoreState = useVizijStoreSetter();

  const [rigCollapsed, setRigCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [collapsedFeatureRows, setCollapsedFeatureRows] = useState<Set<string>>(
    () => new Set(),
  );

  const componentsById = useMemo(
    () =>
      new Map<string, AnimatableComponent>(
        components.map((component) => [component.id, component]),
      ),
    [components],
  );

  const toggleFeatureCollapse = useCallback((id: string) => {
    setCollapsedFeatureRows((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const featureEntries = useMemo(
    () => buildFeatureEntries(world, animatables),
    [world, animatables],
  );

  const selectionKey = useCallback(
    (sel: Selection) => `${sel.namespace}:${sel.type}:${sel.id}`,
    [],
  );

  const activeSelection = selectionStack[0] ?? null;

  const filteredEntries = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return featureEntries.filter((entry) => {
      if (activeSelection && entry.elementId !== activeSelection.id) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      const haystack =
        `${entry.featureLabel} ${entry.elementName} ${entry.elementType}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [featureEntries, searchTerm, activeSelection]);

  const groupedEntries = useMemo(() => {
    const grouped = new Map<string, FeatureEntry[]>();
    filteredEntries.forEach((entry) => {
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
  }, [filteredEntries]);

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

  useEffect(() => {
    if (!activeSelection) {
      return;
    }
    setCollapsedGroups((previous) => {
      if (!previous.has(activeSelection.id)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(activeSelection.id);
      return next;
    });
  }, [activeSelection]);

  useEffect(() => {
    setCollapsedFeatureRows((previous) => {
      const valid = new Set(filteredEntries.map((entry) => entry.id));
      let modified = false;
      const next = new Set<string>();
      previous.forEach((id) => {
        if (valid.has(id)) {
          next.add(id);
        } else {
          modified = true;
        }
      });
      return modified ? next : previous;
    });
  }, [filteredEntries]);

  useEffect(() => {
    if (!activeSelection) {
      return;
    }
    setCollapsedFeatureRows((previous) => {
      let modified = false;
      const next = new Set(previous);
      filteredEntries.forEach((entry) => {
        if (entry.elementId === activeSelection.id && next.has(entry.id)) {
          next.delete(entry.id);
          modified = true;
        }
      });
      return modified ? next : previous;
    });
  }, [filteredEntries, activeSelection]);

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
      // console.log("Convert to animated", entry, baseValue)
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
        console.log("Convert in makeAnimated", entry);
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
      <section className="feature-panel__rig">
        <div className="feature-panel__rig-header">
          <button
            type="button"
            className="feature-panel__collapse-btn"
            onClick={() => setRigCollapsed((prev) => !prev)}
            aria-expanded={!rigCollapsed}
            aria-controls="feature-panel-rig-body"
          >
            {rigCollapsed ? "+" : "−"}
          </button>
          <div className="feature-panel__rig-summary">
            <h2 className="feature-panel__rig-title">Rig Mapping</h2>
            <p className="feature-panel__rig-description">
              Bind standard rig inputs to animatables and preview their remapped
              values.
            </p>
          </div>
        </div>
        {!rigCollapsed && (
          <div id="feature-panel-rig-body" className="feature-panel__rig-body">
            <label
              className="feature-panel__label"
              htmlFor="feature-panel-face"
            >
              Face / rig identifier
            </label>
            <input
              id="feature-panel-face"
              type="text"
              value={faceId}
              spellCheck={false}
              onChange={(event) => onFaceIdChange(event.target.value)}
            />
            <div className="feature-panel__inputs">
              {STANDARD_RIG_INPUTS.map((input) => {
                const value = inputValues[input.id] ?? input.defaultValue;
                const step = Math.max(
                  (input.range.max - input.range.min) / 200,
                  0.001,
                );
                return (
                  <div key={input.id} className="feature-panel__input-row">
                    <div className="feature-panel__input-meta">
                      <strong>{input.label}</strong>
                      <span>{input.path}</span>
                    </div>
                    <input
                      type="range"
                      min={input.range.min}
                      max={input.range.max}
                      step={step}
                      value={value}
                      onChange={(event) =>
                        onInputValueChange(input.id, Number(event.target.value))
                      }
                    />
                    <input
                      className="feature-panel__input-number"
                      type="number"
                      value={value}
                      min={input.range.min}
                      max={input.range.max}
                      step={step}
                      onChange={(event) =>
                        onInputValueChange(input.id, Number(event.target.value))
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
      <div className="feature-panel__filters">
        <input
          type="search"
          placeholder="Search features"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          spellCheck={false}
        />
        {searchTerm && (
          <button
            type="button"
            className="feature-panel__clear-btn"
            onClick={() => setSearchTerm("")}
          >
            Clear
          </button>
        )}
        {selectionStack.length > 0 && (
          <button
            type="button"
            className="feature-panel__filter-chip feature-panel__filter-chip--dismiss"
            onClick={onClearSelection}
            aria-label="Clear layered element selection"
          >
            {selectionStack.length} layered element
            {selectionStack.length === 1 ? "" : "s"}
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
      {selectionStack.length > 0 && (
        <div
          className="feature-panel__stack"
          role="group"
          aria-label="Selection stack"
        >
          <h3 className="feature-panel__stack-title">Selection stack</h3>
          <ol className="feature-panel__stack-list">
            {selectionStack.map((sel, index) => {
              const renderable = world[sel.id];
              const label = renderable?.name || sel.id;
              const isActive = index === 0;
              return (
                <li
                  key={selectionKey(sel)}
                  className={`feature-panel__stack-item${isActive ? " feature-panel__stack-item--active" : ""}`}
                >
                  <button
                    type="button"
                    className="feature-panel__stack-button"
                    onClick={() => onFocusSelectionIndex(index)}
                    disabled={isActive}
                  >
                    <span className="feature-panel__stack-label">{label}</span>
                    <span className="feature-panel__stack-meta">
                      {sel.type}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <div className="sidebar__panel-header">
        <h2 className="sidebar__panel-title">Features</h2>
        <span className="sidebar__badge">{filteredEntries.length}</span>
      </div>
      {filteredEntries.length === 0 ? (
        <p className="sidebar__empty">No features match the current filters.</p>
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
                      bindings={bindings}
                      componentsById={componentsById}
                      onBindingInputChange={onBindingInputChange}
                      onBindingRemapChange={onBindingRemapChange}
                      onResetBinding={onResetBinding}
                      inputValues={inputValues}
                      onInputValueChange={onInputValueChange}
                      isCollapsed={collapsedFeatureRows.has(entry.id)}
                      onToggleCollapse={toggleFeatureCollapse}
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
  bindings,
  componentsById,
  onBindingInputChange,
  onBindingRemapChange,
  onResetBinding,
  inputValues,
  onInputValueChange,
  isCollapsed,
  onToggleCollapse,
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
  bindings: BindingMap;
  componentsById: Map<string, AnimatableComponent>;
  onBindingInputChange: (targetId: string, inputId: string | null) => void;
  onBindingRemapChange: (
    targetId: string,
    field: BindingField,
    value: number,
  ) => void;
  onResetBinding: (targetId: string) => void;
  inputValues: StandardInputValues;
  onInputValueChange: (inputId: string, value: number) => void;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
}) {
  const descriptor = entry.descriptor;
  const bindingFieldLabels: Record<BindingField, string> = {
    inMin: "Input min",
    inMax: "Input max",
    outMin: "Output min",
    outMax: "Output max",
  };

  type BindingTarget = {
    label: string;
    targetId: string;
    binding: AnimatableBinding | undefined;
    component: AnimatableComponent;
  };

  const renderBindingMatrix = (targets: BindingTarget[]) => {
    if (!targets.length) {
      return null;
    }
    const columnCount = targets.length;
    const matrixClass = `feature-row__binding-matrix feature-row__binding-matrix--columns-${columnCount}`;

    return (
      <div className={matrixClass}>
        <div className="feature-row__binding-matrix-cell feature-row__binding-matrix-cell--label" />
        {targets.map((target) => (
          <div
            key={`${target.targetId}-header`}
            className="feature-row__binding-matrix-cell feature-row__binding-matrix-cell--header"
          >
            {target.label}
          </div>
        ))}

        <div className="feature-row__binding-matrix-cell feature-row__binding-matrix-cell--label">
          Standard input
        </div>
        {targets.map((target) => (
          <div
            key={`${target.targetId}-input`}
            className="feature-row__binding-matrix-cell"
          >
            <select
              value={target.binding?.inputId ?? ""}
              onChange={(event) =>
                onBindingInputChange(
                  target.targetId,
                  event.target.value ? event.target.value : null,
                )
              }
              aria-label={`${target.label} standard input`}
            >
              <option value="">Unbound</option>
              {STANDARD_RIG_INPUTS.map((input) => (
                <option key={input.id} value={input.id}>
                  {formatStandardInputLabel(input)}
                </option>
              ))}
            </select>
          </div>
        ))}

        {(["inMin", "inMax", "outMin", "outMax"] as BindingField[]).map(
          (field) => (
            <Fragment key={`binding-row-${field}`}>
              <div className="feature-row__binding-matrix-cell feature-row__binding-matrix-cell--label">
                {bindingFieldLabels[field]}
              </div>
              {targets.map((target) => {
                const defaults = createDefaultRemap(target.component);
                // if (target.component.label.includes("rotation")) console.log("Creating default remaps", target, defaults)
                const remap = target.binding?.remap ?? defaults;
                return (
                  <div
                    key={`${target.targetId}-${field}`}
                    className="feature-row__binding-matrix-cell"
                  >
                    <input
                      type="number"
                      value={remap[field]}
                      step={0.01}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        if (Number.isFinite(parsed)) {
                          onBindingRemapChange(target.targetId, field, parsed);
                        }
                      }}
                      aria-label={`${target.label} ${bindingFieldLabels[field]}`}
                    />
                  </div>
                );
              })}
            </Fragment>
          ),
        )}

        <div className="feature-row__binding-matrix-cell feature-row__binding-matrix-cell--label">
          Actions
        </div>
        {targets.map((target) => (
          <div
            key={`${target.targetId}-actions`}
            className="feature-row__binding-matrix-cell feature-row__binding-matrix-cell--actions"
          >
            <button
              type="button"
              onClick={() => onResetBinding(target.targetId)}
            >
              Reset
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderRigPreview = (targets: BindingTarget[]) => {
    const uniqueInputs = new Map<
      string,
      {
        input: StandardRigInput;
        value: number;
      }
    >();

    targets.forEach((target) => {
      const inputId = target.binding?.inputId;
      if (!inputId) {
        return;
      }
      if (uniqueInputs.has(inputId)) {
        return;
      }
      const inputMeta = findStandardRigInput(inputId);
      if (!inputMeta) {
        return;
      }
      const value = inputValues[inputId] ?? inputMeta.defaultValue;
      uniqueInputs.set(inputId, {
        input: inputMeta,
        value,
      });
    });

    if (uniqueInputs.size === 0) {
      return null;
    }

    return (
      <div className="feature-row__rig-preview">
        <div className="feature-row__rig-preview-inputs">
          {Array.from(uniqueInputs.entries()).map(([inputId, entry]) => {
            const step = Math.max(
              (entry.input.range.max - entry.input.range.min) / 200,
              0.001,
            );
            return (
              <div
                key={inputId}
                className="feature-panel__input-row feature-row__rig-preview-row"
              >
                <div className="feature-panel__input-meta">
                  <strong>{entry.input.label}</strong>
                  <span>{entry.input.path}</span>
                </div>
                <input
                  type="range"
                  min={entry.input.range.min}
                  max={entry.input.range.max}
                  step={step}
                  value={entry.value}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (Number.isFinite(parsed)) {
                      onInputValueChange(inputId, parsed);
                    }
                  }}
                />
                <input
                  className="feature-panel__input-number"
                  type="number"
                  min={entry.input.range.min}
                  max={entry.input.range.max}
                  step={step}
                  value={entry.value}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    if (Number.isFinite(parsed)) {
                      onInputValueChange(inputId, parsed);
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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
      const bindingTargets: BindingTarget[] = [];
      if (entry.animatableId) {
        const componentMeta = componentsById.get(entry.animatableId);
        if (componentMeta) {
          bindingTargets.push({
            label: "Value",
            targetId: entry.animatableId,
            binding: bindings[entry.animatableId],
            component: componentMeta,
          });
        }
      }

      return (
        <>
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
          </div>
          {renderBindingMatrix(bindingTargets)}
          {renderRigPreview(bindingTargets)}
        </>
      );
    }

    const vectorDescriptor =
      entry.vector.descriptorType === "rgb"
        ? (descriptor as AnimatableColor)
        : entry.vector.descriptorType === "euler"
          ? (descriptor as AnimatableEuler)
          : (descriptor as AnimatableVector3);

    const current = ensureVectorValue(entry, vectorDescriptor.default);

    const fallbackConstraints = computeVectorBounds(
      entry.vector.descriptorType,
      entry.featureKey,
      current,
    );
    const resolvedMin =
      vectorDescriptor.constraints?.min ?? fallbackConstraints.min;
    const resolvedMax =
      vectorDescriptor.constraints?.max ?? fallbackConstraints.max;
    const vectorColumnsClass =
      entry.vector.components.length === 2
        ? "feature-row__matrix feature-row__matrix--columns-2"
        : "feature-row__matrix feature-row__matrix--columns-3";

    const bindingTargets: BindingTarget[] = [];
    if (entry.animatableId) {
      entry.vector.components.forEach((component) => {
        const targetId = `${entry.animatableId}:${component}`;
        const componentMeta = componentsById.get(targetId);
        if (componentMeta) {
          bindingTargets.push({
            label: component.toUpperCase(),
            targetId,
            binding: bindings[targetId],
            component: componentMeta,
          });
        }
      });
    }

    return (
      <>
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
        </div>
        {renderBindingMatrix(bindingTargets)}
        {renderRigPreview(bindingTargets)}
      </>
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

  const summaryValue = entry.animated
    ? descriptor
      ? formatRawValue(descriptor.default as RawValue)
      : "—"
    : entry.staticValue !== undefined
      ? formatRawValue(entry.staticValue)
      : descriptor
        ? formatRawValue(descriptor.default as RawValue)
        : "—";

  return (
    <div
      className={`feature-row${isCollapsed ? " feature-row--collapsed" : ""}`}
    >
      <div className="feature-row__header">
        <div className="feature-row__header-left">
          <button
            type="button"
            className="feature-row__collapse-btn"
            onClick={() => onToggleCollapse(entry.id)}
            aria-expanded={!isCollapsed}
            aria-controls={`${entry.id}-body`}
          >
            {isCollapsed ? "+" : "−"}
          </button>
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
        </div>
        <div className="feature-row__header-right">
          <label className="feature-row__toggle">
            <input
              type="checkbox"
              checked={entry.animated}
              onChange={handleAnimatedChange}
            />
            <span>Animatable</span>
          </label>
        </div>
      </div>

      {!isCollapsed && entry.animated && descriptor ? (
        <div className="feature-row__body" id={`${entry.id}-body`}>
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
      ) : null}

      {!isCollapsed && !entry.animated && (
        <div className="feature-row__body" id={`${entry.id}-body`}>
          {renderStaticControls()}
          <div className="feature-row__metrics">
            <span>
              Value: <strong>{summaryValue}</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
