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
import type { Selection } from "@vizij/render";
import type { AnimatableComponent } from "@vizij/utils";
import type {
  BindingMap,
  AnimatableBinding,
  StandardInputValues,
  InputBindingMap,
} from "../../rig/state";
import type { StandardRigInput, RemapSettings } from "@vizij/utils";
import type { VectorDescriptorType } from "@vizij/utils";
import { RGB_COMPONENTS, XYZ_COMPONENTS } from "../../utils/constants";
import type { ManagedStandardInput } from "../../hooks/useRigController";

export type VectorComponent =
  | (typeof XYZ_COMPONENTS)[number]
  | (typeof RGB_COMPONENTS)[number];

export type BindingField = keyof RemapSettings;

export interface BaseFeatureEntry {
  id: string;
  elementId: string;
  elementName: string;
  elementType: string;
  featureKey: string;
  defaultLabel: string;
  featureLabel: string;
  animated: boolean;
  animatableId?: string;
  descriptor?: AnimatableValue;
  staticValue?: RawValue;
}

export interface NumberFeatureEntry extends BaseFeatureEntry {
  type: "number";
}

export interface VectorFeatureEntry extends BaseFeatureEntry {
  type: "vector3";
  vector: {
    descriptorType: VectorDescriptorType;
    components: readonly VectorComponent[];
  };
}

export type FeatureEntry = NumberFeatureEntry | VectorFeatureEntry;

export interface RenderableLike {
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
}

export type SupportedKind =
  | { type: "number" }
  | { type: "vector3"; descriptorType: VectorDescriptorType };

export interface AnimatableValuesPanelProps {
  namespace: string;
  faceId: string;
  onFaceIdChange(faceId: string): void;
  graphStatus: "idle" | "loading" | "ready" | "error";
  graphError: string | null;
  selectionStack: Selection[];
  onFocusSelectionIndex(index: number): void;
  onClearSelection(): void;
  components: AnimatableComponent[];
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  bindingIssues: Map<string, readonly string[]>;
  featureLabelOverrides: Record<string, string>;
  onBindingInputChange(
    targetId: string,
    inputId: string | null,
    slotId?: string,
  ): void;
  onBindingRemapChange(
    targetId: string,
    field: BindingField,
    value: number,
    slotId?: string,
  ): void;
  onResetBinding(targetId: string): void;
  inputValues: StandardInputValues;
  onInputValueChange(inputId: string, value: number): void;
  managedStandardInputs: ManagedStandardInput[];
  standardInputs: StandardRigInput[];
  standardInputRoots: string[];
  selectedStandardInputRoots: string[];
  selectedStandardInputSubgroups: string[];
  onSelectedStandardInputRootsChange(next: string[]): void;
  onSelectedStandardInputSubgroupsChange(next: string[]): void;
  onRenameGroup(sourceGroup: string, nextGroup: string): void;
  onCreateCustomStandardInput(path: string): StandardRigInput | null;
  onResetAllInputs(): void;
  onClearCachedState(): void;
  onLinkChildInput(parentId: string, childId: string): void;
  onUnlinkChildInput(parentId: string, childId: string): void;
  onEnsureParentBinding(inputId: string): void;
  onUpdateStandardInput(
    inputId: string,
    updates: { path?: string; label?: string },
  ): void;
  onDeleteCustomStandardInput(inputId: string): void;
  onAddBindingSlot(targetId: string): void;
  onRemoveBindingSlot(targetId: string, slotId: string): void;
  onBindingExpressionChange(targetId: string, expression: string): void;
  onBindingSlotAliasChange(
    targetId: string,
    slotId: string,
    alias: string,
  ): void;
  onParentBindingInputChange(
    targetId: string,
    inputId: string | null,
    slotId?: string,
  ): void;
  onParentBindingRemapChange(
    targetId: string,
    field: BindingField,
    value: number,
    slotId?: string,
  ): void;
  onParentAddBindingSlot(targetId: string): void;
  onParentRemoveBindingSlot(targetId: string, slotId: string): void;
  onParentBindingExpressionChange(targetId: string, expression: string): void;
  onParentBindingSlotAliasChange(
    targetId: string,
    slotId: string,
    alias: string,
  ): void;
  onParentResetBinding(targetId: string): void;
  onFeatureLabelChange(entry: FeatureEntry, value: string): void;
}

export type BindingTarget = {
  label: string;
  targetId: string;
  binding: AnimatableBinding | undefined;
  component: AnimatableComponent;
  issues?: readonly string[];
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

export type { VectorDescriptorType };
