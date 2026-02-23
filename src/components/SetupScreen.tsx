import { useState } from 'react'
import type { GitHubConfig } from '../types'

interface SetupScreenProps {
  onSave: (config: GitHubConfig) => void
}

export function SetupScreen({ onSave }: SetupScreenProps) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) {
      setError('Token is required')
      return
    }
    onSave({ token: token.trim() })
  }

  return (
    <div className="setup-screen">
      <h1>Transport Logger</h1>
      <p>Enter your GitHub Personal Access Token to store train arrival logs.</p>
      <form onSubmit={handleSubmit}>
        <label>
          GitHub Personal Access Token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_..."
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Save</button>
      </form>
    </div>
  )
}
