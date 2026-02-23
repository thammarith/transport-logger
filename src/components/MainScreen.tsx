import { useState, useEffect, useCallback } from 'react'
import type { GitHubConfig, LogEntry, Station, DayType } from '../types'
import { stations } from '../data/stations'
import { lines, getLine } from '../data/lines'
import { findNearbyStations } from '../utils/geo'
import { getDayType } from '../utils/dayType'
import { predictArrivals } from '../utils/prediction'
import { fetchLogs, appendLog } from '../services/github'

interface MainScreenProps {
  config: GitHubConfig
  onLogout: () => void
}

export function MainScreen({ config, onLogout }: MainScreenProps) {
  const [allLogs, setAllLogs] = useState<LogEntry[]>([])
  const [selectedStation, setSelectedStation] = useState<Station | null>(null)
  const [nearbyStations, setNearbyStations] = useState<Station[]>([])
  const [isHoliday, setIsHoliday] = useState(false)
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastLogged, setLastLogged] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const dayType: DayType = getDayType(new Date(), isHoliday)
  const currentHour = new Date().getHours()

  // Load logs from GitHub
  useEffect(() => {
    fetchLogs(config)
      .then(setAllLogs)
      .catch((err) => setError(`Failed to load logs: ${err.message}`))
      .finally(() => setLoading(false))
  }, [config])

  // Get GPS location
  useEffect(() => {
    if (!navigator.geolocation) {
      setShowPicker(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nearby = findNearbyStations(
          pos.coords.latitude,
          pos.coords.longitude,
          stations,
        )
        setNearbyStations(nearby)
        if (nearby.length === 1) {
          setSelectedStation(nearby[0])
        } else if (nearby.length > 1) {
          setSelectedStation(nearby[0])
          setShowPicker(true)
        } else {
          setShowPicker(true)
        }
      },
      () => {
        setShowPicker(true)
      },
    )
  }, [])

  const handleLog = useCallback(
    async (direction: string) => {
      if (!selectedStation) return
      setLogging(true)
      setError(null)

      const now = new Date()
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

      const entry: LogEntry = {
        station: selectedStation.id,
        line: selectedStation.line,
        direction,
        time,
        dayType,
        date: now.toISOString().slice(0, 10),
      }

      try {
        await appendLog(config, entry)
        setAllLogs((prev) => [...prev, entry])
        setLastLogged(`${time} -> ${direction}`)
      } catch (err) {
        setError(`Failed to save: ${(err as Error).message}`)
      } finally {
        setLogging(false)
      }
    },
    [selectedStation, dayType, config],
  )

  const line = selectedStation ? getLine(selectedStation.line) : null

  const getPredictions = (direction: string) => {
    if (!selectedStation) return []
    return [
      ...predictArrivals(allLogs, selectedStation.id, direction, dayType, currentHour),
      ...predictArrivals(allLogs, selectedStation.id, direction, dayType, currentHour + 1),
    ]
  }

  if (loading) {
    return <div className="main-screen"><p>Loading...</p></div>
  }

  // Station picker grouped by line
  const stationsByLine = lines.map((l) => ({
    line: l,
    stations: stations.filter((s) => s.line === l.id),
  }))

  return (
    <div className="main-screen">
      <header>
        <h1>Transport Logger</h1>
        <div className="controls">
          <label className="holiday-toggle">
            <input
              type="checkbox"
              checked={isHoliday}
              onChange={(e) => setIsHoliday(e.target.checked)}
            />
            Holiday
          </label>
          <span className="day-type-badge">{dayType}</span>
          <button className="settings-btn" onClick={onLogout}>Settings</button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      {/* Station selection */}
      {showPicker && (
        <div className="station-picker">
          {nearbyStations.length > 0 && (
            <div className="nearby-stations">
              <h3>Nearby Stations</h3>
              {nearbyStations.map((s) => (
                <button
                  key={s.id}
                  className={`station-option ${selectedStation?.id === s.id ? 'selected' : ''}`}
                  onClick={() => { setSelectedStation(s); setShowPicker(false) }}
                >
                  {s.name} <span className="line-tag">{getLine(s.line)?.name}</span>
                </button>
              ))}
            </div>
          )}
          <details>
            <summary>All Stations</summary>
            {stationsByLine.map(({ line: l, stations: lineStations }) => (
              <div key={l.id} className="line-group">
                <h4>{l.name}</h4>
                {lineStations.map((s) => (
                  <button
                    key={s.id}
                    className={`station-option ${selectedStation?.id === s.id ? 'selected' : ''}`}
                    onClick={() => { setSelectedStation(s); setShowPicker(false) }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            ))}
          </details>
        </div>
      )}

      {selectedStation && (
        <>
          <div className="selected-station" onClick={() => setShowPicker(!showPicker)}>
            <h2>{selectedStation.name}</h2>
            <span className="line-tag">{line?.name}</span>
            <span className="change-link">Change</span>
          </div>

          {/* Predictions and logging for each direction */}
          {line?.directions.map((dir) => {
            const predictions = getPredictions(dir.id)
            return (
              <div key={dir.id} className="direction-section">
                <h3>-&gt; {dir.label}</h3>
                <div className="predictions">
                  {predictions.length > 0 ? (
                    <p>{predictions.join(', ')}</p>
                  ) : (
                    <p className="no-data">No data yet</p>
                  )}
                </div>
                <button
                  className="log-btn"
                  disabled={logging}
                  onClick={() => handleLog(dir.id)}
                >
                  {logging ? 'Saving...' : `Log -> ${dir.label}`}
                </button>
              </div>
            )
          })}

          {lastLogged && <p className="last-logged">Last logged: {lastLogged}</p>}
        </>
      )}
    </div>
  )
}
