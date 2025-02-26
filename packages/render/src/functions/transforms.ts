import { Object3D } from "three";
import * as THREE from "three";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export function convertYupToZup(data: Object3D): Object3D {
  data.rotateX(-Math.PI / 2);
  return data;
}
