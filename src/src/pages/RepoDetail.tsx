import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import {
  Loader2,
  RefreshCw,
  ScanLine,
  Settings,
} from "lucide-react"
import { toast } from "sonner"
import { MetricsPanel } from "@/components/app/MetricsPanel"
import { ScanHistory } from "@/components/app/ScanHistory"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useRepo,
  useRepoMetrics,
  useRepoScans,
} from "@/hooks/useRepoDetail"
import { useRunScan, useScanPoll } from "@/hooks/useRunScan"

function MetricsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card>
          <CardContent className="flex items-center justify-center py-6">
            <Skeleton className="size-56 rounded-full" />
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="space-y-3 py-6">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-3 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <Card>
        <CardContent className="space-y-3 py-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string
  message: string
  onRetry: () => void
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </CardContent>
    </Card>
  )
}

function NoScanState({
  scanning,
  onRunScan,
  disabled,
}: {
  scanning: boolean
  onRunScan: () => void
  disabled: boolean
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {scanning ? (
            <Loader2 className="size-6 animate-spin" />
          ) : (
            <ScanLine className="size-6" />
          )}
        </div>
        <h2 className="text-lg font-semibold">
          {scanning ? "Scan in progress" : "No scan yet"}
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {scanning
            ? "The worker is scanning this repository. Metrics will appear automatically."
            : "Run your first scan to see tool adoption metrics for this repository."}
        </p>
        <Button onClick={onRunScan} disabled={disabled}>
          {scanning ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ScanLine className="size-4" />
          )}
          {scanning ? "Scanning..." : "Run scan"}
        </Button>
      </CardContent>
    </Card>
  )
}

export default function RepoDetail() {
  const { id } = useParams<{ id: string }>()
  const repoId = id ?? ""
  const queryClient = useQueryClient()

  const [pollingScanId, setPollingScanId] = useState<string | null>(null)
  const [autoPolledScanId, setAutoPolledScanId] = useState<string | null>(
    null
  )

  const repoQuery = useRepo(repoId)
  const metricsQuery = useRepoMetrics(repoId)
  const scansQuery = useRepoScans(repoId)
  const runScan = useRunScan(repoId)
  const scanPoll = useScanPoll(pollingScanId)

  const repo = repoQuery.data?.repository
  const metrics = metricsQuery.data
  const activeScan = scansQuery.data?.scans.find(
    (scan) => scan.status === "pending" || scan.status === "running"
  )

  useEffect(() => {
    if (!activeScan) return
    if (pollingScanId === activeScan.id) return
    if (autoPolledScanId === activeScan.id) return
    setAutoPolledScanId(activeScan.id)
    setPollingScanId(activeScan.id)
  }, [activeScan, autoPolledScanId, pollingScanId])

  useEffect(() => {
    const scan = scanPoll.data?.scan
    if (!pollingScanId || !scan) return

    if (scan.status === "complete") {
      toast.success("Scan complete")
      queryClient.invalidateQueries({
        queryKey: ["repo", repoId, "metrics"],
      })
      queryClient.invalidateQueries({
        queryKey: ["repo", repoId, "scans"],
      })
      setPollingScanId(null)
    } else if (scan.status === "failed") {
      toast.error("Scan failed", {
        description: scan.error ?? "The scan failed without an error message.",
      })
      queryClient.invalidateQueries({
        queryKey: ["repo", repoId, "scans"],
      })
      setPollingScanId(null)
    }
  }, [pollingScanId, scanPoll.data, queryClient, repoId])

  useEffect(() => {
    if (!pollingScanId || !scanPoll.isError) return
    toast.error("Lost track of scan", {
      description: scanPoll.error?.message ?? "Unknown error",
    })
    setPollingScanId(null)
  }, [pollingScanId, scanPoll.isError, scanPoll.error])

  useEffect(() => {
    if (!pollingScanId) return
    const timeout = window.setTimeout(() => {
      setPollingScanId(null)
      toast.info("Scan taking longer than expected — refresh to check")
    }, 60_000)
    return () => window.clearTimeout(timeout)
  }, [pollingScanId])

  function handleRunScan() {
    if (!repoId) return

    runScan.mutate(undefined, {
      onSuccess: ({ scan, cached }) => {
        if (cached && (scan.status === "pending" || scan.status === "running")) {
          toast.info("Scan already in progress")
          setPollingScanId(scan.id)
          return
        }

        if (cached) {
          toast.success("Using cached scan")
          queryClient.invalidateQueries({
            queryKey: ["repo", repoId, "metrics"],
          })
          queryClient.invalidateQueries({
            queryKey: ["repo", repoId, "scans"],
          })
          return
        }

        toast.success("Scan queued")
        setPollingScanId(scan.id)
      },
      onError: (error) => {
        toast.error("Could not start scan", {
          description: error.message,
        })
      },
    })
  }

  const scanning =
    pollingScanId !== null || Boolean(activeScan) || runScan.isPending
  const runDisabled = !repoId || scanning

  return (
    <>
      <PageHeader
        title={repo?.fullName ?? "Repository"}
        description={
          repo
            ? `Adoption report for the ${repo.defaultBranch} branch.`
            : "Adoption report for this repository."
        }
        backTo="/repos"
        backLabel="Repositories"
        actions={
          <>
            <Button onClick={handleRunScan} disabled={runDisabled}>
              {scanning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {scanning ? "Scanning..." : "Run scan"}
            </Button>
            {repoId ? (
              <Button variant="outline" asChild>
                <Link to={`/repos/${repoId}/settings`}>
                  <Settings className="size-4" />
                  Settings
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {repoQuery.isLoading ? (
        <MetricsSkeleton />
      ) : repoQuery.isError ? (
        <ErrorState
          title="Could not load repository"
          message={repoQuery.error?.message ?? "Unknown error"}
          onRetry={() => repoQuery.refetch()}
        />
      ) : (
        <>
          {metricsQuery.isLoading ? (
            <MetricsSkeleton />
          ) : metricsQuery.isError ? (
            <ErrorState
              title="Could not load metrics"
              message={metricsQuery.error?.message ?? "Unknown error"}
              onRetry={() => metricsQuery.refetch()}
            />
          ) : metrics && metrics.scanId !== null ? (
            <MetricsPanel metrics={metrics} />
          ) : (
            <NoScanState
              scanning={scanning}
              onRunScan={handleRunScan}
              disabled={runDisabled}
            />
          )}

          <div className="mt-6">
            <ScanHistory repoId={repoId} />
          </div>
        </>
      )}
    </>
  )
}
