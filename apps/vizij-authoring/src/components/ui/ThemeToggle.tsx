import { Moon, Sun } from "lucide-react";
import { useThemeStore } from "../../state/themeStore";
import { cn } from "../../utils/cn";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useThemeStore();

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "p-1.5 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer",
        // Semantic colors
        "text-text-muted hover:text-text-primary hover:bg-bg-hover",
        className,
      )}
      aria-label="Toggle theme"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? (
        <Moon className="w-4 h-4" />
      ) : (
        <Sun className="w-4 h-4" />
      )}
    </button>
  );
}
