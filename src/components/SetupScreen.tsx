import { useState } from 'react'
import type { GitHubConfig } from '../types'

interface SetupScreenProps {
  onSave: (config: GitHubConfig) => void
}

export function SetupScreen({ onSave }: SetupScreenProps) {
  const [token, setToken] = useState('')
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim() || !owner.trim() || !repo.trim()) {
      setError('All fields are required')
      return
    }
    onSave({ token: token.trim(), owner: owner.trim(), repo: repo.trim() })
  }

  return (
    <div className="setup-screen">
      <h1>Transport Logger</h1>
      <p>Enter your GitHub details to store train arrival logs.</p>
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
        <label>
          Repository Owner
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="your-username"
          />
        </label>
        <label>
          Repository Name
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="transport-logger"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Save</button>
      </form>
    </div>
  )
}
