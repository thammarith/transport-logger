import { useState, useEffect, useRef, useCallback } from 'react'
import { stations } from '../data/stations'
import { lines } from '../data/lines'
import type { LineId } from '../types'

// --- Station name matching ---

// Build lookup of English station names for the route
function buildStationKeywords(routeStations: { id: string; name: string }[]) {
  return routeStations.map((s) => ({
    id: s.id,
    name: s.name,
    // lowercase words >= 3 chars for fuzzy matching against transcript
    keywords: s.name.toLowerCase().split(/\s+/).filter((w) => w.length >= 3),
  }))
}

function matchStationInText(
  text: string,
  stationKeywords: ReturnType<typeof buildStationKeywords>,
): { id: string; name: string } | null {
  const lower = text.toLowerCase()
  // Try longest name first to avoid partial matches
  for (const s of [...stationKeywords].sort((a, b) => b.name.length - a.name.length)) {
    // Full name match
    if (lower.includes(s.name.toLowerCase())) return s
    // Keyword match — if any keyword of 4+ chars matches
    for (const kw of s.keywords) {
      if (kw.length >= 4 && lower.includes(kw)) return s
    }
  }
  return null
}

// --- Door chime detection ---
// MRT/BTS door chimes are typically a repeated tone in the 800-2500 Hz range.
// We detect sustained energy spikes in that band above background noise.

const CHIME_LOW_HZ = 800
const CHIME_HIGH_HZ = 2500
const CHIME_THRESHOLD_DB = -35  // dBFS — tune based on real data
const CHIME_MIN_DURATION_MS = 500  // tone must persist for at least this long

// --- Helpers ---

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

// --- Types ---

interface EventLogEntry {
  time: string
  source: 'speech' | 'chime'
  detail: string
}

// --- Component ---

