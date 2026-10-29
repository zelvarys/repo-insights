import { useEffect, useState } from "react"
import { CheckCircle2, ExternalLink, Workflow, XCircle } from "lucide-react"
import { EmptyState } from "@/components/app/EmptyState"
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
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  useRepoCi,
  type CiFilters,
  type CiRange,
} from "@/hooks/useRepoInsights"
import { formatDuration, formatPercent } from "@/lib/format"

export function CiTab({
  repoId,
  scanning,
  onRunScan,
}: {
  repoId: string
  scanning: boolean
  onRunScan: () => void
}) {
  const [range, setRange] = useState<CiRange>(90)
  const [workflow, setWorkflow] = useState("")
  const [branchInput, setBranchInput] = useState("")
  const [branch, setBranch] = useState("")
  const [knownWorkflows, setKnownWorkflows] = useState<string[]>([])
  const filters: CiFilters = {
    range,
    ...(workflow ? { workflow } : {}),
    ...(branch ? { branch } : {}),
  }
  const query = useRepoCi(repoId, filters)

  useEffect(() => {
    const names = query.data?.ci?.workflows.map((item) => item.name) ?? []
    if (names.length === 0) return
    setKnownWorkflows((current) =>
      [...new Set([...current, ...names])].sort((a, b) => a.localeCompare(b))
    )
  }, [query.data?.ci?.workflows])

  if (query.isLoading) return <InsightLoading />
  if (query.isError) {
    return (
      <InsightError
        error={query.error ?? new Error("Unknown error")}
        onRetry={() => query.refetch()}
      />
    )
  }
  if (!query.data?.available || !query.data.ci) {
    if (query.data?.reason === "no_workflows") {
      return (
        <EmptyState
          icon={Workflow}
          title="No GitHub Actions workflows detected"
          description="This repository does not have workflow files, so there are no CI runs to analyze."
          action={
            <Button variant="outline" asChild>
              <a
                href="https://docs.github.com/en/actions"
                target="_blank"
                rel="noreferrer"
              >
                GitHub Actions documentation
                <ExternalLink className="size-4" />
              </a>
            </Button>
          }
        />
      )
    }
    return (
      <InsightUnavailable
        title="No CI data yet"
        description="Run a scan to analyze recent GitHub Actions workflow runs. Public repositories need Actions read access."
        scanning={scanning}
        onRunScan={onRunScan}
      />
    )
  }

  const ci = query.data.ci

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">CI health</h2>
          <p className="text-sm text-muted-foreground">
            Success rate and duration for recent GitHub Actions runs.
          </p>
        </div>
        <Badge variant={ci.partial ? "secondary" : "outline"}>
          {ci.partial ? "Partial data" : `${ci.totalRuns} runs analyzed`}
        </Badge>
      </div>

      <Card>
        <CardContent className="grid gap-4 py-6 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Overall success rate</p>
            <p className="mt-1 text-3xl font-semibold">
              {formatPercent(ci.successRate)}
            </p>
            <Progress value={ci.successRate ?? 0} className="mt-3" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Completed runs</p>
            <p className="mt-1 text-3xl font-semibold">{ci.totalRuns}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Workflows</p>
            <p className="mt-1 text-3xl font-semibold">{ci.workflows.length}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Workflow, branch, and time range are applied to the stored runs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            {([30, 90, 365] as CiRange[]).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={range === value ? "default" : "ghost"}
                onClick={() => setRange(value)}
              >
                Last {value} days
              </Button>
            ))}
          </div>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault()
              setBranch(branchInput.trim())
            }}
          >
            <select
              aria-label="Workflow filter"
              value={workflow}
              onChange={(event) => setWorkflow(event.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">All workflows</option>
              {knownWorkflows.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <Input
              placeholder="Filter by branch"
              value={branchInput}
              onChange={(event) => setBranchInput(event.target.value)}
            />
            <Button type="submit" variant="outline">
              Apply branch
            </Button>
            {branch ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setBranch("")
                  setBranchInput("")
                }}
              >
                Clear branch
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Workflow success rates</CardTitle>
            <CardDescription>Last 50 runs per workflow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ci.workflows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No workflow runs match these filters.
              </p>
            ) : (
              ci.workflows.map((item) => (
                <div key={item.name} className="space-y-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatPercent(item.successRate)}
                    </span>
                  </div>
                  <Progress
                    value={item.successRate}
                    className={
                      item.successRate < 50
                        ? "[&>div]:bg-destructive"
                        : item.successRate < 75
                          ? "[&>div]:bg-[var(--chart-3)]"
                          : ""
                    }
                  />
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {item.successfulRuns} passed · {item.failedRuns} failed ·{" "}
                      {item.totalRuns} runs
                    </span>
                    <span>Avg {formatDuration(item.averageDurationSeconds)}</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent failures</CardTitle>
            <CardDescription>Last 10 failed runs in the window.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {ci.recentFailures.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CheckCircle2 className="size-8 text-primary" />
                <p className="text-sm text-muted-foreground">
                  No recent failures match these filters.
                </p>
              </div>
            ) : (
              ci.recentFailures.map((failure) => (
                <a
                  key={failure.runId}
                  href={failure.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                >
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {failure.workflowName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {failure.branch ?? "unknown branch"} ·{" "}
                      {failure.actor ?? "unknown actor"} ·{" "}
                      {failure.completedAt
                        ? new Date(failure.completedAt).toLocaleString()
                        : "unknown time"}
                    </p>
                  </div>
                  <ExternalLink className="size-3.5 text-muted-foreground" />
                </a>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
