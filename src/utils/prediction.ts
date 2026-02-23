import type { DayType, LogEntry } from '../types'

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function clusterTimes(minutes: number[]): number[] {
  if (minutes.length === 0) return []

  const sorted = [...minutes].sort((a, b) => a - b)
  const clusters: number[][] = [[sorted[0]]]

  for (let i = 1; i < sorted.length; i++) {
    const lastCluster = clusters[clusters.length - 1]
    if (sorted[i] - lastCluster[lastCluster.length - 1] <= 2) {
      lastCluster.push(sorted[i])
    } else {
      clusters.push([sorted[i]])
    }
  }

  return clusters.map((cluster) => {
    const freq = new Map<number, number>()
    for (const m of cluster) {
      freq.set(m, (freq.get(m) ?? 0) + 1)
    }
    const maxFreq = Math.max(...freq.values())
    const mostCommon = [...freq.entries()]
      .filter(([, count]) => count === maxFreq)
      .map(([val]) => val)
    return mostCommon[Math.floor(mostCommon.length / 2)]
  })
}

export function predictArrivals(
  logs: LogEntry[],
  station: string,
  direction: string,
  dayType: DayType,
  hour: number,
): string[] {
  const matching = logs.filter(
    (log) =>
      log.station === station &&
      log.direction === direction &&
      log.dayType === dayType,
  )

  const hourStart = hour * 60
  const hourEnd = hourStart + 60

  const minutesInHour = matching
    .map((log) => timeToMinutes(log.time))
    .filter((m) => m >= hourStart && m < hourEnd)

  const clustered = clusterTimes(minutesInHour)
  return clustered.map(minutesToTime)
}
