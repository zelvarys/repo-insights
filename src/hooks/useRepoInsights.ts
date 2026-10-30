import { useMutation, useQuery } from "@tanstack/react-query"
import type {
  CiHealthResponse,
  CommitActivityResponse,
  ContributorConcentrationResponse,
  DependenciesResponse,
  DependencyRefreshResponse,
  OverviewResponse,
  RepoStructureResponse,
} from "@shared/types"
import { api } from "@/lib/api"
import { queryClient } from "@/lib/query-client"

export type ActivityRange = 90 | 180 | 365
export type CiRange = 30 | 90 | 365

export type DependencyFilters = {
  page: number
  perPage: number
  show: "all" | "outdated" | "advisory"
}

export type CiFilters = {
  workflow?: string
  branch?: string
  range: CiRange
}

function insightKey(repoId: string, name: string) {
  return ["repo", repoId, "insights", name] as const
}

export function useRepoStructure(repoId: string) {
  return useQuery({
    queryKey: insightKey(repoId, "structure"),
    queryFn: () =>
      api.get<RepoStructureResponse>(`/repos/${repoId}/structure`),
    enabled: Boolean(repoId),
  })
}

export function useRepoActivity(repoId: string, range: ActivityRange) {
  return useQuery({
    queryKey: [...insightKey(repoId, "activity"), range],
    queryFn: () =>
      api.get<CommitActivityResponse>(
        `/repos/${repoId}/activity?range=${range}`
      ),
    enabled: Boolean(repoId),
  })
}

export function useRepoConcentration(repoId: string) {
  return useQuery({
    queryKey: insightKey(repoId, "concentration"),
    queryFn: () =>
      api.get<ContributorConcentrationResponse>(
        `/repos/${repoId}/concentration`
      ),
    enabled: Boolean(repoId),
  })
}

export function useRepoCi(repoId: string, filters: CiFilters) {
  const params = new URLSearchParams({ range: String(filters.range) })
  if (filters.workflow) params.set("workflow", filters.workflow)
  if (filters.branch) params.set("branch", filters.branch)
  return useQuery({
    queryKey: [...insightKey(repoId, "ci"), filters],
    queryFn: () =>
      api.get<CiHealthResponse>(`/repos/${repoId}/ci?${params.toString()}`),
    enabled: Boolean(repoId),
  })
}

export function useRepoDependencies(
  repoId: string,
  filters: DependencyFilters,
  polling = false
) {
  const params = new URLSearchParams({
    page: String(filters.page),
    perPage: String(filters.perPage),
  })
  if (filters.show === "outdated") params.set("outdated", "true")
  if (filters.show === "advisory") params.set("hasAdvisory", "true")
  return useQuery({
    queryKey: [...insightKey(repoId, "dependencies"), filters],
    queryFn: () =>
      api.get<DependenciesResponse>(
        `/repos/${repoId}/dependencies?${params.toString()}`
      ),
    enabled: Boolean(repoId),
    refetchInterval: polling ? 2000 : false,
  })
}

export function useRepoOverview(repoId: string) {
  return useQuery({
    queryKey: insightKey(repoId, "overview"),
    queryFn: () => api.get<OverviewResponse>(`/repos/${repoId}/overview`),
    enabled: Boolean(repoId),
  })
}

export function useRefreshDependencies(repoId: string) {
  return useMutation({
    mutationFn: () =>
      api.post<DependencyRefreshResponse>(
        `/repos/${repoId}/dependencies/refresh`,
        {}
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: insightKey(repoId, "dependencies"),
      })
      void queryClient.invalidateQueries({
        queryKey: insightKey(repoId, "overview"),
      })
    },
  })
}
