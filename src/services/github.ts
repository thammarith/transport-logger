import type { GitHubConfig, LogEntry } from '../types'

const OWNER = 'thammarith'
const REPO = 'transport-logger'
const FILE_PATH = 'data/logs.json'

function apiUrl(): string {
  return `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`
}

function headers(config: GitHubConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  }
}

interface GitHubFileResponse {
  content: string
  sha: string
}

async function getFile(
  config: GitHubConfig,
): Promise<{ logs: LogEntry[]; sha: string | null }> {
  const response = await fetch(apiUrl(), { headers: headers(config) })
  if (response.status === 404) {
    return { logs: [], sha: null }
  }
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }
  const data: GitHubFileResponse = await response.json()
  const decoded = atob(data.content.replace(/\n/g, ''))
  return { logs: JSON.parse(decoded), sha: data.sha }
}

export async function fetchLogs(config: GitHubConfig): Promise<LogEntry[]> {
  const { logs } = await getFile(config)
  return logs
}

export async function appendLog(
  config: GitHubConfig,
  entry: LogEntry,
): Promise<void> {
  const { logs, sha } = await getFile(config)

  logs.push(entry)

  // Deduplicate
  const seen = new Set<string>()
  const unique = logs.filter((log) => {
    const key = `${log.date}|${log.time}|${log.station}|${log.direction}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Sort by station, direction, dayType, time
  unique.sort((a, b) =>
    a.station.localeCompare(b.station)
    || a.direction.localeCompare(b.direction)
    || a.dayType.localeCompare(b.dayType)
    || a.time.localeCompare(b.time),
  )

  const body: Record<string, unknown> = {
    message: `Add log entry: ${entry.station} ${entry.direction} ${entry.time}`,
    content: btoa(JSON.stringify(unique, null, 2)),
  }
  if (sha) {
    body.sha = sha
  }

  const response = await fetch(apiUrl(), {
    method: 'PUT',
    headers: headers(config),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }
}
