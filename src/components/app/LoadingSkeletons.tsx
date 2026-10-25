import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function ReposSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-24" />
          </CardContent>
          <CardContent>
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function RepoDetailSkeleton() {
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
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export function SettingsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="space-y-6">
        {Array.from({ length: 3 }).map((_, group) => (
          <div key={group} className="space-y-3">
            <Skeleton className="h-4 w-28" />
            {Array.from({ length: 3 }).map((_, row) => (
              <div
                key={row}
                className="flex items-center justify-between gap-4 rounded-lg border p-4"
              >
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48 max-w-full" />
                </div>
                <Skeleton className="h-5 w-8 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
