import type { FC } from "react";
import { Handle, Position } from "reactflow";
import {
  MOTION_GRAPH_INPUT_SOURCE_PORT_ID,
  MOTION_GRAPH_INPUT_SOURCE_TYPE,
} from "@vizij/studio-support";
import { getPortColor } from "../utils/portColors";

export const INPUT_SOURCE_TYPE = MOTION_GRAPH_INPUT_SOURCE_TYPE;
export const INPUT_SOURCE_PORT_TYPE = "f32";
export const INPUT_SOURCE_PORT_ID = MOTION_GRAPH_INPUT_SOURCE_PORT_ID;

export type InputValueType = "f32" | "bool" | "i32";
export type InputControlMode = "instant" | "trigger" | "grouped";

export interface InputSourceNodeData {
  /** Full input path, e.g. "sensors/face/jaw_open" */
  inputPath: string;
  /** Leaf label to display */
  label: string;
  /** Value type for this input (default: "f32") */
  valueType?: InputValueType;
  /** Default value (default: 0) */
  defaultValue?: number;
  /** Min range for numeric values (default: 0) */
  min?: number;
  /** Max range for numeric values (default: 1) */
  max?: number;
  /** Control mode (default: "instant") */
  controlMode?: InputControlMode;
  /** Target value set by the control slider (staged for trigger mode) */
  targetValue?: number;
  /** The value currently applied to the orchestrator */
  appliedValue?: number;
}

const portColor = getPortColor(INPUT_SOURCE_PORT_TYPE);

const InputSourceNode: FC<{
  id: string;
  data: InputSourceNodeData;
  selected?: boolean;
}> = ({ data, selected }) => {
  return (
    <div
      className={`relative rounded-md border bg-gradient-to-r from-sky-900/60 to-neutral-900 text-neutral-100 min-w-28 shadow-md transition-colors ${
        selected ? "border-blue-500 shadow-blue-500/25" : "border-sky-700/50"
      }`}
    >
      <div className="px-3 py-1.5 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0" />
        <span className="text-xs font-medium truncate" title={data.inputPath}>
          {data.label}
        </span>
      </div>
      <Handle
        id={INPUT_SOURCE_PORT_ID}
        type="source"
        position={Position.Right}
        style={{
          background: portColor.bg,
          border: `2px solid ${portColor.border}`,
          width: 10,
          height: 10,
        }}
      />
    </div>
  );
};

export default InputSourceNode;
