import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createTheme, type Theme } from "./theme.js";

interface ThemeContextValue {
  theme: Theme;
  reloadTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => createTheme());

  const reloadTheme = useCallback(() => {
    setTheme(createTheme());
  }, []);

  const value = useMemo(() => ({ theme, reloadTheme }), [theme, reloadTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
