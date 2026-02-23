import { useState, useEffect } from 'react'
import type { GitHubConfig } from './types'
import { SetupScreen } from './components/SetupScreen'
import { MainScreen } from './components/MainScreen'
import './App.css'

const STORAGE_KEY = 'transport-logger-config'

function loadConfig(): GitHubConfig | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    return JSON.parse(stored)
  } catch {
    return null
  }
}

function saveConfig(config: GitHubConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

function clearConfig() {
  localStorage.removeItem(STORAGE_KEY)
}

export default function App() {
  const [config, setConfig] = useState<GitHubConfig | null>(null)

  useEffect(() => {
    setConfig(loadConfig())
  }, [])

  const handleSave = (newConfig: GitHubConfig) => {
    saveConfig(newConfig)
    setConfig(newConfig)
  }

  const handleLogout = () => {
    clearConfig()
    setConfig(null)
  }

  if (!config) {
    return <SetupScreen onSave={handleSave} />
  }

  return <MainScreen config={config} onLogout={handleLogout} />
}
