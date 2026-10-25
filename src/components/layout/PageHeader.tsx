import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

type PageHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
  backTo?: string
  backLabel?: string
  className?: string
}

export function PageHeader({
  title,
  description,
  actions,
  backTo,
  backLabel = "Back",
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 space-y-1">
        {backTo ? (
          <Link
            to={backTo}
            className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {backLabel}
          </Link>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
