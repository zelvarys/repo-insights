import { useMutation, useQuery } from "@tanstack/react-query"
import type { ScanSummary } from "@shared/types"
import { api } from "@/lib/api"
import { queryClient } from "@/lib/query-client"

export function useRunScan(repoId: string) {
  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ scan: ScanSummary; cached: boolean }>(
        `/repos/${repoId}/scan`,
        {}
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["repo", repoId, "scans"] })
    },
  })

  return mutation
}

export function useScanPoll(scanId: string | null) {
  return useQuery({
    queryKey: ["scan", scanId],
    queryFn: () => api.get<{ scan: ScanSummary }>(`/scans/${scanId}`),
    enabled: scanId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.scan.status
      if (status === "complete" || status === "failed") return false
      return 2000
    },
  })
}
