import { useEffect, useState } from "react"
import { ExternalLink, Loader2, RefreshCw, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import type { DependencyRow, DependencySeverity } from "@shared/types"
import {
  InsightError,
  InsightLoading,
  InsightUnavailable,
} from "@/components/app/insights/InsightState"
import { StatCard } from "@/components/app/StatCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  useRefreshDependencies,
  useRepoDependencies,
  type DependencyFilters,
} from "@/hooks/useRepoInsights"

const SEVERITY_ORDER: DependencySeverity[] = [
  "critical",
  "high",
  "moderate",
  "low",
]

function severitySummary(severity: Record<DependencySeverity, number>): string {
  const present = SEVERITY_ORDER.filter((level) => severity[level] > 0).slice(
    0,
    2,
  )
  if (present.length === 0) return "No known advisories"
  return present.map((level) => `${severity[level]} ${level}`).join(", ")
}

function dependencyStatus(row: DependencyRow) {
  if (row.advisoryCount > 0) {
    return {
      label: `Advisory ${row.advisoryCount}`,
      variant: "destructive" as const,
    }
  }
  if (row.outdated) {
    return { label: "Outdated", variant: "secondary" as const }
  }
  if (row.latestVersion === null) {
    return { label: "Unknown", variant: "outline" as const }
  }
  return { label: "Up to date", variant: "default" as const }
}

export function DependenciesTab({
  repoId,
  scanning,
  onRunScan,
}: {
  repoId: string
  scanning: boolean
  onRunScan: () => void
}) {
  const [show, setShow] = useState<DependencyFilters["show"]>("all")
  const [page, setPage] = useState(1)
  const [polling, setPolling] = useState(false)
  const [requestedAt, setRequestedAt] = useState<number | null>(null)
  const filters: DependencyFilters = { page, perPage: 50, show }
  const query = useRepoDependencies(repoId, filters, polling)
  const refresh = useRefreshDependencies(repoId)

  useEffect(() => {
    if (!polling || requestedAt === null || !query.data?.summary) return
    const checkedAt = Date.parse(query.data.summary.checkedAt ?? "")
    if (Number.isFinite(checkedAt) && checkedAt >= requestedAt) {
      setPolling(false)
      toast.success("Dependency data refreshed")
    }
  }, [polling, query.data?.summary, requestedAt])

  useEffect(() => {
    if (!polling) return
    const timeout = window.setTimeout(() => {
      setPolling(false)
      toast.info("Dependency refresh is taking longer than expected")
    }, 60_000)
    return () => window.clearTimeout(timeout)
  }, [polling])

  if (query.isLoading) return <InsightLoading />
  if (query.isError) {
    return (
      <InsightError
        error={query.error ?? new Error("Unknown error")}
        onRetry={() => query.refetch()}
      />
    )
  }
  if (!query.data?.available || !query.data.summary) {
    return (
      <InsightUnavailable
        title="No dependency data yet"
        description="Run a scan to parse manifest files, check latest versions, and look up known advisories."
        scanning={scanning}
        onRunScan={onRunScan}
      />
    )
  }

  const { summary, rows, pagination } = query.data

  function changeShow(next: DependencyFilters["show"]) {
    setShow(next)
    setPage(1)
  }

  function handleRefresh() {
    refresh.mutate(undefined, {
      onSuccess: () => {
        setRequestedAt(Date.now())
        setPolling(true)
        toast.success("Dependency refresh queued")
      },
      onError: (error) => {
        toast.error("Could not queue dependency refresh", {
          description: error.message,
        })
      },
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Dependency health</h2>
          <p className="text-sm text-muted-foreground">
            Direct dependencies from manifests, latest registry versions, and
            known OSV advisories.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={refresh.isPending || polling}
        >
          {refresh.isPending || polling ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {polling ? "Refreshing..." : "Check now"}
        </Button>
      </div>

      {summary.partial ? (
        <Badge variant="secondary">
          Partial results — some registries were unavailable or the dependency
          cap was reached
        </Badge>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total dependencies"
          value={summary.total}
          detail={`${summary.checked} checked against registries`}
        />
        <StatCard
          label="Outdated"
          value={summary.outdated}
          detail="Newer stable version available"
        />
        <StatCard
          label="Advisories"
          value={
            <span className="flex items-center gap-2">
              {summary.advisoryCount}
              {summary.advisoryCount > 0 ? (
                <ShieldAlert className="size-4 text-destructive" />
              ) : null}
            </span>
          }
          detail={severitySummary(summary.severity)}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Dependencies</CardTitle>
            <CardDescription>
              Showing {rows.length} of {pagination.total} matching dependencies.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            {(["all", "outdated", "advisory"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={show === value ? "default" : "ghost"}
                onClick={() => changeShow(value)}
                className="capitalize"
              >
                {value === "advisory" ? "Has advisory" : value}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="border-r">Package</TableHead>
                  <TableHead className="border-r">Current</TableHead>
                  <TableHead className="border-r">Latest</TableHead>
                  <TableHead className="border-r">Status</TableHead>
                  <TableHead>Registry</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No dependencies match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const status = dependencyStatus(row)
                    return (
                      <TableRow
                        key={`${row.ecosystem}-${row.packageName}-${row.currentVersion}`}
                      >
                        <TableCell className="border-r">
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {row.packageName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {row.ecosystem}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="border-r font-mono text-xs">
                          {row.currentVersion === "*"
                            ? "unpinned"
                            : row.currentVersion}
                        </TableCell>
                        <TableCell className="border-r font-mono text-xs">
                          {row.latestVersion ?? "—"}
                        </TableCell>
                        <TableCell className="border-r last:border-r-0">
                          <Badge
                            variant={status.variant}
                            title={
                              row.maxSeverity
                                ? `Highest severity: ${row.maxSeverity}`
                                : undefined
                            }
                          >
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" asChild>
                            <a
                              href={row.registryUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open
                              <ExternalLink className="size-3.5" />
                            </a>
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Page {pagination.page} · {pagination.perPage} per page
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasMore}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
