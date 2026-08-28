import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { VizijBundleProfile } from "@vizij/render";

/**
 * The namespaces the open face's declared profiles occupy, mapped to the name
 * to show for each.
 *
 * A standard path is `/standard/<namespace>/<subgroup…>/<attribute>`, so the
 * segment after `standard` is the group. The trouble is telling that apart from
 * a legacy path with no namespace at all (`/standard/left_eye/pos/x`), where
 * the same segment is a channel. Counting segments guesses, and guesses wrong:
 * `/standard/vizij/expression/happy` and `/standard/vizij/left_eye/pos/x` are
 * one profile but different lengths.
 *
 * A declared profile settles it. If the face says it speaks `vizij-face` and
 * that profile's paths live under `standard/vizij/`, then `vizij` is a
 * namespace — known, not inferred. Paths outside any declared namespace keep
 * the old behaviour.
 *
 * This is what `bundle.profiles` is *for*: the record of which vocabularies a
 * face declares, used to read its own paths correctly.
 */
export type DeclaredNamespaces = ReadonlyMap<string, string>;

const DeclaredProfilesContext = createContext<DeclaredNamespaces>(new Map());

/** The namespace a profile's paths occupy, or `null` when they disagree. */
export function namespaceOfProfile(profile: VizijBundleProfile): string | null {
  const namespaces = new Set<string>();
  for (const key of profile.keys) {
    // Paths may be face-addressed (`rig/<faceId>/standard/…`) or portable.
    const match = key.path.match(/(?:^|\/)standard\/([^/]+)\//);
    if (match?.[1]) {
      namespaces.add(match[1]);
    }
  }
  // A profile spanning several namespaces names none of them; grouping such a
  // profile under one heading would misfile most of it.
  return namespaces.size === 1 ? [...namespaces][0]! : null;
}

export function DeclaredProfilesProvider({
  profiles,
  children,
}: {
  profiles: readonly VizijBundleProfile[];
  children: ReactNode;
}) {
  const value = useMemo(() => {
    const map = new Map<string, string>();
    for (const profile of profiles) {
      const namespace = namespaceOfProfile(profile);
      if (namespace) {
        map.set(namespace, profile.title ?? profile.id);
      }
    }
    return map;
  }, [profiles]);

  return (
    <DeclaredProfilesContext.Provider value={value}>
      {children}
    </DeclaredProfilesContext.Provider>
  );
}

/** The declared namespaces, empty when no face is open or none are declared. */
export function useDeclaredNamespaces(): DeclaredNamespaces {
  return useContext(DeclaredProfilesContext);
}
