// TODO: promote to shared/types.ts
export type GitHubRepo = {
  id: number
  name: string
  full_name: string
  owner: { login: string }
  private: boolean
  default_branch: string
  stargazers_count: number
  forks_count: number
}
