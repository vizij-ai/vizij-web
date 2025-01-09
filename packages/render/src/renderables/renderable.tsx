import { ReactNode, memo, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
// import { ErrorBoundary } from "react-error-boundary";
import { useVizijStore } from "../hooks/use-vizij-store";
import { RenderedGroup } from "./group";
import { RenderedEllipse } from "./ellipse";
import { RenderedRoot } from "./root";

export interface RenderableProps {
  id: string;
  namespace: string;
}

/**
 * Renders a group of components based on the type and namespace of a renderable object.
 *
 * @param id - The unique identifier for the renderable object.
 * @param namespace - The namespace associated with the renderable object.
 * @returns A group of rendered components or null if no namespaces are resolved.
 *
 * The function uses the `useVizijStore` hook to retrieve the type and references of the renderable object
 * from the state. It then resolves the namespaces and renders the appropriate component based on the type.
 * Supported types include "body", "shape", and various joint types.
 */
export function InnerRenderable({ id, namespace }: RenderableProps): ReactNode {
  const type = useVizijStore(useShallow((state) => state.world[id].type));
  const refs = useVizijStore(useShallow((state) => state.world[id].refs));

  const resolvedNamespaces = useMemo(() => {
    let namespaces = [namespace];
    if (namespace in refs) {
      namespaces = [namespace];
    } else {
      namespaces = Object.keys(refs);
    }
    return namespaces;
  }, [namespace, refs]);

  if (resolvedNamespaces.length === 0) {
    return null;
  }

  return (
    <g key={id}>
      {resolvedNamespaces.map((ns) => {
        switch (type) {
          case "group":
            return <RenderedGroup key={`${ns}.${id}`} id={id} namespace={ns} />;
          case "ellipse":
            return (
              <RenderedEllipse key={`${ns}.${id}`} id={id} namespace={ns} />
            );
          case "root":
            return <RenderedRoot key={`${ns}.${id}`} id={id} namespace={ns} />;
          default:
            return null;
        }
      })}
    </g>
  );
}

export const Renderable = memo(InnerRenderable);
