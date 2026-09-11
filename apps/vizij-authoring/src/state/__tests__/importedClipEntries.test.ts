import { describe, expect, it } from "vitest";
import { buildImportedClipEntries } from "../importedClipEntries";

/**
 * Seeding is where the previous two attempts at single ownership went wrong:
 * both mirrored App's state into the store with an effect, and the mirror
 * disagreed with its source. This builds entries from the bundle directly, so
 * there is one derivation and nothing to keep in step.
 */

function bundleEntry(id: string, name: string, tracks = 1) {
  return {
    id,
    clip: {
      id,
      name,
      duration: 5,
      tracks: Array.from({ length: tracks }, (_, index) => ({
        id: `t${index}`,
        variableId: `input_${index}`,
        channel: `propsrig/input_${index}`,
        interpolation: "linear",
        keyframes: [{ id: "k0", time: 0, value: 0 }],
      })),
    },
  } as never;
}

const BASE = { targetPrefix: "bundle-animation:", sessionKey: "root-abc" };

describe("buildImportedClipEntries", () => {
  it("builds one entry per bundle animation, keeping App's target ids", () => {
    const entries = buildImportedClipEntries({
      ...BASE,
      animations: [
        bundleEntry("clip.a", "Stages"),
        bundleEntry("clip.b", "Nonesense"),
      ],
    });

    expect(entries.map((entry) => entry.targetId)).toEqual([
      "bundle-animation:root-abc:0",
      "bundle-animation:root-abc:1",
    ]);
    expect(entries.map((entry) => entry.name)).toEqual(["Stages", "Nonesense"]);
    expect(entries.every((entry) => entry.source === "imported")).toBe(true);
  });

  it("keeps baseline and clip as separate instances", () => {
    // They start equal and must not stay aliased: editing the clip would
    // otherwise edit the baseline too, and "is this edited?" could never be
    // answered.
    const [entry] = buildImportedClipEntries({
      ...BASE,
      animations: [bundleEntry("clip.a", "Stages")],
    });
    expect(entry!.baseline).toEqual(entry!.clip);
    expect(entry!.baseline).not.toBe(entry!.clip);
    (entry!.clip.tracks[0] as { channel: string }).channel = "changed";
    expect(entry!.baseline!.tracks[0]!.channel).toBe("propsrig/input_0");
  });

  it("falls back to the entry id, then to a positional name", () => {
    const entries = buildImportedClipEntries({
      ...BASE,
      animations: [bundleEntry("clip.a", "   "), bundleEntry("", "")],
    });
    expect(entries[0]!.name).toBe("clip.a");
    expect(entries[1]!.name).toBe("Imported Animation 2");
  });

  it("skips a duplicate clip id rather than letting edits cross clips", () => {
    // Clip id is the identity everywhere downstream; two entries sharing one
    // is how a clip's edits end up addressing a different clip.
    const entries = buildImportedClipEntries({
      ...BASE,
      animations: [bundleEntry("same", "First"), bundleEntry("same", "Second")],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe("First");
  });

  it("returns nothing for a bundle with no animations", () => {
    expect(
      buildImportedClipEntries({ ...BASE, animations: undefined }),
    ).toEqual([]);
    expect(buildImportedClipEntries({ ...BASE, animations: [] })).toEqual([]);
  });
});