export function StopDetectorPoC() {
  const [selectedLine, setSelectedLine] = useState<LineId>('mrt_blue')
  const [originId, setOriginId] = useState('')
  const [destinationId, setDestinationId] = useState('')
  const [running, setRunning] = useState(false)
  const [routeStations, setRouteStations] = useState<ReturnType<typeof getStationsOnRoute>>([])

  // Speech recognition state
  const [transcript, setTranscript] = useState('')
  const [speechMatches, setSpeechMatches] = useState<string[]>([])
  const [speechError, setSpeechError] = useState<string | null>(null)

  // Door chime state
  const [chimeLevel, setChimeLevel] = useState(-100) // dBFS in target band
  const [chimeDetected, setChimeDetected] = useState(false)
  const [chimeCount, setChimeCount] = useState(0)

  // Combined event log
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([])

  // Refs
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const stationKeywordsRef = useRef<ReturnType<typeof buildStationKeywords>>([])
  const chimeStartRef = useRef(0)
  const chimeActiveRef = useRef(false)
  const matchedStationsRef = useRef(new Set<string>())
  const logRef = useRef<HTMLDivElement>(null)

  const lineStations = stations.filter((s) => s.line === selectedLine)

  const addEvent = useCallback((source: 'speech' | 'chime', detail: string) => {
    setEventLog((prev) => [...prev, { time: formatTime(new Date()), source, detail }])
  }, [])

  // --- Speech Recognition ---

  const startSpeechRecognition = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSpeechError('SpeechRecognition not supported in this browser')
      return
    }

    const recognition: SpeechRecognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'  // English announcements more likely to be recognised

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let fullTranscript = ''
      for (let i = 0; i < event.results.length; i++) {
        fullTranscript += event.results[i][0].transcript
      }
      setTranscript(fullTranscript)

      // Check latest result for station name matches
      const latest = event.results[event.results.length - 1][0].transcript
      const match = matchStationInText(latest, stationKeywordsRef.current)
      if (match && !matchedStationsRef.current.has(match.id)) {
        matchedStationsRef.current.add(match.id)
        setSpeechMatches((prev) => [...prev, match.id])
        addEvent('speech', `Matched: "${match.name}" from "${latest.trim()}"`)
      }
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') return // normal, just restart
      setSpeechError(`Speech error: ${event.error}`)
      addEvent('speech', `Error: ${event.error}`)
    }

    recognition.onend = () => {
      // Auto-restart — SpeechRecognition stops after silence
      if (recognitionRef.current) {
        try {
          recognition.start()
        } catch {
          // Already started
        }
      }
    }

    recognition.start()
    recognitionRef.current = recognition
    addEvent('speech', 'Started listening (en-US)')
  }, [addEvent])

  // --- Door Chime Detection ---

  const startChimeDetection = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx

      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.3
      source.connect(analyser)
      analyserRef.current = analyser

      const sampleRate = audioCtx.sampleRate
      const binSize = sampleRate / analyser.fftSize
      const lowBin = Math.floor(CHIME_LOW_HZ / binSize)
      const highBin = Math.ceil(CHIME_HIGH_HZ / binSize)

      const freqData = new Float32Array(analyser.frequencyBinCount)

      const tick = () => {
        analyser.getFloatFrequencyData(freqData)

        // Average dBFS in the target frequency band
        let sum = 0
        let count = 0
        for (let i = lowBin; i <= highBin && i < freqData.length; i++) {
          sum += freqData[i]
          count++
        }
        const avgDb = count > 0 ? sum / count : -100

        setChimeLevel(avgDb)

        const now = Date.now()
        if (avgDb > CHIME_THRESHOLD_DB) {
          if (!chimeActiveRef.current) {
            chimeStartRef.current = now
            chimeActiveRef.current = true
          } else if (now - chimeStartRef.current >= CHIME_MIN_DURATION_MS) {
            setChimeDetected(true)
            setChimeCount((prev) => {
              const next = prev + 1
              addEvent('chime', `Chime #${next} — avg ${avgDb.toFixed(1)} dBFS`)
              return next
            })
            // Reset — require a gap before next detection
            chimeActiveRef.current = false
            setTimeout(() => setChimeDetected(false), 2000)
          }
        } else {
          chimeActiveRef.current = false
        }

        rafRef.current = requestAnimationFrame(tick)
      }

      rafRef.current = requestAnimationFrame(tick)
      addEvent('chime', `Started — monitoring ${CHIME_LOW_HZ}-${CHIME_HIGH_HZ} Hz > ${CHIME_THRESHOLD_DB} dBFS`)
    } catch (err) {
      addEvent('chime', `Microphone error: ${(err as Error).message}`)
    }
  }, [addEvent])

  // --- Start / Stop ---

  const handleStart = useCallback(async () => {
    if (!originId || !destinationId || originId === destinationId) return

    const route = getStationsOnRoute(selectedLine, originId, destinationId)
    setRouteStations(route)
    stationKeywordsRef.current = buildStationKeywords(route)
    matchedStationsRef.current = new Set()

    setEventLog([])
    setTranscript('')
    setSpeechMatches([])
    setSpeechError(null)
    setChimeLevel(-100)
    setChimeDetected(false)
    setChimeCount(0)
    setRunning(true)

    startSpeechRecognition()
    await startChimeDetection()
  }, [originId, destinationId, selectedLine, startSpeechRecognition, startChimeDetection])

  const handleStop = useCallback(() => {
    if (recognitionRef.current) {
      const r = recognitionRef.current
      recognitionRef.current = null
      r.stop()
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close()
      audioCtxRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setRunning(false)
  }, [])

  // Auto-scroll event log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [eventLog])

  // Wake lock — keep screen on while running
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!running) return
    let released = false

    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          addEvent('speech', 'Wake lock acquired — screen will stay on')
        }
      } catch {
        // Wake lock not available or denied — not critical
      }
    }

    acquire()

    // Re-acquire on visibility change (iOS releases it when switching tabs)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !released) {
        acquire()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', handleVisibility)
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
        wakeLockRef.current = null
      }
    }
  }, [running, addEvent])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
        recognitionRef.current = null
      }
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (audioCtxRef.current) audioCtxRef.current.close()
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="poc-detector">
      <h3>Audio Detector PoC</h3>
      <p className="poc-subtitle">Tests speech recognition + door chime detection side by side</p>

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
          {/* --- Speech Recognition --- */}
          <div className="poc-panel">
            <h4>Speech Recognition</h4>
            {speechError && <p className="poc-error">{speechError}</p>}
            <div className="poc-transcript">{transcript || '(listening...)'}</div>
            <div className="poc-metric">
              Stations matched: <strong>{speechMatches.length}</strong> / {routeStations.length}
            </div>
          </div>

          {/* --- Door Chime Detection --- */}
          <div className="poc-panel">
            <h4>Door Chime Detection</h4>
            <div className="poc-meter">
              <div className="poc-meter-label">
                {CHIME_LOW_HZ}-{CHIME_HIGH_HZ} Hz level:
              </div>
              <div className="poc-meter-bar-bg">
                <div
                  className={`poc-meter-bar ${chimeDetected ? 'poc-meter-chime' : ''}`}
                  style={{ width: `${Math.max(0, Math.min(100, (chimeLevel + 100) * 1.2))}%` }}
                />
              </div>
              <div className="poc-meter-value">{chimeLevel.toFixed(1)} dBFS</div>
            </div>
            <div className="poc-metric">
              Chimes detected: <strong>{chimeCount}</strong>
              {chimeDetected && <span className="poc-chime-flash"> CHIME!</span>}
            </div>
          </div>

          {/* --- Route --- */}
          <div className="poc-route">
            <h4>Route</h4>
            {routeStations.map((s, i) => {
              const isOrigin = i === 0
              const speechMatch = speechMatches.includes(s.id)
              return (
                <div key={s.id} className={`poc-station ${isOrigin ? 'poc-origin' : ''} ${speechMatch ? 'poc-detected' : ''}`}>
                  <span className="poc-station-dot" />
                  <span className="poc-station-name">{s.name}</span>
                  {isOrigin && <span className="poc-station-tag">ORIGIN</span>}
                  {speechMatch && <span className="poc-station-tag poc-tag-speech">SPEECH</span>}
                </div>
              )
            })}
          </div>

          {/* --- Event Log --- */}
          <div className="poc-log-section">
            <h4>Event Log</h4>
            <div className="poc-log" ref={logRef}>
              {eventLog.length === 0 && <div className="poc-log-empty">Waiting for events...</div>}
              {eventLog.map((e, i) => (
                <div key={i} className={`poc-log-entry poc-log-${e.source}`}>
                  <span className="poc-log-time">{e.time}</span>
                  <span className={`poc-log-badge poc-badge-${e.source}`}>{e.source}</span>
                  <span className="poc-log-detail">{e.detail}</span>
                </div>
              ))}
            </div>
          </div>

          <button className="poc-stop-btn" onClick={handleStop}>
            Stop
          </button>
        </div>
      )}
    </div>
  )
}
