import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Activity, ChevronDown, Users } from "lucide-react"
import type { CommitQuality } from "@shared/types"
import {
  InsightError,
  InsightLoading,
  InsightUnavailable,
} from "@/components/app/insights/InsightState"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useChartColors } from "@/hooks/useChartColors"
import { useRepoActivity, type ActivityRange } from "@/hooks/useRepoInsights"
import { cn } from "@/lib/utils"

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function formatWeek(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

function heatClass(count: number): string {
  if (count <= 0) return "bg-muted"
  if (count <= 2) return "bg-primary/20"
  if (count <= 5) return "bg-primary/40"
  if (count <= 9) return "bg-primary/60"
  return "bg-primary/90"
}

function Heatmap({ daily }: { daily: Record<string, number> }) {
  const { cells, monthLabels } = useMemo(() => {
    const today = new Date()
    const todayDay = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    )
    const start = new Date(todayDay)
    start.setUTCDate(start.getUTCDate() - todayDay.getUTCDay() - 51 * 7)

    const result: Array<{
      key: string
      date: string
      count: number
      future: boolean
    }> = []
    const labels: Array<{ column: number; label: string }> = []
    let lastMonth = -1

    for (let column = 0; column < 52; column += 1) {
      for (let row = 0; row < 7; row += 1) {
        const date = new Date(start.getTime() + (column * 7 + row) * DAY_MS)
        const key = date.toISOString().slice(0, 10)
        result.push({
          key,
          date: key,
          count: daily[key] ?? 0,
          future: date.getTime() > todayDay.getTime(),
        })
        if (row === 0 && date.getUTCMonth() !== lastMonth) {
          lastMonth = date.getUTCMonth()
          labels.push({
            column,
            label: date.toLocaleString("en-US", {
              month: "short",
              timeZone: "UTC",
            }),
          })
        }
      }
    }
    return { cells: result, monthLabels: labels }
  }, [daily])

  return (
    <div className="overflow-x-auto pb-2">
      <div className="relative ml-8 min-w-[760px]">
        <div className="mb-1 h-4 text-[10px] text-muted-foreground">
          {monthLabels.map((month) => (
            <span
              key={`${month.label}-${month.column}`}
              className="absolute"
              style={{ left: `${month.column * 15}px` }}
            >
              {month.label}
            </span>
          ))}
        </div>
        <div className="absolute top-5 -left-8 flex flex-col gap-1 text-[10px] text-muted-foreground">
          {WEEKDAYS.map((day, index) => (
            <span key={day} className="h-3 leading-3">
              {index % 2 === 1 ? day : ""}
            </span>
          ))}
        </div>
        <div className="grid grid-flow-col grid-rows-7 gap-1">
          {cells.map((cell) => (
            <div
              key={cell.key}
              title={cell.future ? "" : `${cell.date}: ${cell.count} commits`}
              aria-label={
                cell.future ? undefined : `${cell.date}: ${cell.count} commits`
              }
              className={cn(
                "size-3 rounded-[2px]",
                cell.future ? "bg-transparent" : heatClass(cell.count),
              )}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
          <span>Less</span>
          {[0, 1, 3, 6, 10].map((count) => (
            <span
              key={count}
              className={cn("size-3 rounded-[2px]", heatClass(count))}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  )
}

function QualityCard({ quality }: { quality: CommitQuality }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Commit quality</CardTitle>
        <CardDescription>
          Based on {quality.totalCommits} non-merge commits in the last year.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[35fr_35fr_30fr] sm:gap-0">
          <div className="sm:pr-4">
            <p className="text-xs text-muted-foreground">
              Conventional Commits
            </p>
            <p className="text-2xl font-semibold">
              {quality.conventionalPercent.toFixed(1)}%
            </p>
            <Progress value={quality.conventionalPercent} className="mt-2" />
          </div>
          <div className="sm:border-l sm:px-4">
            <p className="text-xs text-muted-foreground">Commits with a body</p>
            <p className="text-2xl font-semibold">
              {quality.bodyPercent.toFixed(1)}%
            </p>
            <Progress value={quality.bodyPercent} className="mt-2" />
          </div>
          <div className="sm:border-l sm:pl-4">
            <p className="text-xs text-muted-foreground">Most common type</p>
            <p className="mt-1 text-2xl font-semibold">
              {quality.mostCommonType ?? "—"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Avg message {quality.averageMessageLength.toFixed(0)} chars
            </p>
          </div>
        </div>

        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={quality.messageLengthBuckets}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              />
              <Bar
                dataKey="count"
                radius={[4, 4, 0, 0]}
                fill="var(--chart-2)"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {quality.examples.length > 0 ? (
          <details className="group rounded-lg border p-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              Examples that could be improved
            </summary>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {quality.examples.map((example) => (
                <li
                  key={example}
                  className="rounded bg-muted/40 px-2 py-1 font-mono text-xs"
                >
                  {example}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function ActivityTab({
  repoId,
  scanning,
  onRunScan,
}: {
  repoId: string
  scanning: boolean
  onRunScan: () => void
}) {
  const [range, setRange] = useState<ActivityRange>(365)
  const colors = useChartColors()
  const query = useRepoActivity(repoId, range)

  if (query.isLoading) return <InsightLoading />
  if (query.isError) {
    return (
      <InsightError
        error={query.error ?? new Error("Unknown error")}
        onRetry={() => query.refetch()}
      />
    )
  }
  if (!query.data?.available || !query.data.activity) {
    return (
      <InsightUnavailable
        title="No activity data yet"
        description="Run a scan to collect commit activity, contributor trends, and commit message quality."
        scanning={scanning}
        onRunScan={onRunScan}
      />
    )
  }

  const activity = query.data.activity
  const maxContributorCommits = Math.max(
    1,
    ...activity.topContributors.map((person) => person.commits),
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Commit activity</h2>
          <p className="text-sm text-muted-foreground">
            Daily commits on the default branch, bucketed in UTC.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {([90, 180, 365] as ActivityRange[]).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={range === value ? "default" : "ghost"}
              onClick={() => setRange(value)}
            >
              {value}d
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-4" />
            {activity.daily
              ? Object.values(activity.daily).reduce((a, b) => a + b, 0)
              : 0}{" "}
            commits
          </CardTitle>
          <CardDescription>
            Last {range} days · {activity.topContributors.length} active
            contributors
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Heatmap daily={activity.daily} />
          <div className="mt-6 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={activity.weekly}
                margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="weekStart"
                  tickFormatter={formatWeek}
                  minTickGap={28}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  width={32}
                />
                <ChartTooltip
                  labelFormatter={(label) =>
                    `Week of ${formatWeek(String(label))}`
                  }
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke={colors.primary}
                  fill={colors.primary}
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" />
              Top contributors
            </CardTitle>
            <CardDescription>Commits in the selected window.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activity.topContributors.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No contributor activity in this window.
              </p>
            ) : (
              activity.topContributors.slice(0, 10).map((person, index) => (
                <div key={person.login} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 text-xs text-muted-foreground">
                        {index + 1}.
                      </span>
                      {person.login}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {person.commits}{" "}
                      {person.commits === 1 ? "commit" : "commits"}
                    </span>
                  </div>
                  <Progress
                    value={(person.commits / maxContributorCommits) * 100}
                    aria-label={`${person.login} commits`}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>When contributors commit</CardTitle>
            <CardDescription>
              UTC weekday and hour distribution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {WEEKDAYS.map((day, index) => (
                <div key={day} className="rounded-md bg-muted/50 p-2">
                  <p className="text-muted-foreground">{day}</p>
                  <p className="mt-1 font-semibold">
                    {activity.weekday[index]}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex h-24 items-end gap-0.5">
              {activity.hourOfDay.map((count, hour) => {
                const max = Math.max(1, ...activity.hourOfDay)
                return (
                  <div
                    key={hour}
                    className="flex-1 rounded-t bg-primary/70"
                    style={{ height: `${Math.max(2, (count / max) * 100)}%` }}
                    title={`${hour}:00 · ${count} commits`}
                  />
                )
              })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>00:00</span>
              <span>12:00</span>
              <span>23:00</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <QualityCard quality={activity.quality} />
      <Badge variant="outline">Range: last {activity.range} days</Badge>
    </div>
  )
}
