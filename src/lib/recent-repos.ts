const STORAGE_KEY = "repo-insights:recent-repos"
const MAX_RECENT = 5

export function rememberRecentRepo(repoId: string): void {
  if (!repoId) return
  try {
    const current = recentRepoIds().filter((id) => id !== repoId)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([repoId, ...current].slice(0, MAX_RECENT)),
    )
  } catch {
    // Recent repositories are a convenience; storage may be unavailable.
  }
}

export function recentRepoIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "[]",
    )
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === "string")
  } catch {
    return []
  }
}
