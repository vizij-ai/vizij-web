/**
 * Canonical morph-target key derivation.
 *
 * Morph feature keys are part of the animation binding contract: a propsrig
 * input path is built from `(elementName, featureKey, component)`, and for a
 * morph the feature key is derived from the morph's name. Import (building
 * animatables from geometry) and animation channel resolution must therefore
 * agree exactly, so both use the helpers here rather than re-deriving the rule.
 *
 * Note the slug is normalized twice on the path route: keys produced here are
 * later passed through `normalizeStandardRigGroup` when the propsrig path is
 * built, which independently lowercases and collapses separators. Casing here
 * is therefore not load-bearing for path resolution — but it *is* the stored
 * feature key on the renderable (and in exported `RobotData`), so changing it
 * still changes the shape of authored data. Unit tests pin the rule directly;
 * the corpus test cannot see a casing change because of the double pass.
 */

function slugifyMorphName(name: string, fallbackIndex: number): string {
  const baseName =
    name && name.trim().length > 0 ? name.trim() : `morph_${fallbackIndex + 1}`;
  const slug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return slug.length > 0 ? slug : `morph_${fallbackIndex + 1}`;
}

/**
 * Allocates the feature key for a single morph target, deduplicating against
 * keys already handed out for the same mesh.
 *
 * `used` is mutated: callers iterating a mesh's morph targets must share one
 * set so collisions resolve deterministically in iteration order.
 */
export function sanitizeMorphKey(
  name: string,
  fallbackIndex: number,
  used: Set<string>,
): string {
  const safeBase = slugifyMorphName(name, fallbackIndex);
  let candidate = safeBase;
  let counter = 1;
  while (used.has(candidate)) {
    candidate = `${safeBase}_${counter++}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Derives feature keys for a mesh's morph targets in order, applying the same
 * dedupe sequence `sanitizeMorphKey` applies during import.
 *
 * Pass morph names in the mesh's own target order (glTF
 * `meshes[].extras.targetNames`, or `morphTargetDictionary` insertion order)
 * so the result matches the keys import produced for that mesh.
 */
export function deriveMorphFeatureKeys(names: ReadonlyArray<string>): string[] {
  const used = new Set<string>();
  return names.map((name, index) => sanitizeMorphKey(name, index, used));
}
