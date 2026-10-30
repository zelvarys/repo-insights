import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
} from "recharts"
import {
  Activity,
  Gauge,
  GitBranch,
  Info,
  ShieldAlert,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react"
import {
  InsightError,
  InsightLoading,
  InsightUnavailable,
} from "@/components/app/insights/InsightState"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useRepoMetrics } from "@/hooks/useRepoDetail"
import { useRepoOverview } from "@/hooks/useRepoInsights"
import { formatPercent } from "@/lib/format"

type RepoTab =
  "overview" | "activity" | "structure" | "dependencies" | "workflows" | "tools"

function riskVariant(risk: "green" | "yellow" | "red") {
  if (risk === "green") return "default" as const
  if (risk === "yellow") return "secondary" as const
  return "destructive" as const
}

function GlanceCard({
  title,
  description,
  icon,
  onOpen,
  children,
}: {
  title: string
  description: string
  icon: React.ReactNode
  onOpen: () => void
  children: React.ReactNode
}) {
  return (
    <button type="button" onClick={onOpen} className="text-left">
      <Card className="h-full transition-colors hover:border-primary/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            {icon}
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </button>
  )
}

export function OverviewTab({
  repoId,
  scanning,
  onRunScan,
  onSelectTab,
}: {
  repoId: string
  scanning: boolean
  onRunScan: () => void
  onSelectTab: (tab: RepoTab) => void
}) {
  const metrics = useRepoMetrics(repoId)
  const overview = useRepoOverview(repoId)

  if (metrics.isLoading || overview.isLoading) return <InsightLoading />
  if (metrics.isError) {
    return (
      <InsightError
        error={metrics.error ?? new Error("Unknown error")}
        onRetry={() => metrics.refetch()}
      />
    )
  }
  if (overview.isError) {
    return (
      <InsightError
        error={overview.error ?? new Error("Unknown error")}
        onRetry={() => overview.refetch()}
      />
    )
  }
  if (!overview.data?.available) {
    return (
      <InsightUnavailable
        title="No overview yet"
        description="Run a scan to see repository health alongside activity, dependencies, workflows, contributor concentration, and tool adoption."
        scanning={scanning}
        onRunScan={onRunScan}
      />
    )
  }

  const health = overview.data.health
  const cards = overview.data.cards ?? {}
  const adoption = metrics.data?.adoptionScore ?? 0

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4" />
            Repository health
          </CardTitle>
          <CardDescription>
            A combined view of activity, dependencies, workflows, contributors,
            and commit quality.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex items-end gap-2">
            <p className="text-5xl font-bold">
              {health?.score === null || health?.score === undefined
                ? "—"
                : health.score.toFixed(1)}
            </p>
            <p className="pb-2 text-sm text-muted-foreground">out of 100</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {health?.components.map((component) => (
              <div
                key={component.key}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
              >
                <span
                  className={component.available ? "" : "text-muted-foreground"}
                >
                  {component.label}
                </span>
                <span className="font-medium">
                  {component.available
                    ? component.score.toFixed(1)
                    : "Not collected"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <GlanceCard
          title="Tool adoption"
          description="How consistently contributors use tracked tools."
          icon={<Gauge className="size-4" />}
          onOpen={() => onSelectTab("tools")}
        >
          <p className="text-2xl font-semibold">
            {adoption.toFixed(1)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              / 100
            </span>
          </p>
          <Progress value={adoption} className="mt-3" />
        </GlanceCard>

        {cards.concentration ? (
          <GlanceCard
            title="Contributor concentration"
            description="How dependent the project is on a few people."
            icon={<Users className="size-4" />}
            onOpen={() => onSelectTab("activity")}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-semibold">
                  {formatPercent(cards.concentration.top3Share)}
                </span>
                <span className="text-xs text-muted-foreground">
                  from top 3
                </span>
                <Badge variant={riskVariant(cards.concentration.risk)}>
                  {cards.concentration.risk}
                </Badge>
                <span
                  title="Bus factor estimates how much knowledge is concentrated in a few contributors. More spread is usually safer."
                  className="text-muted-foreground"
                >
                  <Info className="size-3.5" />
                </span>
              </div>
              <div className="space-y-1">
                {cards.concentration.topContributors
                  .slice(0, 3)
                  .map((person) => (
                    <div
                      key={person.login}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="truncate">{person.login}</span>
                      <span className="text-muted-foreground">
                        {formatPercent(person.share)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </GlanceCard>
        ) : null}

        {cards.ci ? (
          <GlanceCard
            title="Workflow stability"
            description="Recent GitHub Actions success rate."
            icon={<Workflow className="size-4" />}
            onOpen={() => onSelectTab("workflows")}
          >
            <p className="text-2xl font-semibold">
              {formatPercent(cards.ci.successRate)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {cards.ci.worstWorkflow
                ? `Weakest workflow: ${cards.ci.worstWorkflow}`
                : "No workflow has enough runs to rank yet."}
            </p>
          </GlanceCard>
        ) : null}

        {cards.dependencies ? (
          <GlanceCard
            title="Dependency health"
            description="Outdated packages and known advisories."
            icon={<ShieldAlert className="size-4" />}
            onOpen={() => onSelectTab("dependencies")}
          >
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-semibold">
                  {cards.dependencies.total}
                </p>
                <p className="text-[10px] text-muted-foreground">total</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">
                  {cards.dependencies.outdated}
                </p>
                <p className="text-[10px] text-muted-foreground">outdated</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">
                  {cards.dependencies.advisoryCount}
                </p>
                <p className="text-[10px] text-muted-foreground">advisories</p>
              </div>
            </div>
          </GlanceCard>
        ) : null}

        {cards.activity ? (
          <GlanceCard
            title="Activity"
            description="Commits in the last 90 days."
            icon={<Activity className="size-4" />}
            onOpen={() => onSelectTab("activity")}
          >
            <p className="text-2xl font-semibold">
              {cards.activity.last90Commits}
            </p>
            <div className="mt-2 h-16">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cards.activity.sparkline}>
                  <ChartTooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="var(--chart-2)"
                    fill="var(--chart-2)"
                    fillOpacity={0.2}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlanceCard>
        ) : null}

        {cards.commitQuality ? (
          <GlanceCard
            title="Commit quality"
            description="Conventional Commits and message structure."
            icon={<GitBranch className="size-4" />}
            onOpen={() => onSelectTab("activity")}
          >
            <p className="text-2xl font-semibold">
              {formatPercent(cards.commitQuality.conventionalPercent)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Conventional Commits ·{" "}
              {cards.commitQuality.mostCommonType
                ? `most common: ${cards.commitQuality.mostCommonType}`
                : "no dominant type"}
            </p>
          </GlanceCard>
        ) : null}
      </div>

      {Object.keys(cards).length < 5 ? (
        <p className="text-sm text-muted-foreground">
          Some insight cards are unavailable for the latest scan. Run a new scan
          to collect them.
        </p>
      ) : null}
    </div>
  )
}
