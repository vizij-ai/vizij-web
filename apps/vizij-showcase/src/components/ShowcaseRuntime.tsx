import type { ReactNode } from "react";
import type { VizijOptions } from "@vizij/runtime";
import { VizijRuntimeProvider } from "@vizij/runtime-react";
import { FACE_ASSET_URLS, type ShowcaseFaceAssetKey } from "../lib/faceAssets";

type ShowcaseRuntimeProps = {
  /** The section's face, unique on the page. */
  namespace: string;
  asset?: ShowcaseFaceAssetKey;
  children: ReactNode;
  /** Load the face; until then the section shows `fallback`. */
  active?: boolean;
  fallback?: ReactNode;
  /** Run the face's device while its section is on screen; an offscreen
   * face stops. */
  visible?: boolean;
  /** `loadVizij`'s options. The face's program runs only where a section
   * asks for it (`program: "auto"`). */
  options?: VizijOptions;
};

const NO_PROGRAM: VizijOptions = { program: "none" };

/** One section's face: its provider, loaded once the section has entered
 * the viewport and running while it is visible. */
export function ShowcaseRuntime({
  namespace,
  asset = "quoriCurrentExtended",
  children,
  active = true,
  fallback = null,
  visible = true,
  options = NO_PROGRAM,
}: ShowcaseRuntimeProps) {
  if (!active) {
    return <>{fallback}</>;
  }
  return (
    <VizijRuntimeProvider
      glb={FACE_ASSET_URLS[asset]}
      vizijId={`showcase-${namespace}`}
      options={options}
      run={visible}
    >
      {children}
    </VizijRuntimeProvider>
  );
}
