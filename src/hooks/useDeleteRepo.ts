import { useMutation } from "@tanstack/react-query"
import { api } from "@/lib/api"

export function useDeleteRepo() {
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/repos/${id}`),
  })
}
