import { memo, useCallback, useRef, useMemo, useEffect } from "react";
import type { RefObject, ReactNode, Ref } from "react";
import * as THREE from "three";
import type {
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshNormalMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
} from "three";
import { useShallow } from "zustand/react/shallow";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import {
  instanceOfRawEuler,
  instanceOfRawHSL,
  instanceOfRawNumber,
  instanceOfRawRGB,
  instanceOfRawVector3,
} from "@vizij/utils";
import type { ThreeEvent } from "@react-three/fiber";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Shape } from "../types/shape";
import { useVizijStore } from "../hooks/use-vizij-store";
import { useFeatures } from "../hooks/use-features";
import { createStoredRenderable } from "../functions/create-stored-data";
// eslint-disable-next-line import/no-cycle -- circular import will be fixed later
import { Renderable } from "./renderable";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export interface RenderedShapeProps {
  id: string;
  namespace: string;
  chain: string[];
}

function InnerRenderedShape({
  id,
  namespace,
  chain,
}: RenderedShapeProps): ReactNode {
  const refGroup = useRef<THREE.Group>(null) as RefObject<THREE.Group>;
  const ref = useRef<THREE.Mesh>(null) as RefObject<THREE.Mesh>;
  const shape = useVizijStore(useShallow((state) => state.world[id] as Shape));

  const refs = useVizijStore(
    useShallow((state) => (state.world[id] as Shape).refs),
  );
  const refIsNull = !refs[namespace]?.current;

  const animatables = useVizijStore(useShallow((state) => state.animatables));

  const animatableValues = useMemo(() => {
    const av: Record<string, AnimatableValue> = {};
    Object.values(shape.features).forEach((feat) => {
      if (feat.animated) {
        const animatable = animatables[feat.value];
        av[animatable.id] = animatable;
      }
    });
    return av;
  }, [shape.features, animatables]);

  const materialName = useMemo(
    () => deriveMaterialName(shape, animatableValues),
    [shape, animatableValues],
  );

  // const setSelectedWorldElement = useSceneStore(
  //   useShallow((state) => state.setSelectedWorldElement),
  // );

  const geometry = useMemo(() => {
    const cloned = shape.geometry.clone();
    if (shape.name) {
      cloned.name = shape.name;
    }
    return cloned;
  }, [shape.geometry, shape.name]);

  const selectionData = useMemo(
    () => ({ id, namespace, type: "shape" as const }),
    [id, namespace],
  );

  const userData = useMemo(
    () => ({
      gltfExtensions: {
        RobotData: createStoredRenderable(shape, animatableValues),
      },
      selection: selectionData,
    }),
    [shape, animatableValues, selectionData],
  );

  const material = useRef<
    | MeshBasicMaterial
    | MeshLambertMaterial
    | MeshPhongMaterial
    | MeshNormalMaterial
    | MeshStandardMaterial
  >(null);

  const morphTargetSettings: [
    Record<string, number> | undefined,
    number[] | undefined,
    Record<string, (value: RawValue) => void>,
  ] = useMemo(() => {
    if (shape.morphTargets) {
      const dictionary = shape.morphTargets.reduce(
        (acc, target, i) => ({ ...acc, [target]: i }),
        {},
      );
      const initialInfluences = shape.morphTargets.map(() => 0);
      const morphFeatureHandlers: Record<string, (value: RawValue) => void> =
        {};
      shape.morphTargets.forEach((target, i) => {
        morphFeatureHandlers[target] = (value: RawValue) => {
          if (
            ref.current?.morphTargetInfluences &&
            instanceOfRawNumber(value)
          ) {
            ref.current!.morphTargetInfluences![i] = value;
          }
        };
      });
      return [dictionary, initialInfluences, morphFeatureHandlers];
    } else {
      return [undefined, undefined, {}];
    }
  }, [shape.morphTargets]);

  useFeatures(
    namespace,
    shape.features,
    {
      translation: (pos: RawValue) => {
        if (ref.current?.position && instanceOfRawVector3(pos)) {
          ref.current!.position.set(
            pos.x as number,
            pos.y as number,
            pos.z as number,
          );
        }
        if (refGroup.current?.position && instanceOfRawVector3(pos)) {
          refGroup.current!.position.set(
            pos.x as number,
            pos.y as number,
            pos.z as number,
          );
        }
      },
      rotation: (rot: RawValue) => {
        if (ref.current?.rotation && instanceOfRawEuler(rot)) {
          ref.current!.rotation.set(rot.x, rot.y, rot.z, "ZYX");
        }
        if (refGroup.current?.rotation && instanceOfRawEuler(rot)) {
          refGroup.current!.rotation.set(rot.x, rot.y, rot.z, "ZYX");
        }
      },
      scale: (scale: RawValue) => {
        if (ref.current?.scale && instanceOfRawVector3(scale)) {
          ref.current!.scale.set(scale.x, scale.y, scale.z);
        } else if (ref.current && instanceOfRawNumber(scale)) {
          ref.current!.scale.set(scale, scale, scale);
        } else if (ref.current) {
          ref.current!.scale.set(1, 1, 1);
        }
      },
      opacity: (op: RawValue) => {
        if (
          material.current?.opacity !== undefined &&
          instanceOfRawNumber(op)
        ) {
          material.current.opacity = op;
          if (op < 1.0) {
            material.current.transparent = true;
          } else {
            material.current.transparent = false;
          }
          material.current.needsUpdate = true;
        }
      },
      color: (color: RawValue) => {
        if (
          ((material.current as MeshStandardMaterial) || undefined)?.color &&
          instanceOfRawRGB(color)
        ) {
          (material.current as MeshStandardMaterial).color.setRGB(
            color.r,
            color.g,
            color.b,
          );
          (material.current as MeshStandardMaterial).needsUpdate = true;
        } else if (
          ((material.current as MeshStandardMaterial) || undefined)?.color &&
          instanceOfRawVector3(color)
        ) {
          (material.current as MeshStandardMaterial).color.setRGB(
            color.x,
            color.y,
            color.z,
          );
          (material.current as MeshStandardMaterial).needsUpdate = true;
        } else if (material.current && instanceOfRawHSL(color)) {
          (material.current as MeshStandardMaterial).color.setHSL(
            color.h,
            color.s,
            color.l,
          );
        }
      },
      ...morphTargetSettings[2],
    },
    shape,
  );
  // const showAxes = useSceneStore(useShallow((state) => id === state.selectedWorldElement));
  const setReference = useVizijStore(useShallow((state) => state.setReference));
  const onElementClick = useVizijStore(
    useShallow((state) => state.onElementClick),
  );
  const setHoveredElement = useVizijStore(
    useShallow((state) => state.setHoveredElement),
  );

  useEffect(() => {
    if (ref.current && refIsNull) setReference(shape.id, namespace, ref);
  }, [shape.id, namespace, ref, setReference, refIsNull]);

  useEffect(() => {
    if (ref.current) {
      ref.current.name = shape.name;
    }
  }, [shape.name]);

  useEffect(() => {
    if (!material.current) {
      return;
    }
    if (materialName) {
      material.current.name = materialName;
    } else if (shape.name) {
      material.current.name = shape.name;
    }
  }, [materialName, shape.name]);

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      setHoveredElement({ id, namespace, type: "shape" });
    },
    [id, namespace, setHoveredElement],
  );

  const handlePointerOut = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      setHoveredElement(null);
    },
    [setHoveredElement],
  );

  return (
    <mesh
      ref={ref as Ref<THREE.Mesh>}
      userData={userData}
      castShadow
      receiveShadow
      up={[0, 0, 1]}
      geometry={geometry}
      morphTargetDictionary={morphTargetSettings[0]}
      morphTargetInfluences={morphTargetSettings[1]}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={(e: ThreeEvent<ReactMouseEvent>) => {
        console.log("Clicked element", shape);
        onElementClick({ id, type: "shape", namespace }, [...chain, id], e);
      }}
    >
      {shape.material === "basic" && (
        <meshBasicMaterial
          attach="material"
          ref={material as RefObject<MeshBasicMaterial>}
          side={THREE.DoubleSide}
        />
      )}
      {shape.material === "lambert" && (
        <meshLambertMaterial
          attach="material"
          ref={material as RefObject<MeshLambertMaterial>}
          side={THREE.DoubleSide}
        />
      )}
      {shape.material === "phong" && (
        <meshPhongMaterial
          attach="material"
          ref={material as RefObject<MeshPhongMaterial>}
          side={THREE.DoubleSide}
        />
      )}
      {shape.material === "standard" && (
        <meshStandardMaterial
          attach="material"
          ref={material as RefObject<MeshStandardMaterial>}
          side={THREE.DoubleSide}
        />
      )}
      {shape.material === "normal" && (
        <meshNormalMaterial
          attach="material"
          ref={material as RefObject<MeshNormalMaterial>}
          side={THREE.DoubleSide}
        />
      )}
      {shape.children?.map((child) => (
        <Renderable
          key={child}
          id={child}
          namespace={namespace}
          chain={[...chain, id]}
        />
      ))}
    </mesh>
  );
}

export const RenderedShape = memo(InnerRenderedShape);

const MATERIAL_FEATURE_KEYS: Array<Extract<keyof Shape["features"], string>> = [
  "color",
  "opacity",
  "roughness",
  "metalness",
  "shininess",
];

const MATERIAL_NAME_SUFFIXES = [
  " color",
  " colours",
  " colour",
  " opacity",
  " roughness",
  " metalness",
  " shininess",
];

function deriveMaterialName(
  shape: Shape,
  values: Record<string, AnimatableValue>,
): string | undefined {
  for (const key of MATERIAL_FEATURE_KEYS) {
    const feature = shape.features[key as keyof Shape["features"]];
    if (feature && feature.animated) {
      const animatable = values[feature.value];
      const candidate = extractMaterialName(animatable?.name);
      if (candidate) {
        return candidate;
      }
    }
  }
  return undefined;
}

function extractMaterialName(name?: string): string | undefined {
  if (!name) {
    return undefined;
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return undefined;
  }

  const lowered = trimmed.toLowerCase();

  for (const suffix of MATERIAL_NAME_SUFFIXES) {
    if (lowered.endsWith(suffix)) {
      return trimmed.slice(0, trimmed.length - suffix.length).trim();
    }
  }

  return trimmed;
}
