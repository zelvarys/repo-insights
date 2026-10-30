import { useCallback, useEffect, useRef } from "react"
import { useParams } from "react-router-dom"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import { Loader2, Save, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import type { ToolCategory, TrackedToolRow } from "@shared/types"
import { ErrorState } from "@/components/app/ErrorState"
import { SettingsSkeleton } from "@/components/app/LoadingSkeletons"
import { TOOL_CATEGORY_LABELS } from "@/components/app/ToolRow"
import { PageHeader } from "@/components/layout/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useTrackedTools, useUpdateTrackedTools } from "@/hooks/useTrackedTools"
import { cn } from "@/lib/utils"

type FormTool = {
  name: string
  enabled: boolean
}

type FormValues = {
  tools: FormTool[]
}

const CATEGORY_ORDER: ToolCategory[] = [
  "testing",
  "linting",
  "ci_cd",
  "coverage",
  "docs",
  "dependencies",
]

function toFormValues(tools: TrackedToolRow[]): FormValues {
  return {
    tools: tools.map((tool) => ({
      name: tool.toolName,
      enabled: tool.enabled,
    })),
  }
}

function toolsEqual(left: FormTool[], right: FormTool[]): boolean {
  if (left.length !== right.length) return false
  const rightByName = new Map(right.map((tool) => [tool.name, tool.enabled]))
  return left.every((tool) => rightByName.get(tool.name) === tool.enabled)
}

function categoryLabel(category: string): string {
  return TOOL_CATEGORY_LABELS[category as ToolCategory] ?? category
}

export default function RepoSettings() {
  const { id } = useParams<{ id: string }>()
  const repoId = id ?? ""

  const trackedTools = useTrackedTools(repoId)
  const updateMutation = useUpdateTrackedTools(repoId)

  const form = useForm<FormValues>({
    defaultValues: toFormValues(trackedTools.data?.tools ?? []),
  })
  const { control, getValues, reset, formState } = form
  const { fields } = useFieldArray({ control, name: "tools" })
  const watchedTools = useWatch({ control, name: "tools" })
  const enabledCount = (watchedTools ?? []).filter(
    (tool) => tool.enabled,
  ).length

  const lastSavedRef = useRef<FormValues>({ tools: [] })
  const initializedRepoRef = useRef<string | null>(null)
  const saveTimerRef = useRef<number | undefined>(undefined)

  const mutate = updateMutation.mutate

  const persist = useCallback(
    (tools: FormTool[]) => {
      const snapshot = tools.map((tool) => ({
        name: tool.name,
        enabled: tool.enabled,
      }))

      mutate(snapshot, {
        onSuccess: ({ tools: savedTools }) => {
          const savedValues = toFormValues(savedTools)
          lastSavedRef.current = savedValues
          if (toolsEqual(getValues("tools"), savedValues.tools)) {
            reset(savedValues)
          }
          toast.success("Saved")
        },
        onError: (error) => {
          reset(lastSavedRef.current)
          toast.error("Could not save settings", {
            description: error.message,
          })
        },
      })
    },
    [getValues, reset, mutate],
  )

  useEffect(() => {
    if (!trackedTools.data) return

    const values = toFormValues(trackedTools.data.tools)
    const repoChanged = initializedRepoRef.current !== repoId
    const canSync = !formState.isDirty && !updateMutation.isPending

    if (!repoChanged && !canSync) return

    lastSavedRef.current = values
    initializedRepoRef.current = repoId
    reset(values)
  }, [
    trackedTools.data,
    repoId,
    formState.isDirty,
    updateMutation.isPending,
    reset,
  ])

  useEffect(() => {
    const subscription = form.watch((values) => {
      if (!values.tools) return
      window.clearTimeout(saveTimerRef.current)

      const next = values.tools.filter(
        (tool): tool is FormTool =>
          typeof tool?.name === "string" && typeof tool.enabled === "boolean",
      )
      if (toolsEqual(next, lastSavedRef.current.tools)) return

      saveTimerRef.current = window.setTimeout(() => {
        persist(getValues("tools"))
      }, 500)
    })

    return () => {
      subscription.unsubscribe()
      window.clearTimeout(saveTimerRef.current)
    }
  }, [form, getValues, persist])

  const toolsById = new Map(
    (trackedTools.data?.tools ?? []).map((tool) => [tool.toolName, tool]),
  )

  const backTo = repoId ? `/repos/${repoId}` : "/dashboard"

  function handleSave() {
    window.clearTimeout(saveTimerRef.current)
    persist(getValues("tools"))
  }

  if (!repoId) {
    return (
      <>
        <PageHeader
          title="Tracked tools"
          description="Choose which tools count toward this repo's adoption score."
          backTo="/dashboard"
          backLabel="Dashboard"
        />
        <ErrorState error={new Error("Repository id is required.")} />
      </>
    )
  }

  if (trackedTools.isLoading) {
    return (
      <>
        <PageHeader
          title="Tracked tools"
          description="Choose which tools count toward this repo's adoption score."
          backTo={backTo}
          backLabel="Back to report"
        />
        <SettingsSkeleton />
      </>
    )
  }

  if (trackedTools.isError) {
    return (
      <>
        <PageHeader
          title="Tracked tools"
          description="Choose which tools count toward this repo's adoption score."
          backTo={backTo}
          backLabel="Back to report"
        />
        <ErrorState
          error={trackedTools.error}
          onRetry={() => trackedTools.refetch()}
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Tracked tools"
        description="Choose which tools count toward this repo's adoption score."
        backTo={backTo}
        backLabel="Back to report"
        actions={
          <Button
            type="button"
            onClick={handleSave}
            disabled={updateMutation.isPending || !formState.isDirty}
          >
            {updateMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {updateMutation.isPending ? "Saving..." : "Save"}
          </Button>
        }
      />

      {fields.length > 0 && enabledCount === 0 ? (
        <Alert className="mb-4">
          <TriangleAlert className="size-4" />
          <AlertTitle>You aren&apos;t tracking any tools</AlertTitle>
          <AlertDescription>
            The score will fall back to all detected tools in this repository.
          </AlertDescription>
        </Alert>
      ) : null}

      <Form {...form}>
        <form onSubmit={(event) => event.preventDefault()}>
          <Card>
            <CardHeader>
              <CardTitle>Tool selection</CardTitle>
              <CardDescription>
                Changes save automatically after a short pause. Use Save to
                apply them immediately.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {CATEGORY_ORDER.map((category) => {
                const indexes = fields
                  .map((field, index) => ({ field, index }))
                  .filter(
                    ({ field }) =>
                      toolsById.get(field.name)?.category === category,
                  )
                if (indexes.length === 0) return null

                return (
                  <section key={category} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold">
                        {categoryLabel(category)}
                      </h2>
                      <span className="text-xs text-muted-foreground">
                        {indexes.length}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {indexes.map(({ field, index }) => {
                        const tool = toolsById.get(field.name)
                        if (!tool) return null

                        return (
                          <FormField
                            key={field.id}
                            control={control}
                            name={`tools.${index}.enabled`}
                            render={({ field: switchField }) => (
                              <FormItem
                                className={cn(
                                  "flex flex-row items-center justify-between gap-4 rounded-lg border p-4",
                                  !tool.relevant && "opacity-50",
                                )}
                              >
                                <div className="min-w-0 space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <FormLabel className="text-sm font-medium">
                                      {tool.toolName}
                                    </FormLabel>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge
                                          variant={
                                            tool.detected
                                              ? "default"
                                              : "secondary"
                                          }
                                          className="cursor-help"
                                        >
                                          {tool.detected
                                            ? "Detected"
                                            : "Not detected"}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {tool.detected
                                          ? "This tool was found in the latest scan."
                                          : "This tool was not found in the latest scan."}
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {!tool.relevant
                                      ? "Not applicable to this repository's languages."
                                      : tool.detected
                                        ? "Included when enabled in the adoption score."
                                        : "Enable to include it once detected."}
                                  </p>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={switchField.value}
                                    onCheckedChange={switchField.onChange}
                                    disabled={!tool.relevant}
                                    aria-label={`Track ${tool.toolName}`}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </CardContent>
          </Card>
        </form>
      </Form>
    </>
  )
}
