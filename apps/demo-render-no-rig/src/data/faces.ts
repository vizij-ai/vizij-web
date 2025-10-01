import QuoriGLB from "../../../website/src/assets/Quori.glb";
import HugoGLB from "../../../website/src/assets/Hugo.glb";
import AbiGLB from "../../../website/src/assets/Abi.glb";
import BaxterGLB from "../../../website/src/assets/Baxter.glb";
import JiboGLB from "../../../website/src/assets/Jibo.glb";
import TiagoGLB from "../../../website/src/assets/Tiago.glb";

import type { RawValue, RawVector2 } from "@vizij/utils";

export interface FaceInitialValue {
  name: string;
  value: RawValue;
}

export interface FaceConfig {
  id: string;
  name: string;
  asset: string;
  bounds: {
    center: RawVector2;
    size: RawVector2;
  };
  namespace?: string;
  initialValues?: FaceInitialValue[];
  aggressiveImport?: boolean;
}

export const FACES: FaceConfig[] = [
  {
    id: "quori",
    name: "Quori",
    asset: QuoriGLB,
    bounds: {
      center: { x: 0.01, y: -0.04 },
      size: { x: 0.6, y: 0.4 },
    },
  },
  {
    id: "hugo",
    name: "Hugo",
    asset: HugoGLB,
    bounds: {
      center: { x: 0, y: 0 },
      size: { x: 4, y: 5 },
    },
    initialValues: [{ name: "Black_S", value: { r: 0, g: 0, b: 0 } }],
  },
  {
    id: "abi",
    name: "Abi",
    asset: AbiGLB,
    bounds: {
      center: { x: 0, y: 0 },
      size: { x: 2, y: 3 },
    },
  },
  {
    id: "baxter",
    name: "Baxter",
    asset: BaxterGLB,
    bounds: {
      center: { x: 0, y: -0.25 },
      size: { x: 6, y: 5 },
    },
  },
  {
    id: "jibo",
    name: "Jibo",
    asset: JiboGLB,
    bounds: {
      center: { x: 0, y: 0 },
      size: { x: 5, y: 5 },
    },
  },
  {
    id: "tiago",
    name: "Tiago",
    asset: TiagoGLB,
    bounds: {
      center: { x: 0, y: 0 },
      size: { x: 5, y: 5 },
    },
  },
];

export const DEFAULT_FACE_ID = "quori";

export function getFaceById(
  id: string | undefined | null,
): FaceConfig | undefined {
  if (!id) return undefined;
  return FACES.find((face) => face.id === id);
}
