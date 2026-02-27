import type { FC } from "react";
import { Handle, Position } from "reactflow";
import { getPortColor } from "../utils/portColors";

export const OUTPUT_TARGET_TYPE = "__output_target" as const;
export const OUTPUT_TARGET_PORT_TYPE = "f32";
export const OUTPUT_TARGET_PORT_ID = "input";

export interface OutputTargetNodeData {
  /** Full rig spec Input node path, e.g. "rig/quori_latest/standard/vizij/mouth/morph/jaw_open" */
  outputPath: string;
  /** Leaf label to display */
  label: string;
}

const portColor = getPortColor(OUTPUT_TARGET_PORT_TYPE);

const OutputTargetNode: FC<{
  id: string;
  data: OutputTargetNodeData;
  selected?: boolean;
}> = ({ data, selected }) => {
  return (
    <div
      className={`relative rounded-md border bg-gradient-to-r from-emerald-900/60 to-neutral-900 text-neutral-100 min-w-28 shadow-md transition-colors ${
        selected
          ? "border-blue-500 shadow-blue-500/25"
          : "border-emerald-700/50"
      }`}
    >
      <Handle
        id={OUTPUT_TARGET_PORT_ID}
        type="target"
        position={Position.Left}
        style={{
          background: portColor.bg,
          border: `2px solid ${portColor.border}`,
          width: 10,
          height: 10,
        }}
      />
      <div className="px-3 py-1.5 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
        <span className="text-xs font-medium truncate" title={data.outputPath}>
          {data.label}
        </span>
      </div>
    </div>
  );
};

export default OutputTargetNode;
