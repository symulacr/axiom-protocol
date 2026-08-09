import { useCallback, useEffect, useState } from "react";

type ThemeMode = "dark" | "light";

const STORAGE_KEY = "axiom-theme";

function readTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
}

/** Dark by default; light optional. Persists in localStorage. */
export function useTheme(): {
  theme: ThemeMode;
  toggle: () => void;
  setTheme: (m: ThemeMode) => void;
} {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof document !== "undefined") {
      const t = readTheme();
      applyTheme(t);
      return t;
    }
    return "dark";
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((m: ThemeMode) => setThemeState(m), []);
  const toggle = useCallback(() => {
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggle, setTheme };
}
