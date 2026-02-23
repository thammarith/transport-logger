import { useState, useEffect, useCallback } from 'react'
import type { GitHubConfig, LogEntry, Station, DayType } from '../types'
import { stations } from '../data/stations'
import { lines, getLine } from '../data/lines'
import { findNearbyStations, type StationWithDistance } from '../utils/geo'
import { getDayType } from '../utils/dayType'
import { predictArrivals } from '../utils/prediction'
import { fetchLogs, appendLog } from '../services/github'

interface MainScreenProps {
  config: GitHubConfig
  onLogout: () => void
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`
  return `${(metres / 1000).toFixed(1)} km`
}

export function MainScreen({ config, onLogout }: MainScreenProps) {
  const [allLogs, setAllLogs] = useState<LogEntry[]>([])
  const [selectedStation, setSelectedStation] = useState<Station | null>(null)
  const [nearbyStations, setNearbyStations] = useState<StationWithDistance[]>([])
  const [selectedDistance, setSelectedDistance] = useState<number | null>(null)
  const [isHoliday, setIsHoliday] = useState(false)
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastLogged, setLastLogged] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [now, setNow] = useState(() => new Date())

  // Update clock every second
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const dayType: DayType = getDayType(now, isHoliday)
  const currentHour = now.getHours()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const currentDate = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  // Load logs from GitHub
  useEffect(() => {
    fetchLogs(config)
      .then(setAllLogs)
      .catch((err) => setError(`Failed to load logs: ${err.message}`))
      .finally(() => setLoading(false))
  }, [config])

  // Get GPS location — use watchPosition for continuous updates on iOS Safari
  useEffect(() => {
    if (!navigator.geolocation) {
      setShowPicker(true)
      return
    }
    let hasAutoSelected = false
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const nearby = findNearbyStations(
          pos.coords.latitude,
          pos.coords.longitude,
          stations,
        )
        setNearbyStations(nearby)
        if (!hasAutoSelected) {
          hasAutoSelected = true
          if (nearby.length === 1) {
            setSelectedStation(nearby[0].station)
            setSelectedDistance(nearby[0].distance)
          } else if (nearby.length > 1) {
            setSelectedStation(nearby[0].station)
            setSelectedDistance(nearby[0].distance)
            setShowPicker(true)
          } else {
            setShowPicker(true)
          }
        } else if (nearby.length > 0) {
          // Update distance for currently selected station
          setNearbyStations(nearby)
          setSelectedDistance((prev) => {
            const match = nearby.find((n) => n.station.id === selectedStation?.id)
            return match ? match.distance : prev
          })
        }
      },
      () => {
        setShowPicker(true)
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectStation = (station: Station, distance: number | null) => {
    setSelectedStation(station)
    setSelectedDistance(distance)
    setShowPicker(false)
  }

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
        setLastLogged(`${time} → ${direction}`)
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

      <div className="clock">
        <span className="clock-time">{hh}:{mm}:{ss}</span>
        <span className="clock-date">{currentDate}</span>
      </div>

      {error && <p className="error">{error}</p>}

      {/* Station selection */}
      {showPicker && (
        <div className="station-picker">
          {nearbyStations.length > 0 && (
            <div className="nearby-stations">
              <h3>Nearby Stations</h3>
              {nearbyStations.map(({ station: s, distance }) => (
                <button
                  key={s.id}
                  className={`station-option ${selectedStation?.id === s.id ? 'selected' : ''}`}
                  onClick={() => selectStation(s, distance)}
                >
                  {s.name}
                  <span className="line-tag">{getLine(s.line)?.name}</span>
                  <span className="distance-tag">{formatDistance(distance)}</span>
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
                    onClick={() => selectStation(s, null)}
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
            {selectedDistance != null && (
              <span className="distance-tag">{formatDistance(selectedDistance)}</span>
            )}
            <span className="change-link">Change</span>
          </div>

          {/* Predictions and logging for each direction */}
          {line?.directions.map((dir) => {
            const predictions = getPredictions(dir.id)
            const currentMinutes = now.getHours() * 60 + now.getMinutes()
            const tagged = predictions.map((time) => {
              const [h, m] = time.split(':').map(Number)
              const mins = h * 60 + m
              return { time, past: mins < currentMinutes }
            })
            const lastPast = tagged.filter((t) => t.past).at(-1)
            const upcoming = tagged.filter((t) => !t.past)
            const visible = [
              ...(lastPast ? [{ ...lastPast, status: 'past' as const }] : []),
              ...upcoming.map((t) => ({ ...t, status: 'upcoming' as const })),
            ]
            return (
              <div key={dir.id} className="direction-section">
                <h3>→ {dir.label}</h3>
                <div className="predictions">
                  {visible.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem' }}>
                      {visible.map((t, i) => {
                        const isNext = t.status === 'upcoming' && !visible.slice(0, i).some((v) => v.status === 'upcoming')
                        const cls = t.status === 'past' ? 'prediction-past' : isNext ? 'prediction-next' : 'prediction-later'
                        return (
                          <span key={t.time}>
                            <div className={cls}>{t.time}</div>
                          </span>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="no-data">{predictions.length > 0 ? 'No more trains this window' : 'No data yet'}</p>
                  )}
                </div>
                <button
                  className="log-btn"
                  disabled={logging}
                  onClick={() => handleLog(dir.id)}
                >
                  {logging ? 'Saving...' : `Log ${hh}:${mm} → ${dir.label}`}
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
