import type { BakedAnimationRecords } from "./bakedAnimationProvenance";
import {
  convertGltfAnimations,
  type GltfConversionResult,
} from "./convertGltfAnimations";
import { readGltfAnimationDocument } from "./gltfAnimationDocument";
import type { PropsRigTargetCatalog } from "./propsRigTargetCatalog";

export type GltfAnimationImportResult = GltfConversionResult;

export interface ImportGltfAnimationsOptions {
  glb: ArrayBuffer;
  catalog: PropsRigTargetCatalog;
  clipIdPrefix?: string;
  clipNamePrefix?: string;
  /** What export recorded about the animations it baked, by animation name. */
  bakedRecords?: BakedAnimationRecords;
}

/**
 * Imports a GLB's native glTF animations as Vizij animation clips.
 *
 * A thin composition of the two halves, which are the useful units:
 *
 * - {@link readGltfAnimationDocument} decodes bytes into plain curve data.
 * - {@link convertGltfAnimations} converts that data into clips, purely.
 *
 * Reach for those directly when you have a document already, or want to test
 * the conversion without constructing a GLB.
 */
export function importGltfAnimations(
  options: ImportGltfAnimationsOptions,
): GltfAnimationImportResult {
  const document = readGltfAnimationDocument(options.glb);
  return convertGltfAnimations({
    document,
    catalog: options.catalog,
    clipId: options.clipIdPrefix,
    clipName: options.clipNamePrefix,
    bakedRecords: options.bakedRecords,
  });
}
