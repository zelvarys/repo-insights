import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import type { AuthUser } from "@shared/types"
import { api, ApiError } from "@/lib/api"
import { useAuthStore } from "@/store/auth"

type MeResponse = {
  user: AuthUser | null
}

export function useAuth() {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)

  const query = useQuery<MeResponse>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      try {
        return await api.get<{ user: AuthUser }>("/auth/me")
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return { user: null }
        }
        throw error
      }
    },
  })

  useEffect(() => {
    if (query.data) {
      setUser(query.data.user)
    }
  }, [query.data, setUser])

  const isHydrating =
    query.data !== undefined && user !== query.data.user

  return {
    user,
    isLoading: query.isLoading || isHydrating,
    isAuthenticated: user !== null,
  }
}
