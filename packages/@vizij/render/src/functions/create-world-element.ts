import type { RefObject } from "react";
import type { Group as ThreeGroup } from "three";
import { Feature } from "../types/feature";
import { Group } from "../types/group";

export function createDefaultGroup(partialBody: Partial<Group>): Group {
  const translation: Feature =
    partialBody.features?.translation ||
    ({ animated: false, value: { x: 0, y: 0 } } as Feature);
  const rotation: Feature =
    partialBody.features?.rotation ||
    ({ animated: false, value: { x: 0, y: 0, z: 0 } } as Feature);
  const scale: Feature =
    partialBody.features?.scale ||
    ({ animated: false, value: { x: 1, y: 1, z: 1 } } as Feature);

  return {
    id: partialBody.id || (crypto.randomUUID() as string),
    name: partialBody.name || "new-body",
    type: partialBody.type || "group",
    tags: partialBody.tags || [],
    refs: partialBody.refs || ({} as Record<string, RefObject<ThreeGroup>>),
    features: { translation, rotation, scale },
    root: partialBody.root ?? false,
    children: partialBody.children || [],
  };
}
