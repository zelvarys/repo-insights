import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts"

type ScoreGaugeProps = {
  score: number
}

function scoreColor(score: number): string {
  if (score <= 33) return "var(--destructive)"
  if (score <= 66) return "#eab308"
  return "var(--chart-2)"
}

export function ScoreGauge({ score }: ScoreGaugeProps) {
  const value = Math.min(100, Math.max(0, score))
  const color = scoreColor(value)
  const data = [{ name: "Adoption score", value, fill: color }]

  return (
    <div
      className="relative size-56"
      role="img"
      aria-label={`Adoption score ${value.toFixed(1)} out of 100`}
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
            background={{ fill: "var(--muted)" }}
            cornerRadius={999}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold" style={{ color }}>
          {value.toFixed(1)}
        </span>
        <span className="text-xs text-muted-foreground">Adoption score</span>
      </div>
    </div>
  )
}
