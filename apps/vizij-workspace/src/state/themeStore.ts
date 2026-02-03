import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "dark" | "light";

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        set({ theme: next });
        updateDocumentClass(next);
      },
      setTheme: (theme) => {
        set({ theme });
        updateDocumentClass(theme);
      },
    }),
    {
      name: "vizij-theme",
      onRehydrateStorage: () => (state) => {
        if (state) {
          updateDocumentClass(state.theme);
        }
      },
    },
  ),
);

function updateDocumentClass(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // Clean up
  root.classList.remove("light", "dark");

  // Add current
  root.classList.add(theme);
}
