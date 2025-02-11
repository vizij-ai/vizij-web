import { type ReactNode, Suspense, memo, useContext, useEffect } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Object3D, OrthographicCamera as OrthographicCameraType } from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import { useShallow } from "zustand/shallow";
import { Renderable } from "./renderables";
import { VizijContext } from "./context";
import { useDefaultVizijStore } from "./store";
import { useVizijStore } from "./hooks/use-vizij-store";

Object3D.DEFAULT_UP.set(0, 0, 1);

export interface VizijProps {
  style?: React.CSSProperties;
  className?: string;
  rootId: string;
  namespace?: string;
  width: number;
  height: number;
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
export function Vizij({
  style,
  className,
  rootId,
  namespace = "default",
  height,
  width,
}: VizijProps): ReactNode {
  const ctx = useContext(VizijContext);
  if (ctx) {
    return (
      <Canvas shadows={false} style={style} className={className}>
        <MemoizedInnerVizij rootId={rootId} namespace={namespace} height={height} width={width} />
      </Canvas>
    );
  } else {
    return (
      <VizijContext.Provider value={useDefaultVizijStore}>
        <Canvas style={style} className={className}>
          <MemoizedInnerVizij rootId={rootId} namespace={namespace} height={height} width={width} />
        </Canvas>
      </VizijContext.Provider>
    );
  }
}

export function InnerVizij({
  rootId,
  namespace = "default",
  width,
  height,
  resolution,
}: Omit<VizijProps, "className" | "style"> & { resolution?: number }) {
  const { camera, size } = useThree((state) => ({
    camera: state.camera,
    size: state.size,
  }));

  useEffect(() => {
    if (
      camera &&
      resolution === undefined &&
      (camera as OrthographicCameraType).isOrthographicCamera
    ) {
      const zoom = Math.min(size.width / width, size.height / height);
      if (camera.zoom !== zoom) {
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
      }
    } else if (
      camera &&
      resolution !== undefined &&
      (camera as OrthographicCameraType).isOrthographicCamera
    ) {
      (camera as OrthographicCameraType).left = width * resolution * -1;
      (camera as OrthographicCameraType).right = width * resolution;
      (camera as OrthographicCameraType).top = height * resolution;
      (camera as OrthographicCameraType).bottom = height * resolution * -1;
      (camera as OrthographicCameraType).updateProjectionMatrix();
    }
  }, [size, height, width, resolution, camera]);

  return (
    <>
      <ambientLight intensity={Math.PI / 2} />
      <color attach="background" args={["white"]} />
      <OrthographicCamera makeDefault position={[0, 0, 100]} near={0.1} far={101} />
      <Suspense fallback={null}>
        <World rootId={rootId} namespace={namespace} />
      </Suspense>
    </>
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
function InnerWorld({ rootId, namespace = "default" }: { rootId: string; namespace?: string }) {
  const present = useVizijStore(useShallow((state) => state.world[rootId] !== undefined));

  if (!present) {
    console.log("not found");
    return null;
  }
  console.log("rendering content");

  return (
    <ErrorBoundary fallback={null}>
      <Renderable id={rootId} namespace={namespace} chain={[]} />
    </ErrorBoundary>
  );
}

const World = memo(InnerWorld);
