import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type PageLoaderProps = {
  fullScreen?: boolean
  className?: string
}

export function PageLoader({ fullScreen = false, className }: PageLoaderProps) {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center",
        fullScreen ? "min-h-svh" : "min-h-[40svh]",
        className
      )}
    >
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <span className="sr-only">Loading</span>
    </div>
  )
}
