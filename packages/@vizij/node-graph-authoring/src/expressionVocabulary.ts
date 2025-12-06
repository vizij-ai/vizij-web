import type { BindingValueType } from "./state";
import {
  SCALAR_FUNCTION_VOCABULARY,
  type ScalarFunctionVocabularyEntry,
} from "./expressionFunctions";

export type ReservedExpressionScope = "binding" | "graph";

export interface ReservedExpressionVariableDefinition {
  name: string;
  description: string;
  scope: ReservedExpressionScope;
  defaultValueType?: BindingValueType;
  available?: boolean;
}

export const RESERVED_EXPRESSION_VARIABLES: ReservedExpressionVariableDefinition[] =
  [
    {
      name: "self",
      description: "Output of the current binding.",
      scope: "binding",
      defaultValueType: "scalar",
      available: true,
    },
    {
      name: "time",
      description: "Elapsed time in seconds since the rig started.",
      scope: "graph",
      defaultValueType: "scalar",
      available: true,
    },
    {
      name: "deltaTime",
      description: "Seconds elapsed since the previous frame update.",
      scope: "graph",
      defaultValueType: "scalar",
      available: true,
    },
    {
      name: "frame",
      description: "Current frame counter.",
      scope: "graph",
      defaultValueType: "scalar",
      available: true,
    },
  ];

export const EXPRESSION_FUNCTION_VOCABULARY: ScalarFunctionVocabularyEntry[] =
  SCALAR_FUNCTION_VOCABULARY;
