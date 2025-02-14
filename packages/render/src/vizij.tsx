import { type ReactNode, Suspense, memo, useContext, useEffect } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Object3D, OrthographicCamera as OrthographicCameraType } from "three";
import { Canvas, useThree } from "@react-three/fiber";
import { Bounds, Line, OrthographicCamera } from "@react-three/drei";
import { useShallow } from "zustand/shallow";
import { Renderable } from "./renderables";
import { VizijContext } from "./context";
import { useDefaultVizijStore } from "./store";
import { useVizijStore } from "./hooks/use-vizij-store";
import { Group } from "./types";

Object3D.DEFAULT_UP.set(0, 0, 1);

export interface VizijProps {
  style?: React.CSSProperties;
  className?: string;
  rootId: string;
  namespace?: string;
  showSafeArea?: boolean;
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
 * @param showSafeArea - Whether to show the safe area.
 *
 * @returns The rendered ReactNode.
 */
export function Vizij({
  style,
  className,
  rootId,
  namespace = "default",
  showSafeArea = false,
}: VizijProps): ReactNode {
  const ctx = useContext(VizijContext);
  if (ctx) {
    return (
      <Canvas shadows={false} style={style} className={className}>
        <MemoizedInnerVizij rootId={rootId} namespace={namespace} showSafeArea={showSafeArea} />
      </Canvas>
    );
  } else {
    return (
      <VizijContext.Provider value={useDefaultVizijStore}>
        <Canvas style={style} className={className}>
          <MemoizedInnerVizij rootId={rootId} namespace={namespace} showSafeArea={showSafeArea} />
        </Canvas>
      </VizijContext.Provider>
    );
  }
}

export interface InnerVizijProps {
  rootId: string;
  namespace: string;
  container?: {
    width: number;
    height: number;
    resolution: number;
  };
  showSafeArea?: boolean;
}

export function InnerVizij({
  rootId,
  namespace = "default",
  container,
  showSafeArea,
}: InnerVizijProps) {
  const sceneParentSizing: { width: number; height: number } | undefined = container
    ? {
        width: container.width * container.resolution,
        height: container.height * container.resolution,
      }
    : undefined;

  return (
    <>
      <ambientLight intensity={Math.PI / 2} />
      {/* <color attach="background" args={["white"]} /> */}
      <OrthographicCamera makeDefault position={[0, 0, 100]} near={0.1} far={101} />
      <Suspense fallback={null}>
        <World rootId={rootId} namespace={namespace} parentSizing={sceneParentSizing} />
      </Suspense>
      {showSafeArea && <SafeAreaRenderer rootId={rootId} />}
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
function InnerWorld({
  rootId,
  namespace = "default",
  parentSizing,
}: {
  rootId: string;
  namespace?: string;
  parentSizing?: { width: number; height: number };
}) {
  const [present, rootBounds] = useVizijStore(
    useShallow((state) => [
      state.world[rootId] !== undefined,
      (state.world[rootId] as Group)?.rootBounds,
    ]),
  );
  const { camera, size } = useThree((state) => ({
    camera: state.camera,
    size: state.size,
  }));

  useEffect(() => {
    const width = rootBounds ? rootBounds.size.x : 1;
    const height = rootBounds ? rootBounds.size.y : 1;

    if (
      camera &&
      parentSizing === undefined &&
      (camera as OrthographicCameraType).isOrthographicCamera
    ) {
      const zoom = Math.min(size.width / width, size.height / height);
      const center = rootBounds?.center ?? { x: 0, y: 0 };
      if (camera.zoom !== zoom) {
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
      }
      if (camera.position.x !== center.x || camera.position.y !== center.y) {
        camera.position.x = center.x;
        camera.position.y = center.y;
        camera.updateProjectionMatrix();
      }
    } else if (
      camera &&
      parentSizing !== undefined &&
      (camera as OrthographicCameraType).isOrthographicCamera
    ) {
      const zoom = Math.min(parentSizing.width / width, parentSizing.height / height);
      const center = rootBounds?.center ?? { x: 0, y: 0 };

      (camera as OrthographicCameraType).left = (-0.5 * parentSizing.width) / zoom + center.x;
      (camera as OrthographicCameraType).right = (0.5 * parentSizing.width) / zoom + center.x;
      (camera as OrthographicCameraType).top = (0.5 * parentSizing.height) / zoom + center.y;
      (camera as OrthographicCameraType).bottom = (-0.5 * parentSizing.height) / zoom + center.y;
      (camera as OrthographicCameraType).updateProjectionMatrix();
    }
  }, [rootBounds, camera, parentSizing, size]);

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

function SafeAreaRenderer({ rootId }: { rootId: string }) {
  const rootBounds = useVizijStore(
    useShallow((state) => (state.world[rootId] as Group)?.rootBounds),
  );

  if (!rootBounds) {
    return null;
  }

  const left = rootBounds.center.x - rootBounds.size.x / 2;
  const right = rootBounds.center.x + rootBounds.size.x / 2;
  const top = rootBounds.center.y + rootBounds.size.y / 2;
  const bottom = rootBounds.center.y - rootBounds.size.y / 2;

  // Render a line for the bounds
  return (
    <Line
      points={[
        [left, top],
        [right, top],
        [right, bottom],
        [left, bottom],
        [left, top],
      ]}
      color="red"
      lineWidth={2}
    />
  );
}
