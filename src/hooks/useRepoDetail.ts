import { useQuery } from "@tanstack/react-query"
import type {
  RepoMetrics,
  ScanSummary,
  TrackedRepository,
} from "@shared/types"
import { api } from "@/lib/api"

export function useRepo(id: string) {
  return useQuery({
    queryKey: ["repo", id],
    queryFn: () => api.get<{ repository: TrackedRepository }>(`/repos/${id}`),
    enabled: Boolean(id),
  })
}

export function useRepoMetrics(id: string) {
  return useQuery({
    queryKey: ["repo", id, "metrics"],
    queryFn: () => api.get<RepoMetrics>(`/repos/${id}/metrics`),
    enabled: Boolean(id),
  })
}

export function useRepoScans(id: string) {
  return useQuery({
    queryKey: ["repo", id, "scans"],
    queryFn: () => api.get<{ scans: ScanSummary[] }>(`/repos/${id}/scans`),
    enabled: Boolean(id),
  })
}
