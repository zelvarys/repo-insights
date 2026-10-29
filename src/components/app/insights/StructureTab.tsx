import { useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ChevronDown, ChevronRight, File, Folder, FolderTree } from "lucide-react"
import type { RepoTreeNode } from "@shared/types"
import {
  InsightError,
  InsightLoading,
  InsightUnavailable,
} from "@/components/app/insights/InsightState"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useRepoStructure } from "@/hooks/useRepoInsights"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"

function TreeRow({
  node,
  depth,
  expanded,
  toggle,
}: {
  node: RepoTreeNode
  depth: number
  expanded: Set<string>
  toggle: (path: string) => void
}) {
  const isOpen = expanded.has(node.path)
  const isDirectory = node.type === "dir"
  return (
    <div>
      <button
        type="button"
        onClick={() => (isDirectory ? toggle(node.path) : undefined)}
        aria-expanded={isDirectory ? isOpen : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/50",
          !isDirectory && "cursor-default"
        )}
        style={{ paddingLeft: `${depth * 18 + 8}px` }}
        title={node.path}
      >
        {isDirectory ? (
          isOpen ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {isDirectory ? (
          <Folder className="size-4 shrink-0 text-primary" />
        ) : (
          <File className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs">
          {node.name}
        </span>
        {isDirectory ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {node.fileCount ?? 0} files · {formatBytes(node.size)}
          </span>
        ) : (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {formatBytes(node.size)}
            {node.lastModified
              ? ` · ${new Date(node.lastModified).toLocaleDateString()}`
              : ""}
          </span>
        )}
      </button>
      {isDirectory && isOpen
        ? node.children?.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
            />
          ))
        : null}
    </div>
  )
}

export function StructureTab({
  repoId,
  scanning,
  onRunScan,
}: {
  repoId: string
  scanning: boolean
  onRunScan: () => void
}) {
  const query = useRepoStructure(repoId)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (query.isLoading) return <InsightLoading />
  if (query.isError) {
    return (
      <InsightError
        error={query.error ?? new Error("Unknown error")}
        onRetry={() => query.refetch()}
      />
    )
  }
  if (!query.data?.available || !query.data.structure) {
    return (
      <InsightUnavailable
        title="No structure data yet"
        description="Run a scan to collect the repository tree, file counts, sizes, and file-type breakdown."
        scanning={scanning}
        onRunScan={onRunScan}
      />
    )
  }

  const structure = query.data.structure

  function toggle(path: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Files</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{structure.fileCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Directories</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{structure.directoryCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Repository size</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {formatBytes(structure.totalSize)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>File types</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{structure.fileTypes.length}</p>
            {structure.truncated ? (
              <Badge variant="secondary" className="mt-2">
                Truncated
              </Badge>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>File-type breakdown</CardTitle>
          <CardDescription>Top file extensions by file count.</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={structure.fileTypes.slice(0, 10)}
              layout="vertical"
              margin={{ left: 8, right: 16 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} hide />
              <YAxis
                type="category"
                dataKey="extension"
                width={80}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="var(--chart-2)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="size-4" />
              Repository tree
            </CardTitle>
            <CardDescription>
              Up to depth 4 and 500 entries. Click a directory to expand it.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setExpanded(
                new Set(
                  structure.tree.filter((node) => node.type === "dir").map((node) => node.path)
                )
              )
            }
          >
            Expand roots
          </Button>
        </CardHeader>
        <CardContent>
          <div className="max-h-[32rem] overflow-auto rounded-lg border p-2">
            {structure.tree.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No files were returned for this scan.
              </p>
            ) : (
              structure.tree.map((node) => (
                <TreeRow
                  key={node.path}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  toggle={toggle}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
