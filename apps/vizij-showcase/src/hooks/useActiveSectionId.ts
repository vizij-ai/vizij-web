import { useEffect, useMemo, useState } from "react";

type ActiveSectionOptions = {
  rootMargin?: string;
  threshold?: number | number[];
};

const DEFAULT_THRESHOLD = [0, 0.4, 0.75];

export function useActiveSectionId(
  sectionIdsInput: string[],
  options?: ActiveSectionOptions,
) {
  const { rootMargin = "-40% 0px -45% 0px", threshold = DEFAULT_THRESHOLD } =
    options ?? {};
  const sectionIds = useMemo(
    () => sectionIdsInput.filter(Boolean),
    [sectionIdsInput],
  );
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    () => sectionIds[0] ?? null,
  );

  useEffect(() => {
    if (!sectionIds.length) {
      return undefined;
    }

    const targets = sectionIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (!targets.length) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              sectionIds.indexOf(a.target.id) - sectionIds.indexOf(b.target.id),
          );

        if (visible[0]) {
          setActiveSectionId(visible[0].target.id);
          return;
        }

        const closest = [...entries].sort(
          (a, b) =>
            Math.abs(a.boundingClientRect.top) -
            Math.abs(b.boundingClientRect.top),
        )[0];

        if (closest) {
          setActiveSectionId(closest.target.id);
        }
      },
      { rootMargin, threshold },
    );

    targets.forEach((target) => observer.observe(target));

    return () => observer.disconnect();
  }, [sectionIds, rootMargin, threshold]);

  return activeSectionId;
}
