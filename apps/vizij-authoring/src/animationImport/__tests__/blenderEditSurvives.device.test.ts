// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readGltfAnimationDocument } from "../gltfAnimationDocument";

/**
 * Does an edit made in Blender survive back into Vizij?
 *
 * The round trip was never run against a real Blender edit. This reads the
 * GLB Blender actually wrote and checks the edited value is in it, decoded
 * the way the importer decodes it — the interesting part being that Blender's
 * exporter merges every morph target of a mesh into one `weights` channel, so
 * a per-morph edit has to be recovered from an interleaved array rather than
 * read off its own curve.
 *
 * The fixture is produced by hand, not by this suite, so the test skips when
 * it is absent rather than failing:
 *
 *   1. save a GLB from Vizij (quori:latest)
 *   2. import it in Blender, change one morph keyframe to 0.85, export to
 *      /tmp/vizij-roundtrip/blender-edited.glb
 *
 * Recorded values come from the run on 2026-09-08: the `ltsneer` morph on
 * `Mouth`, keyframe at Blender frame 29.6, moved from 0.0 to 0.85.
 */

const EDITED = "/tmp/vizij-roundtrip/blender-edited.glb";
const EXPECTED_VALUE = 0.85;

function loadGlb(path: string): ArrayBuffer {
  const bytes = readFileSync(path);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe.skipIf(!existsSync(EDITED))(
  "a Blender edit, read back through the importer's decoder",
  () => {
    it("carries the edited value out of the merged weights channel", () => {
      const document = readGltfAnimationDocument(loadGlb(EDITED));
      expect(document.readErrors).toEqual([]);

      const edited = document.animations.find(
        (animation) => animation.name === "Nonesense",
      );
      expect(edited, "the edited animation is present by name").toBeTruthy();

      // Every sampled value across every curve of that animation. The edit
      // was a single keyframe, so it is enough that the value reached the
      // file and decodes — which curve carries it is Blender's business.
      const values = edited!.curves.flatMap((curve) =>
        Array.from(curve.values ?? []),
      );
      expect(values.length).toBeGreaterThan(0);

      const closest = values.reduce((best, value) =>
        Math.abs(value - EXPECTED_VALUE) < Math.abs(best - EXPECTED_VALUE)
          ? value
          : best,
      );

      // Not exactly 0.85, and it should not be. Blender resamples fcurves
      // onto whole frames when it exports glTF, and the edited keyframe sat
      // at frame 29.6 — so the nearest exported sample lands just off the
      // peak. Measured at 0.8429. What matters is that a 0 became a ~0.84:
      // the edit reached the file and decodes out of the merged channel.
      expect(
        closest,
        `no sampled value near ${EXPECTED_VALUE} survived the round trip; ` +
          `closest was ${closest}`,
      ).toBeGreaterThan(0.8);
      expect(closest).toBeLessThanOrEqual(EXPECTED_VALUE + 1e-6);
    });

    it("has lost the Vizij bundle, which is why this path is import-new", () => {
      // Blender's exporter drops unknown glTF extensions, so the file it
      // writes carries no `VIZIJ_bundle` and no `bakedAnimations` records.
      // Provenance therefore cannot match anything and every animation reads
      // as new — which is the right outcome here, but it means
      // `keep-both-edited` is unreachable through a real Blender re-export.
      const raw = readFileSync(EDITED);
      const jsonLength = raw.readUInt32LE(12);
      const json = raw.subarray(20, 20 + jsonLength).toString("utf8");
      expect(json).not.toContain("VIZIJ_bundle");
      expect(json).not.toContain("bakedAnimations");
    });
  },
);
