import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { Theme, ThemeContext, type ThemeContextValue } from "@semio/ui";
import { useThemeStore } from "../state/themeStore";

/**
 * Bridges the app's theme store to `@semio/ui`'s theme context.
 *
 * `@semio/ui` exports `ThemeContext` and `useTheme` but ships **no provider
 * component** — its default context value silently resolves to
 * `Theme.Dark`, so without this the library would disagree with the app in
 * light mode. The `.dark` class on `<html>` (set by the FOUC script in
 * index.html and by `themeStore`) is what actually drives semio's CSS; this
 * provider only keeps the JS-visible value in sync for components that branch
 * on `useTheme()`.
 *
 * Deliberately does NOT use semio's `useSystemThemePreference()`: it calls
 * `window.matchMedia` unconditionally during render, which jsdom does not
 * implement, so it would crash every component test that mounts the app. The
 * system preference is read defensively here instead.
 *
 * The app's store is binary (`"dark" | "light"`) with no "system" mode, so
 * `explicitTheme` is always concrete and `resolvedTheme` always equals it.
 */
export function SemioThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  const systemPreference = useMemo<Theme.Dark | Theme.Light>(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return Theme.Dark;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? Theme.Dark
      : Theme.Light;
  }, []);

  const setExplicitTheme = useCallback(
    (next: Theme) => {
      // Theme.System has no representation in the app store; fall back to the
      // OS preference so the request still resolves to something concrete.
      const resolved = next === Theme.System ? systemPreference : next;
      setTheme(resolved === Theme.Light ? "light" : "dark");
    },
    [setTheme, systemPreference],
  );

  const value = useMemo<ThemeContextValue>(() => {
    const resolvedTheme = theme === "light" ? Theme.Light : Theme.Dark;
    return {
      explicitTheme: resolvedTheme,
      systemPreference,
      setExplicitTheme,
      resolvedTheme,
    };
  }, [theme, systemPreference, setExplicitTheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
