export type ChartColors = {
  primary: string
  muted: string
  grid: string
  destructive: string
  warning: string
  track: string
}

export function useChartColors(): ChartColors {
  return {
    primary: "var(--chart-2)",
    muted: "var(--muted-foreground)",
    grid: "var(--border)",
    destructive: "var(--destructive)",
    warning: "var(--chart-3)",
    track: "var(--muted)",
  }
}
