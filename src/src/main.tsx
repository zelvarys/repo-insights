import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import "./index.css"
import App from "./App"
import { AuthGate } from "@/components/app/AuthGate"
import { Toaster } from "@/components/ui/sonner"
import { queryClient } from "@/lib/query-client"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <App />
        <Toaster />
      </AuthGate>
    </QueryClientProvider>
  </StrictMode>
)
