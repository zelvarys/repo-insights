import type * as React from "react"
import { cn } from "@/lib/utils"

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral"

const TONE_CLASSES: Record<StatusTone, string> = {
  success:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  neutral: "border-border bg-muted/40 text-muted-foreground",
}

export function StatusBadge({
  tone = "neutral",
  badge,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & {
  tone?: StatusTone
  badge?: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {children}
      {badge !== undefined && badge !== null ? (
        <span className="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-background">
          {badge}
        </span>
      ) : null}
    </span>
  )
}
