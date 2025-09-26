import { ReactNode, memo, RefObject, useEffect, useRef, useMemo } from "react";
import * as THREE from "three";
import { useShallow } from "zustand/react/shallow";
import {
  RawValue,
  AnimatableValue,
  instanceOfRawEuler,
  instanceOfRawNumber,
  instanceOfRawVector2,
  instanceOfRawVector3,
} from "utils";
import { useFeatures } from "../hooks/use-features";
import { Group } from "../types/group";
import { useVizijStore } from "../hooks/use-vizij-store";
import { createStoredRenderable } from "../functions/create-stored-data";
import { VizijActions } from "../store-types";
// eslint-disable-next-line import/no-cycle -- circular import will be fixed later
import { Renderable } from "./renderable";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export interface RenderedGroupProps {
  id: string;
  namespace: string;
  chain: string[];
}

function InnerRenderedGroup({
  id,
  namespace,
  chain,
}: RenderedGroupProps): ReactNode {
  const ref = useRef<THREE.Group>() as RefObject<THREE.Group>;
  const group = useVizijStore(useShallow((state) => state.world[id] as Group));
  const refIsNull = !group.refs[namespace]?.current;

  const animatables = useVizijStore(useShallow((state) => state.animatables));

  const animatableValues = useMemo(() => {
    const av: Record<string, AnimatableValue> = {};
    Object.values(group.features).forEach((feat) => {
      if (feat.animated) {
        const animatable = animatables[feat.value];
        av[animatable.id] = animatable;
      }
    });
    return av;
  }, [group.features, animatables]);

  const userData = {
    gltfExtensions: {
      RobotData: createStoredRenderable(group, animatableValues),
    },
  };

  useFeatures(namespace, group.features, {
    translation: (pos: RawValue) => {
      if (ref.current?.position && instanceOfRawVector3(pos)) {
        ref.current!.position.set(
          pos.x as number,
          pos.y as number,
          pos.z as number,
        );
      } else if (ref.current?.position && instanceOfRawVector2(pos)) {
        const currentZ = ref.current.position.z;
        ref.current!.position.set(pos.x as number, pos.y as number, currentZ);
      }
    },
    rotation: (rot: RawValue) => {
      if (ref.current?.rotation && instanceOfRawEuler(rot)) {
        ref.current!.rotation.set(rot.x, rot.y, rot.z, "ZYX");
      } else if (ref.current?.rotation && instanceOfRawNumber(rot)) {
        ref.current!.rotation.set(0, 0, 0);
        ref.current.rotateZ(rot);
      }
    },
    scale: (scale: RawValue) => {
      if (ref.current?.scale && instanceOfRawVector3(scale)) {
        if (scale.x === null || scale.y === null || scale.z === null) {
          ref.current!.scale.set(0.1, 0.1, 0.1);
          return;
        }
        ref.current!.scale.set(scale.x, scale.y, scale.z);
      } else if (ref.current && instanceOfRawNumber(scale)) {
        ref.current!.scale.set(scale, scale, scale);
      } else if (ref.current) {
        ref.current!.scale.set(1, 1, 1);
      }
    },
  });

  const setReference = useVizijStore(
    useShallow((state: VizijActions) => state.setReference),
  );

  useEffect(() => {
    if (ref.current && refIsNull) {
      setReference(group.id, namespace, ref);
    }
  }, [group.id, namespace, ref, setReference, refIsNull]);

  return (
    <group ref={ref} uuid={`${namespace}.${group.id}`} userData={userData}>
      {group.children.map((child) => (
        <Renderable
          key={child}
          id={child}
          namespace={namespace}
          chain={[...chain, id]}
        />
      ))}
    </group>
  );
}

export const RenderedGroup = memo(InnerRenderedGroup);
