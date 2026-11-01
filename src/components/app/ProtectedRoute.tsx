import { Navigate, Outlet } from "react-router-dom"
import { PageLoader } from "@/components/PageLoader"
import { useAuth } from "@/hooks/useAuth"

export function ProtectedRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <PageLoader />

  if (!user) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
