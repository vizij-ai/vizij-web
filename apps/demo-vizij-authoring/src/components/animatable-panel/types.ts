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
import type { AnimatableComponent } from "../../rig/animatableMetadata";
import type {
  BindingMap,
  AnimatableBinding,
  StandardInputValues,
  RemapSettings,
} from "../../rig/state";
import type { StandardRigInput } from "../../rig/standardRigInputs";
import type { VectorDescriptorType } from "../../rig/bounds";
import { RGB_COMPONENTS, XYZ_COMPONENTS } from "./constants";

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
  standardInputs: StandardRigInput[];
  onCreateStandardInput(path: string): StandardRigInput | null;
  onUpdateStandardInput(
    inputId: string,
    updates: { path?: string; label?: string },
  ): void;
  onDeleteStandardInput(inputId: string): void;
}

export type BindingTarget = {
  label: string;
  targetId: string;
  binding: AnimatableBinding | undefined;
  component: AnimatableComponent;
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

export interface FeatureRowProps {
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
  standardInputs: StandardRigInput[];
  standardInputLookup: Map<string, StandardRigInput>;
  inputRanges: Map<string, { min: number; max: number }>;
  isCollapsed: boolean;
  onToggleCollapse: (id: string) => void;
  onRequestCreateStandardInput: (
    suggestedPath?: string,
  ) => StandardRigInput | null;
}

export type { VectorDescriptorType };
