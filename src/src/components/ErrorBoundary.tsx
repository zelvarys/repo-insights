import { Component, type ErrorInfo, type ReactNode } from "react"
import { isRouteErrorResponse, useRouteError } from "react-router-dom"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error
  if (isRouteErrorResponse(error)) {
    return new Error(`${error.status} ${error.statusText}`)
  }
  return new Error(typeof error === "string" ? error : "Unknown error")
}

function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error interrupted this page.
            </p>
          </div>
        </div>
        {import.meta.env.DEV ? (
          <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap text-muted-foreground">
            {error.stack ?? error.message}
          </pre>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => window.location.reload()}>
            <RotateCcw className="size-4" />
            Reload page
          </Button>
          <Button variant="outline" asChild>
            <a href="/">Go home</a>
          </Button>
        </div>
      </div>
    </div>
  )
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} />
    }
    return this.props.children
  }
}

export function RouteErrorBoundary() {
  const error = useRouteError()
  return <ErrorFallback error={toError(error)} />
}
