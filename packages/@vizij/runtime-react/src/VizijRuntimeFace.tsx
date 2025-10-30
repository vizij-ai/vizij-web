import { memo } from "react";
import { Vizij } from "@vizij/render";
import { useVizijRuntime } from "./hooks/useVizijRuntime";
import type { VizijRuntimeFaceProps } from "./types";

function VizijRuntimeFaceInner({
  namespaceOverride,
  ...props
}: VizijRuntimeFaceProps) {
  const { rootId, namespace } = useVizijRuntime();
  if (!rootId) {
    return null;
  }
  return (
    <Vizij
      {...props}
      rootId={rootId}
      namespace={namespaceOverride ?? namespace}
    />
  );
}

export const VizijRuntimeFace = memo(VizijRuntimeFaceInner);
