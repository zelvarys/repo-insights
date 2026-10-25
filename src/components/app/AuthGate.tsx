import type { ReactNode } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/hooks/useAuth"

export function AuthGate({ children }: { children: ReactNode }) {
  const { isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
    )
  }

  return <>{children}</>
}
