import { lazy, Suspense, type ReactNode } from "react"
import { createBrowserRouter } from "react-router-dom"
import { ProtectedRoute } from "@/components/auth/ProtectedRoute"
import { RouteErrorBoundary } from "@/components/ErrorBoundary"
import { AppShell } from "@/components/layout/AppShell"
import { PageLoader } from "@/components/PageLoader"

const Landing = lazy(() => import("@/pages/Landing"))
const Dashboard = lazy(() => import("@/pages/Dashboard"))
const Repos = lazy(() => import("@/pages/Repos"))
const RepoDetail = lazy(() => import("@/pages/RepoDetail"))
const RepoSettings = lazy(() => import("@/pages/RepoSettings"))
const NotFound = lazy(() => import("@/pages/NotFound"))

function withSuspense(node: ReactNode, fullScreen = false) {
  return (
    <Suspense fallback={<PageLoader fullScreen={fullScreen} />}>
      {node}
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    path: "/",
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        element: withSuspense(<Landing />, true),
      },
      {
        path: "app",
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: withSuspense(<Dashboard />) },
              { path: "repos", element: withSuspense(<Repos />) },
              {
                path: "repos/:owner/:repo",
                element: withSuspense(<RepoDetail />),
              },
              {
                path: "repos/:owner/:repo/settings",
                element: withSuspense(<RepoSettings />),
              },
            ],
          },
        ],
      },
      {
        path: "*",
        element: withSuspense(<NotFound />, true),
      },
    ],
  },
])
