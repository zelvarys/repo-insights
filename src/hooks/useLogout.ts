import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { api } from "@/lib/api"
import { queryClient } from "@/lib/query-client"
import { useAuthStore } from "@/store/auth"

export function useLogout() {
  const navigate = useNavigate()
  const clear = useAuthStore((state) => state.clear)

  return useMutation({
    mutationFn: () => api.post("/auth/logout", {}),
    onSuccess: () => {
      clear()
      queryClient.clear()
      navigate("/", { replace: true })
    },
  })
}
