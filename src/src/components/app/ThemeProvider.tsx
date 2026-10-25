import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export type Theme = "light" | "dark" | "system"
type ResolvedTheme = "light" | "dark"

const STORAGE_KEY = "repo-insights-theme"
const MEDIA_QUERY = "(prefers-color-scheme: dark)"

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system"
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored
    }
  } catch {
    return "system"
  }
  return "system"
}

function systemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light"
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? systemTheme() : theme
}

function applyTheme(theme: ResolvedTheme) {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", theme === "dark")
  document.documentElement.style.colorScheme = theme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(readStoredTheme()),
  )

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      return
    }
  }, [])

  useEffect(() => {
    const next = resolveTheme(theme)
    setResolvedTheme(next)
    applyTheme(next)

    if (theme !== "system") return

    const media = window.matchMedia(MEDIA_QUERY)
    const handleChange = () => {
      const system = media.matches ? "dark" : "light"
      setResolvedTheme(system)
      applyTheme(system)
    }

    media.addEventListener("change", handleChange)
    return () => media.removeEventListener("change", handleChange)
  }, [theme])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
