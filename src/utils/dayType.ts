import type { DayType } from '../types'

export function getDayType(date: Date, isHoliday: boolean): DayType {
  if (isHoliday) return 'holiday'
  const day = date.getDay()
  if (day === 0 || day === 6) return 'weekend'
  return 'workday'
}
