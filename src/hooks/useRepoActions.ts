import { useMutation } from '@tanstack/react-query'
import type {
  CreateCodespaceResponse,
  CreateIssueResponse,
  RerunWorkflowResponse,
} from '@shared/types'
import { api } from '@/lib/api'

export function useRerunWorkflow(repoId: string) {
  return useMutation({
    mutationFn: (runId: number) =>
      api.post<RerunWorkflowResponse>(
        `/repos/${repoId}/ci/runs/${runId}/rerun`,
        {},
      ),
  })
}

export function useCreateIssue(repoId: string) {
  return useMutation({
    mutationFn: (input: { title: string; body: string }) =>
      api.post<CreateIssueResponse>(`/repos/${repoId}/issues`, input),
  })
}

export function useCreateCodespace(repoId: string) {
  return useMutation({
    mutationFn: (input?: { ref?: string }) =>
      api.post<CreateCodespaceResponse>(
        `/repos/${repoId}/codespaces`,
        input ?? {},
      ),
  })
}
