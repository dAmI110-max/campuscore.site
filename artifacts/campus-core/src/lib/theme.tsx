import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "campus-core-theme";
const Ctx = createContext<{ theme: ThemeChoice; setTheme: (t: ThemeChoice) => void }>({ theme: "system", setTheme: () => {} });

function apply(t: ThemeChoice) {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  });
  useEffect(() => {
    apply(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => apply("system");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [theme]);
  const setTheme = (t: ThemeChoice) => { localStorage.setItem(KEY, t); setThemeState(t); };
  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}
export const useTheme = () => useContext(Ctx);
