import type {
  AnimatableValue,
  RawValue,
  RawVector3,
  RawEuler,
  RawRGB,
  AnimatableNumber,
  AnimatableVector3,
  AnimatableEuler,
  AnimatableColor,
} from "@vizij/utils";
import type { AnimatableComponent } from "@vizij/utils";
import type {
  AnimatableBinding,
  BindingValueType,
} from "@vizij/node-graph-authoring";
import type { StandardRigInput } from "@vizij/utils";
import type { VectorDescriptorType } from "@vizij/utils";
import type { FeatureEntry, VectorComponent } from "../../scene/featureEntries";

export type BindingTarget = {
  label: string;
  targetId: string;
  binding: AnimatableBinding | undefined;
  component: AnimatableComponent;
  issues?: readonly string[];
  valueType: BindingValueType;
};

export type RigInputDescriptor = {
  input: StandardRigInput;
  value: number;
};

export type VectorDefaults = RawVector3 | RawEuler | RawRGB;

export type AnimatableDescriptors =
  | AnimatableNumber
  | AnimatableVector3
  | AnimatableEuler
  | AnimatableColor;

export interface PropertyNode {
  id: string;
  label: string;
  targetId: string | null;
  componentKey?: VectorComponent;
}

export interface FieldNode {
  id: string;
  label: string;
  properties: PropertyNode[];
}

export interface AnimatableTreeNode {
  id: string;
  label: string;
  animatableId: string;
  entry: FeatureEntry;
  descriptor?: AnimatableValue;
  type: FeatureEntry["type"];
  vectorType?: VectorDescriptorType;
  fields: FieldNode[];
}

export interface FeatureTreeNode {
  id: string;
  entry: FeatureEntry;
  isAnimated: boolean;
  animatable?: AnimatableTreeNode;
  staticValue?: RawValue;
  searchText: string;
}

export interface ShapeTreeNode {
  id: string;
  name: string;
  type: string;
  features: FeatureTreeNode[];
}

export type TreeNodeType =
  | "shape"
  | "feature"
  | "animatable"
  | "field"
  | "property";

export type {
  FeatureEntry,
  NumberFeatureEntry,
  VectorFeatureEntry,
  VectorComponent,
  RenderableLike,
} from "../../scene/featureEntries";
export type { VectorDescriptorType };

export interface AnimatableValuesPanelProps {
  namespace: string;
  visibleSections?: {
    drivers?: boolean;
    properties?: boolean;
  };
  onCapturePoseFromDrivers?: (name: string) => void;
  capturePoseDisabled?: boolean;
}
