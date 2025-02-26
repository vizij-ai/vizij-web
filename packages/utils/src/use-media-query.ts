import { useState, useEffect } from "react";

/**
 * Custom hook to handle responsive media queries in React components.
 *
 * @param query - A valid CSS media query string (e.g., '(min-width: 768px)')
 * @returns A boolean indicating whether the media query matches
 *
 * @example
 * ```typescript
 * const isMobile = useMediaQuery('(max-width: 768px)');
 *
 * return (
 *   <div>
 *     {isMobile ? <MobileView /> : <DesktopView />}
 *   </div>
 * );
 * ```
 */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState<boolean>(false);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const documentChangeHandler = () => setMatches(mediaQueryList.matches);

    // Set the initial value
    setMatches(mediaQueryList.matches);

    // Add listener
    mediaQueryList.addEventListener("change", documentChangeHandler);

    // Cleanup listener on unmount
    return () => {
      mediaQueryList.removeEventListener("change", documentChangeHandler);
    };
  }, [query]);

  return matches;
};
