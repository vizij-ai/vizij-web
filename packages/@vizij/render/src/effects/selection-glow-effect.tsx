import { Fragment, useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useShallow } from "zustand/react/shallow";
import type {
  BufferGeometry,
  ColorRepresentation,
  LineSegments,
  Object3D,
} from "three";
import {
  AdditiveBlending,
  Color,
  EdgesGeometry,
  LineBasicMaterial,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import type { Selection } from "../types";
import type { VizijActions, VizijData } from "../store-types";
import { useVizijStore } from "../hooks/use-vizij-store";

interface SelectionGlowEffectProps {
  enabled?: boolean;
  color?: ColorRepresentation;
  opacity?: number;
  thresholdAngle?: number;
}

type RenderableWithGeometry = {
  geometry?: BufferGeometry;
  refs?: Record<string, RefObject<Object3D>>;
};

export function SelectionGlowEffect({
  enabled = false,
  color = "#ff1010",
  opacity = 0.9,
  thresholdAngle = 2,
}: SelectionGlowEffectProps) {
  const selections = useVizijStore(
    useShallow((state: VizijData & VizijActions) =>
      enabled ? (state.elementSelection ?? []) : [],
    ),
  );

  if (!enabled || selections.length === 0) {
    return null;
  }

  return (
    <Fragment>
      {selections.map((selection) => (
        <SelectionOutline
          key={`${selection.namespace}:${selection.id}`}
          selection={selection}
          color={selection.color ?? color}
          opacity={opacity}
          thresholdAngle={thresholdAngle}
        />
      ))}
    </Fragment>
  );
}

interface SelectionOutlineProps {
  selection: Selection;
  color: ColorRepresentation;
  opacity: number;
  thresholdAngle: number;
}

function SelectionOutline({
  selection,
  color,
  opacity,
  thresholdAngle,
}: SelectionOutlineProps) {
  const target = useVizijStore(
    useShallow((state: VizijData & VizijActions) => {
      const entry = state.world[selection.id] as
        | RenderableWithGeometry
        | undefined;
      const ref = entry?.refs?.[selection.namespace];
      const geometry = entry?.geometry ?? null;
      return { ref, geometry } as const;
    }),
  );

  const sourceRef = target.ref;

  const edgesGeometry = useMemo(() => {
    if (!target.geometry) return null;
    const edges = new EdgesGeometry(target.geometry, thresholdAngle);
    return edges;
  }, [target.geometry, thresholdAngle]);

  useEffect(() => () => edgesGeometry?.dispose(), [edgesGeometry]);

  const material = useMemo(() => {
    const mat = new LineBasicMaterial({
      color: new Color(color),
      transparent: true,
      opacity,
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    return mat;
  }, [color, opacity]);

  useEffect(() => () => material.dispose(), [material]);

  const lineRef = useRef<LineSegments>(null);

  useFrame(() => {
    const source = sourceRef?.current;
    const line = lineRef.current;
    if (!source || !line) return;
    copyWorldTransform(source, line);
    line.visible = source.visible;
  });

  if (!sourceRef || !edgesGeometry) {
    return null;
  }

  return (
    <lineSegments
      ref={lineRef}
      geometry={edgesGeometry}
      material={material}
      frustumCulled={false}
      renderOrder={1000}
    />
  );
}

const tempMatrix = new Matrix4();
const tempPosition = new Vector3();
const tempQuaternion = new Quaternion();
const tempScale = new Vector3();

function copyWorldTransform(source: Object3D, target: Object3D) {
  source.updateWorldMatrix(true, false);
  tempMatrix.copy(source.matrixWorld);
  tempMatrix.decompose(tempPosition, tempQuaternion, tempScale);
  target.position.copy(tempPosition);
  target.quaternion.copy(tempQuaternion);
  target.scale.copy(tempScale);
  target.updateMatrix();
}
