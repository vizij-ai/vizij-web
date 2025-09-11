import React from "react";
import type { NodeProps } from "reactflow";
import { useNodeOutput } from "@vizij/node-graph-react";
import { NodeChrome, TargetPort, SourcePort, ValueDisplay } from "./shared/ui";
import { displayValue } from "../../lib/display";
import { useConnectedValue } from "../../lib/hooks";

type Data = { label?: string; op: string; inputs?: string[] };

const UnaryOpNodeBase = ({ id, data }: NodeProps<Data>) => {
  const value = useNodeOutput(id, "out");
  const inputValue = useConnectedValue(id, "in", "out");

  return (
    <NodeChrome title={data.label ?? `${data.op} In`} width={150}>
      <TargetPort id="in" top={38} label={`In: ${displayValue(inputValue)}`} />
      <SourcePort />
      <ValueDisplay>{displayValue(value)}</ValueDisplay>
    </NodeChrome>
  );
};

const UnaryOpNode = React.memo(
  UnaryOpNodeBase,
  (prev, next) =>
    prev.id === next.id &&
    prev.data.label === next.data.label &&
    prev.data.op === next.data.op &&
    (prev.data.inputs?.[0] ?? "") === (next.data.inputs?.[0] ?? "")
);

export default UnaryOpNode;
