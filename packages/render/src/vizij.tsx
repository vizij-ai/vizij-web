import { type ReactNode, Suspense, memo, useContext } from "react";
import { ErrorBoundary } from "react-error-boundary";
import useMeasure from "react-use-measure";
import { useShallow } from "zustand/shallow";
import { Renderable } from "./renderables";
import { VizijContext } from "./context";
import { useDefaultVizijStore } from "./store";
import { useVizijStore } from "./hooks/use-vizij-store";
import { Resizer } from "./resizer";

export interface VizijProps {
  style?: React.CSSProperties;
  className?: string;
  rootId: string;
  namespace?: string;
}

/**
 * Renders the Vizij component.
 *
 * @param style - The style object for the Vizij component.
 *
 * @param className - The CSS class name for the Vizij component
 *
 * @param rootId - The root identifier for the Vizij component.
 *
 * @param namespace - The namespace for the Vizij component
 *
 * @returns The rendered ReactNode.
 */
export function Vizij({ style, className, rootId, namespace = "default" }: VizijProps): ReactNode {
  const ctx = useContext(VizijContext);
  if (ctx) {
    return (
      <MemoizedInnerVizij
        style={style}
        className={className}
        rootId={rootId}
        namespace={namespace}
      />
    );
  } else {
    return (
      <VizijContext.Provider value={useDefaultVizijStore}>
        <MemoizedInnerVizij
          style={style}
          className={className}
          rootId={rootId}
          namespace={namespace}
        />
      </VizijContext.Provider>
    );
  }
}

export function InnerVizij({ style, className, rootId, namespace = "default" }: VizijProps) {
  const [ref, bounds] = useMeasure();
  return (
    <svg ref={ref} style={style} className={className}>
      <Suspense fallback={null}>
        <World width={bounds.width} height={bounds.height} rootId={rootId} namespace={namespace} />
      </Suspense>
    </svg>
  );
}

const MemoizedInnerVizij = memo(InnerVizij);

/**
 * Renders the inner world of the scene.
 * This includes the items in the scene, other than general lighting, the grid, and background.
 * For each namespace, renders the tree as a renderable component.
 *
 * @returns The JSX element representing the inner world.
 */
function InnerWorld({
  height,
  width,
  rootId,
  namespace = "default",
}: {
  height: number;
  width: number;
  rootId: string;
  namespace?: string;
}) {
  const present = useVizijStore(useShallow((state) => state.world[rootId] !== undefined));

  if (!present) {
    return null;
  }

  return (
    <ErrorBoundary fallback={null}>
      <Resizer width={width} height={height}>
        <Renderable id={rootId} namespace={namespace} />
      </Resizer>
    </ErrorBoundary>
  );
}

const World = memo(InnerWorld);
