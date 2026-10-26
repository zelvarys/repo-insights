import { RouterProvider } from "react-router-dom"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { router } from "@/router"

function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  )
}

export default App
