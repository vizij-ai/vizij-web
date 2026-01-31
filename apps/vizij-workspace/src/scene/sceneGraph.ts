import type { World } from "@vizij/render";
import type {
  AnimatableComponent,
  AnimatableValue,
  RawValue,
  StandardRigInput,
} from "@vizij/utils";
import type { BindingMap, BindingValueType } from "@vizij/node-graph-authoring";
import { SELF_BINDING_ID } from "@vizij/utils";
import type { VectorDescriptorType } from "@vizij/utils";
import {
  buildFeatureEntries,
  type FeatureEntry,
  type VectorComponent,
  type RenderableLike,
} from "./featureEntries";

type BindingSlot = BindingMap[keyof BindingMap]["slots"][number];

export type SceneDriverSourceKind = "standard-input" | "self" | "unassigned";

export interface SceneDriverInputSummary {
  id: string;
  label: string;
  path: string;
  group: string;
}

export interface SceneFeatureDriverSlot {
  id: string;
  alias: string;
  sourceKind: SceneDriverSourceKind;
  inputId: string | null;
  input?: SceneDriverInputSummary;
  valueType: BindingValueType;
}

export interface SceneFeatureBindingSummary {
  targetId: string;
  expression: string;
  slots: SceneFeatureDriverSlot[];
}

export interface SceneFeatureComponent {
  id: string;
  label: string;
  componentKey?: VectorComponent;
  targetId: string | null;
  animatable?: AnimatableComponent;
  binding?: SceneFeatureBindingSummary;
  staticValue?: number;
}

export interface SceneObjectFeature {
  id: string;
  key: string;
  label: string;
  defaultLabel: string;
  type: FeatureEntry["type"];
  descriptorType?: VectorDescriptorType;
  animated: boolean;
  descriptor?: AnimatableValue;
  staticValue?: RawValue;
  animatableId?: string;
  elementId: string;
  elementName: string;
  elementType: string;
  components: SceneFeatureComponent[];
}

export interface SceneObjectNode {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  childIds: string[];
  features: SceneObjectFeature[];
}

export interface SceneGraphData {
  nodes: SceneObjectNode[];
  rootIds: string[];
}

export interface BuildSceneGraphOptions {
  world: World;
  animatables: Record<string, AnimatableValue>;
  bindings: BindingMap;
  animatableComponents: AnimatableComponent[];
  standardInputsById: Map<string, StandardRigInput>;
  featureLabelOverrides: Record<string, string>;
}

export function buildSceneGraphData({
  world,
  animatables,
  bindings,
  animatableComponents,
  standardInputsById,
  featureLabelOverrides,
}: BuildSceneGraphOptions): SceneGraphData {
  const nodes = new Map<string, SceneObjectNode>();

  Object.values(world).forEach((renderable) => {
    nodes.set(renderable.id, {
      id: renderable.id,
      name: renderable.name || renderable.id,
      type: renderable.type,
      parentId: null,
      childIds: [],
      features: [],
    });
  });

  Object.values(world).forEach((renderable) => {
    const children = (renderable as { children?: string[] }).children ?? [];
    children.forEach((childId) => {
      const child = nodes.get(childId);
      const parent = nodes.get(renderable.id);
      if (!child || !parent) {
        return;
      }
      child.parentId = parent.id;
      parent.childIds.push(childId);
    });
  });

  const componentsById = new Map<string, AnimatableComponent>(
    animatableComponents.map((component) => [component.id, component]),
  );

  const featureEntries = buildFeatureEntries(
    world as unknown as Record<string, RenderableLike>,
    animatables,
    featureLabelOverrides,
  );

  featureEntries.forEach((entry) => {
    const node = nodes.get(entry.elementId);
    if (!node) {
      return;
    }
    const feature = buildSceneObjectFeature(
      entry,
      componentsById,
      bindings,
      standardInputsById,
    );
    node.features.push(feature);
  });

  nodes.forEach((node) => {
    node.features.sort((a, b) => a.label.localeCompare(b.label));
  });

  const rootIds = Array.from(nodes.values())
    .filter((node) => node.parentId === null)
    .map((node) => node.id);

  return {
    nodes: Array.from(nodes.values()),
    rootIds,
  };
}

