import { useTheme } from "@/components/app/ThemeProvider"

export type ChartColors = {
  primary: string
  muted: string
  grid: string
  destructive: string
  warning: string
  track: string
}

export function useChartColors(): ChartColors {
  const { resolvedTheme } = useTheme()

  return {
    primary: "var(--chart-2)",
    muted: "var(--muted-foreground)",
    grid: "var(--border)",
    destructive: "var(--destructive)",
    warning: resolvedTheme === "dark" ? "#facc15" : "#eab308",
    track: "var(--muted)",
  }
}
