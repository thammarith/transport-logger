export type LineId = 'mrt_blue' | 'bts_sukhumvit' | 'bts_silom' | 'arl'

export type DayType = 'workday' | 'weekend' | 'holiday'

export interface Station {
  id: string
  name: string
  line: LineId
  lat: number
  lng: number
}

export interface Line {
  id: LineId
  name: string
  directions: [DirectionInfo, DirectionInfo]
}

export interface DirectionInfo {
  id: string
  label: string
}

export interface LogEntry {
  station: string
  line: LineId
  direction: string
  time: string // "HH:MM"
  dayType: DayType
  date: string // "YYYY-MM-DD"
}

export interface GitHubConfig {
  token: string
}
