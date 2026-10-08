/* eslint-disable import/no-cycle -- circular import will be fixed later*/
import { memo } from "react";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useVizijStore } from "../hooks/use-vizij-store";
import { RenderedGroup } from "./group";
import { RenderedEllipse } from "./ellipse";
import { RenderedRectangle } from "./rectangle";
import { RenderedShape } from "./shape";

export interface RenderableProps {
  id: string;
  namespace: string;
  chain: string[];
}

/**
 * Renders the world element `id` under `namespace`, by its type.
 */
export function InnerRenderable({
  id,
  namespace,
  chain,
}: RenderableProps): ReactNode {
  const type = useVizijStore(useShallow((state) => state.world[id].type));
  const key = `${namespace}.${id}`;

  switch (type) {
    case "group":
      return (
        <RenderedGroup key={key} id={id} namespace={namespace} chain={chain} />
      );
    case "ellipse":
      return (
        <RenderedEllipse
          key={key}
          id={id}
          namespace={namespace}
          chain={chain}
        />
      );
    case "rectangle":
      return (
        <RenderedRectangle
          key={key}
          id={id}
          namespace={namespace}
          chain={chain}
        />
      );
    case "shape":
      return (
        <RenderedShape key={key} id={id} namespace={namespace} chain={chain} />
      );
    default:
      return null;
  }
}

export const Renderable = memo(InnerRenderable);
