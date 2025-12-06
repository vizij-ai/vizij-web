import type { StandardRigInput } from "@vizij/utils";
import type { AutoRigInputBlueprintMetadata } from "../rig/autoInputs";

export interface AutoInputState {
  input: StandardRigInput;
  metadata: AutoRigInputBlueprintMetadata;
  generatedLabel: string;
  generatedDefaultValue: number;
  generatedRange: { min: number; max: number };
  sourcePath: string;
  sourceId: string | undefined;
}
