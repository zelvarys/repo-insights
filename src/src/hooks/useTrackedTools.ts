import { useMutation, useQuery } from "@tanstack/react-query"
import type { TrackedToolRow } from "@shared/types/api"
import { api } from "@/lib/api"
import { queryClient } from "@/lib/query-client"

type TrackedToolsResponse = {
  repoId: string
  tools: TrackedToolRow[]
}

type TrackedToolInput = {
  name: string
  enabled: boolean
}

function trackedToolsKey(repoId: string) {
  return ["repo", repoId, "tracked-tools"] as const
}

export function useTrackedTools(repoId: string) {
  return useQuery({
    queryKey: trackedToolsKey(repoId),
    queryFn: () =>
      api.get<TrackedToolsResponse>(`/repos/${repoId}/tracked-tools`),
    enabled: Boolean(repoId),
  })
}

export function useUpdateTrackedTools(repoId: string) {
  return useMutation({
    mutationFn: (tools: TrackedToolInput[]) =>
      api.put<TrackedToolsResponse>(`/repos/${repoId}/tracked-tools`, {
        tools,
      }),
    onMutate: async (next) => {
      const key = trackedToolsKey(repoId)
      await queryClient.cancelQueries({ queryKey: key })
      const prev = queryClient.getQueryData<TrackedToolsResponse>(key)

      if (prev) {
        const enabledByName = new Map(
          next.map((tool) => [tool.name, tool.enabled]),
        )
        queryClient.setQueryData<TrackedToolsResponse>(key, {
          ...prev,
          tools: prev.tools.map((tool) => ({
            ...tool,
            enabled: enabledByName.get(tool.toolName) ?? tool.enabled,
          })),
        })
      }

      return { prev }
    },
    onError: (_error, _variables, context) => {
      if (context?.prev) {
        queryClient.setQueryData(trackedToolsKey(repoId), context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: trackedToolsKey(repoId) })
      queryClient.invalidateQueries({ queryKey: ["repo", repoId, "metrics"] })
    },
  })
}
