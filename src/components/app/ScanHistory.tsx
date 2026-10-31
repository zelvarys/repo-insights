import { Fragment, useState } from "react"
import { Link } from "react-router-dom"
import { formatDistanceToNow } from "date-fns"
import { Settings } from "lucide-react"
import type { ScanStatus, ScanSummary } from "@shared/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useRepoScans } from "@/hooks/useRepoDetail"

const STATUS_VARIANTS: Record<
  ScanStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  complete: "default",
  pending: "secondary",
  running: "secondary",
  failed: "destructive",
}

function summaryNumber(
  summary: Record<string, unknown> | null,
  key: string,
): number | null {
  const value = summary?.[key]
  return typeof value === "number" ? value : null
}

function healthScore(summary: Record<string, unknown> | null): number | null {
  const health = summary?.health
  if (!health || typeof health !== "object") return null
  const score = (health as { score?: unknown }).score
  return typeof score === "number" ? score : null
}

function relativeDate(value: string): string {
  return formatDistanceToNow(new Date(value), { addSuffix: true })
}

function ScanDetails({ scan }: { scan: ScanSummary }) {
  const score = healthScore(scan.summary)
  const detected = summaryNumber(scan.summary, "toolsDetected")
  const checked = summaryNumber(scan.summary, "toolsChecked")

  if (scan.status === "failed") {
    return (
      <p className="text-sm text-destructive">
        {scan.error ?? "The scan failed without an error message."}
      </p>
    )
  }

  if (scan.status !== "complete") {
    return (
      <p className="text-sm text-muted-foreground">
        This scan is still {scan.status}.
      </p>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <p className="text-xs text-muted-foreground">Repository health</p>
        <p className="text-sm font-medium">
          {score === null ? "—" : score.toFixed(1)}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Tools detected</p>
        <p className="text-sm font-medium">{detected ?? "—"}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Tools checked</p>
        <p className="text-sm font-medium">{checked ?? "—"}</p>
      </div>
    </div>
  )
}

function ScanMobileCard({
  scan,
  expanded,
  onToggle,
}: {
  scan: ScanSummary
  expanded: boolean
  onToggle: () => void
}) {
  const score = healthScore(scan.summary)

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full flex-col gap-2 rounded-lg p-3 text-left transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">
            {relativeDate(scan.createdAt)}
          </span>
          <Badge variant={STATUS_VARIANTS[scan.status]}>{scan.status}</Badge>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Health {score === null ? "—" : score.toFixed(1)}</span>
          <span>
            {scan.completedAt
              ? `Completed ${relativeDate(scan.completedAt)}`
              : "Not completed"}
          </span>
        </div>
      </button>
      {expanded ? (
        <div className="border-t p-3">
          <ScanDetails scan={scan} />
        </div>
      ) : null}
    </div>
  )
}

export function ScanHistory({ repoId }: { repoId: string }) {
  const scansQuery = useRepoScans(repoId)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const scans = scansQuery.data?.scans.slice(0, 5) ?? []

  function toggle(scanId: string) {
    setExpandedId((current) => (current === scanId ? null : scanId))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scan history</CardTitle>
        <CardDescription>The five most recent scans.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/repos/${repoId}/settings`}>
              <Settings className="size-4" />
              Tracked tools
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {scansQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : scansQuery.isError ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Could not load scan history.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => scansQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : scans.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No scans yet.
          </p>
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {scans.map((scan) => (
                <ScanMobileCard
                  key={scan.id}
                  scan={scan}
                  expanded={expandedId === scan.id}
                  onToggle={() => toggle(scan.id)}
                />
              ))}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scans.map((scan) => {
                    const expanded = expandedId === scan.id
                    const score = healthScore(scan.summary)
                    return (
                      <Fragment key={scan.id}>
                        <TableRow
                          className="cursor-pointer"
                          tabIndex={0}
                          aria-expanded={expanded}
                          onClick={() => toggle(scan.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault()
                              toggle(scan.id)
                            }
                          }}
                        >
                          <TableCell
                            title={new Date(scan.createdAt).toLocaleString()}
                          >
                            {relativeDate(scan.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANTS[scan.status]}>
                              {scan.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {score === null ? "—" : score.toFixed(1)}
                          </TableCell>
                          <TableCell>
                            {scan.completedAt
                              ? relativeDate(scan.completedAt)
                              : "—"}
                          </TableCell>
                        </TableRow>
                        {expanded ? (
                          <TableRow>
                            <TableCell colSpan={4} className="bg-muted/30">
                              <ScanDetails scan={scan} />
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
