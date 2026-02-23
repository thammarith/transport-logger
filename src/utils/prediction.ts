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

  const unique = [...new Set(minutesInHour)].sort((a, b) => a - b)
  return unique.map(minutesToTime)
}
