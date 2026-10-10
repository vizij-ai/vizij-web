import type { ReactNode } from "react";
import { Vizij, type VizijProps } from "@vizij/render";
import { useVizijRuntime } from "./hooks";

export type VizijRuntimeFaceProps = Omit<VizijProps, "vizijId">;

/** `<Vizij>` bound to the nearest provider's face: where it draws on the
 * page's canvas. */
export function VizijRuntimeFace(props: VizijRuntimeFaceProps): ReactNode {
  const { vizijId } = useVizijRuntime();
  return <Vizij {...props} vizijId={vizijId} />;
}
