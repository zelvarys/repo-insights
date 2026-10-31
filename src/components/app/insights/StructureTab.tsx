import { useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChevronDown,
  ChevronRight,
  Copy,
  File,
  Folder,
  FolderTree,
} from "lucide-react"
import { toast } from "sonner"
import type { RepoTreeNode } from "@shared/types"
import {
  InsightError,
  InsightLoading,
  InsightUnavailable,
} from "@/components/app/insights/InsightState"
import { StatCard } from "@/components/app/StatCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useRepoStructure } from "@/hooks/useRepoInsights"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"

const IGNORED_FILE_TYPES = new Set([
  "(none)",
  ".example",
  ".sample",
  ".template",
  ".tmpl",
  ".dist",
  ".bak",
  ".tmp",
  ".temp",
  ".log",
  ".lock",
  ".map",
])

function treeToText(nodes: RepoTreeNode[]): string {
  const lines = ["."]

  function visit(children: RepoTreeNode[], prefix: string) {
    children.forEach((node, index) => {
      const last = index === children.length - 1
      lines.push(
        `${prefix}${last ? "`-- " : "|-- "}${node.name}${node.type === "dir" ? "/" : ""}`,
      )
      if (node.type === "dir" && node.children?.length) {
        visit(node.children, `${prefix}${last ? "    " : "|   "}`)
      }
    })
  }

  visit(nodes, "")
  return lines.join("\n")
}

function TreeRow({
  node,
  depth,
  expanded,
  toggle,
  selectedPath,
  onSelectFile,
}: {
  node: RepoTreeNode
  depth: number
  expanded: Set<string>
  toggle: (path: string) => void
  selectedPath: string | null
  onSelectFile: (node: RepoTreeNode) => void
}) {
  const isOpen = expanded.has(node.path)
  const isDirectory = node.type === "dir"
  return (
    <div>
      <button
        type="button"
        onClick={() => (isDirectory ? toggle(node.path) : onSelectFile(node))}
        aria-expanded={isDirectory ? isOpen : undefined}
        aria-pressed={!isDirectory ? selectedPath === node.path : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent/50",
          !isDirectory &&
            selectedPath === node.path &&
            "bg-accent text-accent-foreground",
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
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
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
  const [selectedFile, setSelectedFile] = useState<RepoTreeNode | null>(null)

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
  const visibleFileTypes = structure.fileTypes.filter(
    (stat) => !IGNORED_FILE_TYPES.has(stat.extension),
  )
  const rootDirs = structure.tree.filter((node) => node.type === "dir")
  const allRootsExpanded =
    rootDirs.length > 0 && rootDirs.every((node) => expanded.has(node.path))
  const chartHeight = Math.max(220, visibleFileTypes.length * 28 + 24)

  function toggle(path: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function toggleRoots() {
    if (allRootsExpanded) {
      setExpanded(new Set())
      return
    }
    setExpanded(new Set(rootDirs.map((node) => node.path)))
  }

  async function copyStructure() {
    try {
      await navigator.clipboard.writeText(treeToText(structure.tree))
      toast.success("File structure copied")
    } catch {
      toast.error("Could not copy the file structure")
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Files" value={structure.fileCount} />
        <StatCard label="Directories" value={structure.directoryCount} />
        <StatCard
          label="Repository size"
          value={formatBytes(structure.totalSize)}
        />
        <StatCard
          label="File types"
          value={visibleFileTypes.length}
          detail={
            structure.truncated ? (
              <Badge variant="secondary">Truncated</Badge>
            ) : undefined
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>File-type breakdown</CardTitle>
          <CardDescription>
            All {visibleFileTypes.length} file types by file count.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {visibleFileTypes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No file types were returned for this scan.
            </p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto">
              <div style={{ height: chartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={visibleFileTypes}
                    layout="vertical"
                    margin={{ top: 4, right: 36, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis
                      dataKey="extension"
                      type="category"
                      width={72}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fontFamily: "monospace" }}
                    />
                    <ChartTooltip
                      cursor={{ fill: "var(--muted)" }}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                      formatter={(value) => [
                        `${value} ${value === 1 ? "file" : "files"}`,
                        "Count",
                      ]}
                    />
                    <Bar
                      dataKey="count"
                      fill="var(--chart-2)"
                      radius={[0, 4, 4, 0]}
                      barSize={14}
                    >
                      <LabelList
                        dataKey="count"
                        position="right"
                        fill="var(--muted-foreground)"
                        fontSize={11}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="size-4" />
            Repository tree
          </CardTitle>
          <CardAction>
            <Button
              variant="outline"
              size="icon"
              onClick={copyStructure}
              disabled={structure.tree.length === 0}
              aria-label="Copy file structure"
              title="Copy file structure"
            >
              <Copy className="size-4" />
            </Button>
          </CardAction>
          <CardDescription className="mt-2">
            Up to depth 4 and 500 entries. Click a directory to expand it;
            select a file for its full path and metadata.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={toggleRoots}>
              {allRootsExpanded ? "Collapse roots" : "Expand roots"}
            </Button>
          </div>
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
                  selectedPath={selectedFile?.path ?? null}
                  onSelectFile={setSelectedFile}
                />
              ))
            )}
          </div>
          {selectedFile ? (
            <div className="mt-4 rounded-lg border bg-muted/30 p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Selected file
              </p>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <dt className="text-xs text-muted-foreground">Path</dt>
                  <dd className="mt-1 break-all font-mono text-sm">
                    {selectedFile.path}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Size</dt>
                  <dd className="mt-1 text-sm">
                    {formatBytes(selectedFile.size)}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">
                    Last modified
                  </dt>
                  <dd className="mt-1 text-sm">
                    {selectedFile.lastModified
                      ? new Date(selectedFile.lastModified).toLocaleString()
                      : "Not available"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
