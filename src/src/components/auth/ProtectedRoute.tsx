import { Outlet } from "react-router-dom"

export function ProtectedRoute() {
  // TODO(F2): gate on auth state and redirect to /auth/github when signed out.
  return <Outlet />
}
