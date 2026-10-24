import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(rootDir, "..")

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
      "@shared": path.resolve(repoRoot, "shared"),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [repoRoot] },
    proxy: {
      "/auth": "http://localhost:3000",
      // /repos is both an API path and an SPA route. Proxy API calls, but
      // serve index.html for full-page browser navigations.
      "/repos": {
        target: "http://localhost:3000",
        bypass(req) {
          if (req.headers.accept?.includes("text/html")) {
            return "/index.html"
          }
        },
      },
      "/scans": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
})
