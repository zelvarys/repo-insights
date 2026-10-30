import { Loader2, ScanLine } from "lucide-react"
import { EmptyState } from "@/components/app/EmptyState"
import { ErrorState } from "@/components/app/ErrorState"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function InsightLoading() {
  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-36 w-full" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </CardContent>
    </Card>
  )
}

export function InsightError({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  return <ErrorState error={error} onRetry={onRetry} />
}

export function InsightUnavailable({
  title,
  description,
  scanning,
  onRunScan,
}: {
  title: string
  description: string
  scanning: boolean
  onRunScan: () => void
}) {
  return (
    <EmptyState
      icon={ScanLine}
      title={title}
      description={description}
      action={
        <Button onClick={onRunScan} disabled={scanning}>
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
