import { Users } from "lucide-react"
import type { ToolCategory, ToolMetric } from "@shared/types"
import { Progress } from "@/components/ui/progress"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export const TOOL_CATEGORY_LABELS: Record<ToolCategory, string> = {
  testing: "Testing",
  linting: "Linting",
  ci_cd: "CI/CD",
  coverage: "Coverage",
  docs: "Docs",
  dependencies: "Dependencies",
}

type ToolRowProps = {
  tool: ToolMetric
}

export function ToolRow({ tool }: ToolRowProps) {
  const row = (
    <div
      className={cn("rounded-lg border p-4", !tool.relevant && "opacity-50")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{tool.name}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" />
              {tool.contributorCount} contributors tracked
            </span>
            {tool.contributorCount > 0 ? (
              <span>{tool.contributorsUsing} used</span>
            ) : null}
          </p>
        </div>
        <span className="text-sm font-medium">
          {Math.round(tool.adoptionRate)}%
        </span>
      </div>
      <Progress
        value={tool.adoptionRate}
        className="mt-3"
        aria-label={`${tool.name} adoption rate`}
      />
    </div>
  )

  if (tool.relevant) return row

  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent>
        Not relevant to this repository&apos;s languages
      </TooltipContent>
    </Tooltip>
  )
}
