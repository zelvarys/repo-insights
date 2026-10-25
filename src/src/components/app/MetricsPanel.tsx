import { Info } from "lucide-react"
import type {
  RepoMetrics,
  ToolCategory,
  ToolMetric,
} from "@shared/types/api"
import { ScoreGauge } from "@/components/app/ScoreGauge"
import {
  TOOL_CATEGORY_LABELS,
  ToolRow,
} from "@/components/app/ToolRow"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const CATEGORY_ORDER: ToolCategory[] = [
  "testing",
  "linting",
  "ci_cd",
  "coverage",
  "docs",
  "dependencies",
]

type MetricsPanelProps = {
  metrics: RepoMetrics
}

function StatCard({
  label,
  value,
  description,
  tooltip,
}: {
  label: string
  value: string
  description: string
  tooltip: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          {label}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex rounded-full text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`About ${label.toLowerCase()}`}
              >
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function ToolGroupList({ tools }: { tools: ToolMetric[] }) {
  if (tools.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No tools in this view.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.map((category) => {
        const group = tools.filter((tool) => tool.category === category)
        if (group.length === 0) return null
        return (
          <section key={category} className="space-y-2">
            <h3 className="text-sm font-medium">
              {TOOL_CATEGORY_LABELS[category]}
              <span className="ml-2 text-muted-foreground">
                {group.length}
              </span>
            </h3>
            <div className="space-y-2">
              {group.map((tool) => (
                <ToolRow key={tool.name} tool={tool} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function MetricsPanel({ metrics }: MetricsPanelProps) {
  const detectedTools = metrics.tools.filter((tool) => tool.detected)
  const trackedTools = metrics.tools.filter((tool) => tool.tracked)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card>
          <CardContent className="flex items-center justify-center py-6">
            <ScoreGauge score={metrics.adoptionScore} />
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Coverage"
            value={`${metrics.coverage.toFixed(1)}%`}
            description={`${metrics.toolsDetected} of ${metrics.toolsTracked} tracked tools detected`}
            tooltip="Share of your tracked tools that were detected in the latest scan."
          />
          <StatCard
            label="Adoption"
            value={`${metrics.adoption.toFixed(1)}%`}
            description={`${metrics.toolsDetected} detected across ${metrics.toolsRelevant} relevant tools`}
            tooltip="Average adoption rate across detected tracked tools. Commit-presence proxies are excluded from the score."
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tool breakdown</CardTitle>
          <CardDescription>
            {metrics.toolsChecked} tools checked
            {metrics.languages.length > 0
              ? ` · Languages: ${metrics.languages.join(", ")}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList className="w-full sm:w-fit">
              <TabsTrigger value="all">
                All ({metrics.tools.length})
              </TabsTrigger>
              <TabsTrigger value="detected">
                Detected ({detectedTools.length})
              </TabsTrigger>
              <TabsTrigger value="tracked">
                Tracked ({trackedTools.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="mt-4">
              <ToolGroupList tools={metrics.tools} />
            </TabsContent>
            <TabsContent value="detected" className="mt-4">
              <ToolGroupList tools={detectedTools} />
            </TabsContent>
            <TabsContent value="tracked" className="mt-4">
              <ToolGroupList tools={trackedTools} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
