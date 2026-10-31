import type { RepoMetrics, ToolCategory, ToolMetric } from "@shared/types"
import { toast } from "sonner"
import { TOOL_CATEGORY_LABELS, ToolRow } from "@/components/app/ToolRow"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTrackedTools, useUpdateTrackedTools } from "@/hooks/useTrackedTools"

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

function ToolGroupList({
  tools,
  trackedByName,
  trackingDisabled,
  onTrackedChange,
}: {
  tools: ToolMetric[]
  trackedByName: Map<string, boolean>
  trackingDisabled: boolean
  onTrackedChange: (name: string, enabled: boolean) => void
}) {
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
              <span className="ml-2 text-muted-foreground">{group.length}</span>
            </h3>
            <div className="space-y-2">
              {group.map((tool) => (
                <ToolRow
                  key={tool.name}
                  tool={tool}
                  tracked={trackedByName.get(tool.name) ?? tool.tracked}
                  trackingDisabled={trackingDisabled}
                  onTrackedChange={(enabled) =>
                    onTrackedChange(tool.name, enabled)
                  }
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function MetricsPanel({ metrics }: MetricsPanelProps) {
  const trackedToolsQuery = useTrackedTools(metrics.repoId)
  const updateTrackedTools = useUpdateTrackedTools(metrics.repoId)
  const trackedByName = new Map(
    (trackedToolsQuery.data?.tools ?? []).map((tool) => [
      tool.toolName,
      tool.enabled,
    ]),
  )
  const detectedTools = metrics.tools.filter((tool) => tool.adoptionRate > 0)
  const trackedTools = metrics.tools.filter(
    (tool) => trackedByName.get(tool.name) ?? tool.tracked,
  )
  const trackingDisabled =
    !trackedToolsQuery.data || updateTrackedTools.isPending

  function handleTrackedChange(name: string, enabled: boolean) {
    if (!trackedToolsQuery.data) return
    updateTrackedTools.mutate(
      trackedToolsQuery.data.tools.map((tool) => ({
        name: tool.toolName,
        enabled: tool.toolName === name ? enabled : tool.enabled,
      })),
      {
        onError: (error) => {
          toast.error("Could not update tracked tools", {
            description: error.message,
          })
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Adoption score</CardTitle>
          <CardDescription>
            Average adoption across detected tracked tools.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2">
            <p className="text-5xl font-bold">
              {metrics.adoptionScore.toFixed(1)}
            </p>
            <p className="pb-2 text-sm text-muted-foreground">/ 100</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tool breakdown</CardTitle>
          <CardDescription>
            {`${metrics.toolsChecked} tools checked${
              metrics.languages.length > 0
                ? ` · Languages: ${metrics.languages.join(", ")}`
                : ""
            }. Toggle a tool to include it in adoption scoring.`}
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
              <ToolGroupList
                tools={metrics.tools}
                trackedByName={trackedByName}
                trackingDisabled={trackingDisabled}
                onTrackedChange={handleTrackedChange}
              />
            </TabsContent>
            <TabsContent value="detected" className="mt-4">
              <ToolGroupList
                tools={detectedTools}
                trackedByName={trackedByName}
                trackingDisabled={trackingDisabled}
                onTrackedChange={handleTrackedChange}
              />
            </TabsContent>
            <TabsContent value="tracked" className="mt-4">
              <ToolGroupList
                tools={trackedTools}
                trackedByName={trackedByName}
                trackingDisabled={trackingDisabled}
                onTrackedChange={handleTrackedChange}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
