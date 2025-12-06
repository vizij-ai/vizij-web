import type { StandardRigInput } from "@vizij/utils";
import type { AutoRigInputBlueprintMetadata } from "../rig/autoInputs";

export type ManagedStandardInputSource = "auto" | "custom";

export interface ManagedStandardInput {
  input: StandardRigInput;
  source: ManagedStandardInputSource;
  metadata?: AutoRigInputBlueprintMetadata;
  disabled: boolean;
}
