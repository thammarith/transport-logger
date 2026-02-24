import { useState, useEffect, useRef, useCallback } from 'react'
import { stations } from '../data/stations'
import { lines } from '../data/lines'
import type { LineId } from '../types'

interface DetectedStop {
  index: number
  stationName: string
  time: string
}

type MotionState = 'idle' | 'moving' | 'stopped'

const WINDOW_SIZE = 60       // ~3 seconds at 20Hz
const STOP_THRESHOLD = 0.3   // variance below this = stopped
const MOVE_THRESHOLD = 0.5   // variance above this = moving
const MIN_STOP_DURATION = 8  // samples (~0.4s) to confirm a stop
const MIN_MOVE_DURATION = 10 // samples (~0.5s) to confirm moving again
const MIN_STOP_MS = 15000    // stop must last >=15s to count as a station
const MIN_GAP_MS = 60000     // ignore stops within 60s of the last confirmed stop

function getStationsOnRoute(lineId: LineId, originId: string, destinationId: string) {
  const lineStations = stations.filter((s) => s.line === lineId)
  const originIdx = lineStations.findIndex((s) => s.id === originId)
  const destIdx = lineStations.findIndex((s) => s.id === destinationId)
  if (originIdx === -1 || destIdx === -1) return []
  if (originIdx < destIdx) {
    return lineStations.slice(originIdx, destIdx + 1)
  }
  return lineStations.slice(destIdx, originIdx + 1).reverse()
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

export function StopDetectorPoC() {
  const [selectedLine, setSelectedLine] = useState<LineId>('mrt_blue')
  const [originId, setOriginId] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [running, setRunning] = useState(false)
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null)
  const [motionState, setMotionState] = useState<MotionState>('idle')
  const [variance, setVariance] = useState(0)
  const [detectedStops, setDetectedStops] = useState<DetectedStop[]>([])
  const [routeStations, setRouteStations] = useState<ReturnType<typeof getStationsOnRoute>>([])
  const [sampleRate, setSampleRate] = useState(0)
  const [ignoredStops, setIgnoredStops] = useState(0)

  const bufferRef = useRef<number[]>([])
  const stateRef = useRef<MotionState>('idle')
  const stateCounterRef = useRef(0)
  const stopCountRef = useRef(0)
  const routeRef = useRef<ReturnType<typeof getStationsOnRoute>>([])
  const sampleCountRef = useRef(0)
  const lastSampleTimeRef = useRef(0)
  const stopStartTimeRef = useRef(0)       // when the current stop began
  const lastConfirmedStopRef = useRef(0)   // when the last station stop was confirmed
  const pendingStopRef = useRef(false)     // whether we have an unconfirmed stop

  const lineStations = stations.filter((s) => s.line === selectedLine)

  const requestPermission = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DME = DeviceMotionEvent as any
    if (typeof DME.requestPermission === 'function') {
      try {
        const result = await DME.requestPermission()
        setPermissionGranted(result === 'granted')
        return result === 'granted'
      } catch {
        setPermissionGranted(false)
        return false
      }
    }
    setPermissionGranted(true)
    return true
  }, [])

  const handleStart = useCallback(async () => {
    if (!originId || !destinationId || originId === destinationId) return

    const granted = await requestPermission()
    if (!granted) return

    const route = getStationsOnRoute(selectedLine, originId, destinationId)
    setRouteStations(route)
    routeRef.current = route

    bufferRef.current = []
    stateRef.current = 'idle'
    stateCounterRef.current = 0
    stopCountRef.current = 0
    sampleCountRef.current = 0
    lastSampleTimeRef.current = Date.now()
    stopStartTimeRef.current = 0
    lastConfirmedStopRef.current = 0
    pendingStopRef.current = false

    setDetectedStops([])
    setIgnoredStops(0)
    setMotionState('idle')
    setVariance(0)
    setRunning(true)
  }, [originId, destinationId, selectedLine, requestPermission])

  const handleStop = useCallback(() => {
    setRunning(false)
    setMotionState('idle')
  }, [])

  useEffect(() => {
    if (!running) return

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return

      const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2)
      const buffer = bufferRef.current
      buffer.push(magnitude)

      // Track sample rate
      sampleCountRef.current++
      const now = Date.now()
      if (now - lastSampleTimeRef.current >= 1000) {
        setSampleRate(sampleCountRef.current)
        sampleCountRef.current = 0
        lastSampleTimeRef.current = now
      }

      if (buffer.length > WINDOW_SIZE) {
        buffer.shift()
      }

      if (buffer.length < WINDOW_SIZE) return

      // Compute variance of magnitudes in the window
      const mean = buffer.reduce((a, b) => a + b, 0) / buffer.length
      const v = buffer.reduce((a, b) => a + (b - mean) ** 2, 0) / buffer.length

      setVariance(v)

      const prevState = stateRef.current

      const confirmStop = () => {
        const stopTime = stopStartTimeRef.current
        const duration = now - stopTime
        const gap = stopTime - lastConfirmedStopRef.current

        if (duration >= MIN_STOP_MS && (lastConfirmedStopRef.current === 0 || gap >= MIN_GAP_MS)) {
          stopCountRef.current++
          lastConfirmedStopRef.current = now
          pendingStopRef.current = false

          const stopIdx = stopCountRef.current
          const route = routeRef.current
          const stationName = stopIdx < route.length
            ? route[stopIdx].name
            : `Stop #${stopIdx + 1} (beyond route)`

          setDetectedStops((prev) => [
            ...prev,
            { index: stopIdx, stationName, time: formatTime(new Date(stopTime)) },
          ])
        } else {
          setIgnoredStops((prev) => prev + 1)
        }
        pendingStopRef.current = false
      }

      if (v < STOP_THRESHOLD) {
        if (prevState !== 'stopped') {
          stateCounterRef.current++
          if (stateCounterRef.current >= MIN_STOP_DURATION) {
            stateRef.current = 'stopped'
            stateCounterRef.current = 0
            setMotionState('stopped')
            if (prevState === 'moving') {
              stopStartTimeRef.current = now
              pendingStopRef.current = true
            }
          }
        } else {
          stateCounterRef.current = 0
          // While still stopped, check if pending stop has met duration threshold
          if (pendingStopRef.current && now - stopStartTimeRef.current >= MIN_STOP_MS) {
            confirmStop()
          }
        }
      } else if (v > MOVE_THRESHOLD) {
        if (prevState !== 'moving') {
          stateCounterRef.current++
          if (stateCounterRef.current >= MIN_MOVE_DURATION) {
            // Leaving a stop — confirm or discard the pending stop
            if (pendingStopRef.current) {
              confirmStop()
            }
            stateRef.current = 'moving'
            stateCounterRef.current = 0
            setMotionState('moving')
          }
        } else {
          stateCounterRef.current = 0
        }
      }
    }

    window.addEventListener('devicemotion', handleMotion)
    return () => window.removeEventListener('devicemotion', handleMotion)
  }, [running])

  return (
    <div className="poc-detector">
      <h3>Stop Detector PoC</h3>

      {permissionGranted === false && (
        <p className="error">Motion sensor permission denied. Allow it in your browser settings.</p>
      )}

      {!running ? (
        <div className="poc-setup">
          <label>
            Line
            <select value={selectedLine} onChange={(e) => {
              setSelectedLine(e.target.value as LineId)
              setOriginId('')
              setDestinationId('')
            }}>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>

          <label>
            Origin
            <select value={originId} onChange={(e) => setOriginId(e.target.value)}>
              <option value="">Select...</option>
              {lineStations.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label>
            Destination
            <select value={destinationId} onChange={(e) => setDestinationId(e.target.value)}>
              <option value="">Select...</option>
              {lineStations.filter((s) => s.id !== originId).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <button
            className="log-btn"
            disabled={!originId || !destinationId}
            onClick={handleStart}
          >
            Start Journey
          </button>
        </div>
      ) : (
        <div className="poc-live">
          <div className="poc-status">
            <div className="poc-state-row">
              <span>State: </span>
              <span className={`poc-state poc-state-${motionState}`}>
                {motionState.toUpperCase()}
              </span>
            </div>
            <div className="poc-metric">
              Variance: <strong>{variance.toFixed(3)}</strong>
            </div>
            <div className="poc-metric">
              Sample rate: <strong>{sampleRate} Hz</strong>
            </div>
            <div className="poc-metric">
              Stops detected: <strong>{detectedStops.length}</strong> / {routeStations.length - 1} expected
            </div>
            {ignoredStops > 0 && (
              <div className="poc-metric">
                Stops ignored (too short/too soon): <strong>{ignoredStops}</strong>
              </div>
            )}
          </div>

          <div className="poc-route">
            <h4>Route</h4>
            {routeStations.map((s, i) => {
              const isOrigin = i === 0
              const detected = detectedStops.find((d) => d.index === i)
              const isNext = !isOrigin && !detected && detectedStops.length === i - 1
              return (
                <div key={s.id} className={`poc-station ${isOrigin ? 'poc-origin' : ''} ${detected ? 'poc-detected' : ''} ${isNext ? 'poc-next' : ''}`}>
                  <span className="poc-station-dot" />
                  <span className="poc-station-name">{s.name}</span>
                  {isOrigin && <span className="poc-station-tag">ORIGIN</span>}
                  {detected && <span className="poc-station-time">{detected.time}</span>}
                  {isNext && <span className="poc-station-tag poc-tag-next">NEXT</span>}
                </div>
              )
            })}
          </div>

          <button className="poc-stop-btn" onClick={handleStop}>
            Stop
          </button>
        </div>
      )}
    </div>
  )
}
