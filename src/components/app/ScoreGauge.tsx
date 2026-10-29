import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts"
import {
  useChartColors,
  type ChartColors,
} from "@/hooks/useChartColors"

type ScoreGaugeProps = {
  score: number
  label?: string
}

function scoreColor(score: number, colors: ChartColors): string {
  if (score <= 33) return colors.destructive
  if (score <= 66) return colors.warning
  return colors.primary
}

export function ScoreGauge({ score, label = "Adoption score" }: ScoreGaugeProps) {
  const colors = useChartColors()
  const value = Math.min(100, Math.max(0, score))
  const color = scoreColor(value, colors)
  const data = [{ name: "Adoption score", value, fill: color }]

  return (
    <div
      className="relative size-56"
      role="img"
      aria-label={`${label} ${value.toFixed(1)} out of 100`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          cx="50%"
          cy="50%"
          innerRadius="72%"
          outerRadius="100%"
          barSize={16}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis
            type="number"
            domain={[0, 100]}
            angleAxisId={0}
            tick={false}
          />
          <RadialBar
            dataKey="value"
            background={{ fill: colors.track }}
            cornerRadius={999}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold" style={{ color }}>
          {value.toFixed(1)}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </div>
  )
}
