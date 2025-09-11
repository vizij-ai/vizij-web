import React from "react";
import type { NodeProps } from "reactflow";
import { useNodeOutput } from "@vizij/node-graph-react";
import { NodeChrome, TargetPort, SourcePort, ValueDisplay } from "./shared/ui";
import NodeSeriesPanel from "./shared/NodeSeriesPanel";
import { displayValue } from "../../lib/display";
import { useConnectedValue } from "../../lib/hooks";

type Data = { label?: string; op: string; inputs?: string[] };

const BinaryOpNodeBase = ({ id, data }: NodeProps<Data>) => {
  const value = useNodeOutput(id, "out");
  const a = useConnectedValue(id, "lhs", "out");
  const b = useConnectedValue(id, "rhs", "out");

  return (
    <NodeChrome title={data.label ?? `LHS ${data.op} RHS`} width={170}>
      <TargetPort id="lhs" top={25} label={`LHS: ${displayValue(a)}`} />
      <TargetPort id="rhs" top={55} label={`RHS: ${displayValue(b)}`} />
      <SourcePort />
      <ValueDisplay>{displayValue(value)}</ValueDisplay>
      <NodeSeriesPanel samples={{ out: value }} />
    </NodeChrome>
  );
};

const BinaryOpNode = React.memo(
  BinaryOpNodeBase,
  (prev, next) =>
    prev.id === next.id &&
    prev.data.label === next.data.label &&
    prev.data.op === next.data.op &&
    (prev.data.inputs?.[0] ?? "") === (next.data.inputs?.[0] ?? "") &&
    (prev.data.inputs?.[1] ?? "") === (next.data.inputs?.[1] ?? "")
);

export default BinaryOpNode;