function buildSceneObjectFeature(
  entry: FeatureEntry,
  componentsById: Map<string, AnimatableComponent>,
  bindings: BindingMap,
  standardInputsById: Map<string, StandardRigInput>,
): SceneObjectFeature {
  const feature: SceneObjectFeature = {
    id: entry.id,
    key: entry.featureKey,
    label: entry.featureLabel,
    defaultLabel: entry.defaultLabel,
    type: entry.type,
    descriptorType:
      entry.type === "vector3" ? entry.vector.descriptorType : undefined,
    animated: entry.animated,
    descriptor: entry.descriptor,
    staticValue: entry.animated ? undefined : entry.staticValue,
    animatableId: entry.animatableId ?? undefined,
    elementId: entry.elementId,
    elementName: entry.elementName,
    elementType: entry.elementType,
    components: [],
  };

  if (!entry.animated || !entry.animatableId) {
    appendStaticComponents(feature, entry);
    return feature;
  }

  if (entry.type === "number") {
    feature.components.push(
      buildSceneFeatureComponent({
        featureId: entry.id,
        label: "Value",
        targetId: entry.animatableId,
        componentsById,
        bindings,
        standardInputsById,
      }),
    );
    return feature;
  }

  entry.vector.components.forEach((componentKey) => {
    const targetId = `${entry.animatableId}:${componentKey}`;
    feature.components.push(
      buildSceneFeatureComponent({
        featureId: entry.id,
        label: componentKey.toUpperCase(),
        componentKey,
        targetId,
        componentsById,
        bindings,
        standardInputsById,
      }),
    );
  });

  return feature;
}

interface BuildSceneFeatureComponentOptions {
  featureId: string;
  label: string;
  targetId: string | null;
  componentKey?: VectorComponent;
  componentsById: Map<string, AnimatableComponent>;
  bindings: BindingMap;
  standardInputsById: Map<string, StandardRigInput>;
}

function buildSceneFeatureComponent({
  featureId,
  label,
  targetId,
  componentKey,
  componentsById,
  bindings,
  standardInputsById,
}: BuildSceneFeatureComponentOptions): SceneFeatureComponent {
  const component: SceneFeatureComponent = {
    id: targetId ?? `${featureId}:${label.toLowerCase()}`,
    label,
    componentKey,
    targetId,
    animatable: targetId ? componentsById.get(targetId) : undefined,
  };

  if (!targetId) {
    return component;
  }

  const binding = bindings[targetId];
  if (!binding) {
    return component;
  }

  component.binding = {
    targetId,
    expression: binding.expression,
    slots: binding.slots.map((slot) =>
      buildDriverSlot(slot, standardInputsById),
    ),
  };

  return component;
}

function buildDriverSlot(
  slot: BindingSlot,
  standardInputsById: Map<string, StandardRigInput>,
): SceneFeatureDriverSlot {
  const inputId = slot.inputId ?? null;
  let sourceKind: SceneDriverSourceKind = "unassigned";
  let inputSummary: SceneDriverInputSummary | undefined;

  if (inputId === SELF_BINDING_ID) {
    sourceKind = "self";
  } else if (inputId) {
    sourceKind = "standard-input";
    const input = standardInputsById.get(inputId);
    if (input) {
      inputSummary = summarizeInput(input);
    }
  }

  return {
    id: slot.id,
    alias: slot.alias?.trim() || slot.id,
    sourceKind,
    inputId,
    input: inputSummary,
    valueType: slot.valueType ?? "scalar",
  };
}

function summarizeInput(input: StandardRigInput): SceneDriverInputSummary {
  return {
    id: input.id,
    label: input.label,
    path: input.path,
    group: input.group,
  };
}

function appendStaticComponents(
  feature: SceneObjectFeature,
  entry: FeatureEntry,
): void {
  if (entry.type === "number") {
    feature.components.push({
      id: `${entry.id}:value`,
      label: "Value",
      targetId: null,
      staticValue:
        typeof entry.staticValue === "number" ? entry.staticValue : undefined,
    });
    return;
  }

  entry.vector.components.forEach((componentKey) => {
    feature.components.push({
      id: `${entry.id}:${componentKey}`,
      label: componentKey.toUpperCase(),
      componentKey,
      targetId: null,
      staticValue: extractStaticComponentValue(entry.staticValue, componentKey),
    });
  });
}

function extractStaticComponentValue(
  value: RawValue | undefined,
  component: VectorComponent,
): number | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as unknown as Record<string, unknown>;
  const keys = componentKeyAliases(component);
  for (const key of keys) {
    const entry = record[key];
    if (typeof entry === "number" && Number.isFinite(entry)) {
      return entry;
    }
  }
  return undefined;
}

function componentKeyAliases(component: VectorComponent): readonly string[] {
  switch (component) {
    case "x":
      return ["x", "r"] as const;
    case "y":
      return ["y", "g"] as const;
    case "z":
      return ["z", "b"] as const;
    case "r":
      return ["r", "x"] as const;
    case "g":
      return ["g", "y"] as const;
    case "b":
      return ["b", "z"] as const;
    default:
      return [component];
  }
}
