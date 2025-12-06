import { useCallback, useEffect, useState, type RefCallback } from "react";

type SectionInViewOptions = {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
};

type SectionInViewResult<T extends HTMLElement> = {
  ref: RefCallback<T>;
  isVisible: boolean;
  hasEntered: boolean;
};

export function useSectionInView<T extends HTMLElement = HTMLElement>(
  options?: SectionInViewOptions,
): SectionInViewResult<T> {
  const { threshold = 0.35, rootMargin = "0px", once = true } = options ?? {};
  const [target, setTarget] = useState<T | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);

  const ref = useCallback((node: T | null) => {
    setTarget(node);
  }, []);

  useEffect(() => {
    if (!target) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const visible = entry.isIntersecting;
        setIsVisible(visible);
        if (visible) {
          setHasEntered(true);
          if (once) {
            observer.disconnect();
          }
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [target, threshold, rootMargin, once]);

  return { ref, isVisible, hasEntered };
}
