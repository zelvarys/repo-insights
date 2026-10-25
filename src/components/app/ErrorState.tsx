import { CircleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type ErrorStateProps = {
  error: Error
  onRetry?: () => void
  className?: string
}

export function ErrorState({ error, onRetry, className }: ErrorStateProps) {
  return (
    <Card className={cn("border-destructive/30", className)}>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <CircleAlert className="size-6" />
        </div>
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred."}
        </p>
        {onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
