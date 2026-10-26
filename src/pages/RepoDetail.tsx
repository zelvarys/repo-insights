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
import { EmptyState } from "@/components/app/EmptyState"
import { ErrorState } from "@/components/app/ErrorState"
import { RepoDetailSkeleton } from "@/components/app/LoadingSkeletons"
import { MetricsPanel } from "@/components/app/MetricsPanel"
import { ScanHistory } from "@/components/app/ScanHistory"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import {
  useRepo,
  useRepoMetrics,
  useRepoScans,
} from "@/hooks/useRepoDetail"
import { useRunScan, useScanPoll } from "@/hooks/useRunScan"

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
    <EmptyState
      icon={ScanLine}
      title={scanning ? "Scan in progress" : "No scan yet"}
      description={
        scanning
          ? "The worker is scanning this repository. Metrics will appear automatically."
          : "Run your first scan to see tool adoption metrics for this repository."
      }
      action={
        <Button onClick={onRunScan} disabled={disabled}>
          {scanning ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ScanLine className="size-4" />
          )}
          {scanning ? "Scanning..." : "Run scan"}
        </Button>
      }
    />
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
      void queryClient.invalidateQueries({
        queryKey: ["repo", repoId, "metrics"],
      })
      void queryClient.invalidateQueries({
        queryKey: ["repo", repoId, "scans"],
      })
      setPollingScanId(null)
    } else if (scan.status === "failed") {
      toast.error("Scan failed", {
        description: scan.error ?? "The scan failed without an error message.",
      })
      void queryClient.invalidateQueries({
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
          void queryClient.invalidateQueries({
            queryKey: ["repo", repoId, "metrics"],
          })
          void queryClient.invalidateQueries({
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
        <RepoDetailSkeleton />
      ) : repoQuery.isError ? (
        <ErrorState
          error={repoQuery.error ?? new Error("Unknown error")}
          onRetry={() => repoQuery.refetch()}
        />
      ) : (
        <>
          {metricsQuery.isLoading ? (
            <RepoDetailSkeleton />
          ) : metricsQuery.isError ? (
            <ErrorState
              error={metricsQuery.error ?? new Error("Unknown error")}
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
