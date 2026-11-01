import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query"
import type { TrackedRepository } from "@shared/types"
import { api } from "@/lib/api"
import { queryClient } from "@/lib/query-client"
import type { GitHubRepo } from "@/types/local"

export function useRepos(enabled = true) {
  return useQuery({
    queryKey: ["repos"],
    enabled,
    queryFn: () => api.get<{ repositories: TrackedRepository[] }>("/repos"),
  })
}

export type GitHubReposPage = {
  repos: GitHubRepo[]
  hasMore: boolean
  page: number
}

export function useGitHubRepos() {
  return useInfiniteQuery({
    queryKey: ["repos", "github"],
    queryFn: ({ pageParam }) =>
      api.get<GitHubReposPage>(`/repos/github?page=${pageParam}&perPage=100`),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    staleTime: 5 * 60_000,
  })
}

export function useAddRepo() {
  return useMutation({
    mutationFn: (githubId: number) =>
      api.post<{ repository: TrackedRepository }>("/repos", { githubId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["repos"] })
      void queryClient.invalidateQueries({ queryKey: ["repos", "github"] })
    },
  })
}
