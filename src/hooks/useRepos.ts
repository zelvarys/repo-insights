import { useMutation, useQuery } from "@tanstack/react-query"
import type { TrackedRepository } from "@shared/types"
import { api } from "@/lib/api"
import { queryClient } from "@/lib/query-client"
import type { GitHubRepo } from "@/types/local"

export function useRepos() {
  return useQuery({
    queryKey: ["repos"],
    queryFn: () =>
      api.get<{ repositories: TrackedRepository[] }>("/repos"),
  })
}

export function useGitHubRepos() {
  return useQuery({
    queryKey: ["repos", "github"],
    queryFn: () => api.get<{ repos: GitHubRepo[] }>("/repos/github"),
    staleTime: 5 * 60_000,
  })
}

export function useAddRepo() {
  return useMutation({
    mutationFn: (githubId: number) =>
      api.post<{ repository: TrackedRepository }>("/repos", { githubId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["repos"] })
      queryClient.invalidateQueries({ queryKey: ["repos", "github"] })
    },
  })
}
