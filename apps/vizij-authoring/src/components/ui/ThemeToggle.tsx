import { IconMoon, IconSun } from "@tabler/icons-react";
import { cn } from "../../utils/cn";

export interface ThemeToggleProps {
  theme: "dark" | "light";
  onToggle: () => void;
  className?: string;
}

/**
 * Theme toggle button. **Controlled** — it renders the theme it is given and
 * reports intent; it does not read or write the theme itself.
 *
 * It used to call `useThemeStore()` directly, which made the only `ui/` →
 * `src/state/` import in the app and meant a primitive could not render outside
 * a store. The app binds the store at the one call site (`app/AppMenuBar.tsx`).
 * An eslint boundary now enforces that no `ui/` component reaches into state.
 */
export function ThemeToggle({ theme, onToggle, className }: ThemeToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "p-1.5 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer",
        // Semantic colors
        "text-text-muted hover:text-text-primary hover:bg-bg-hover",
        className,
      )}
      aria-label="Toggle theme"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? (
        <IconMoon className="w-4 h-4" />
      ) : (
        <IconSun className="w-4 h-4" />
      )}
    </button>
  );
}
