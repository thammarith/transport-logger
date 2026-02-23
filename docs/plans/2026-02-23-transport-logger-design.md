# Transport Logger Design

## Purpose

A mobile-first web app for logging Bangkok train arrival times and predicting upcoming arrivals based on historical data. Single user, multiple devices.

## Architecture

Static React SPA hosted on GitHub Pages. No backend server. Data stored as a JSON file in the GitHub repo, read/written via the GitHub Contents API.

## Tech Stack

- React 19 + TypeScript + Vite (already set up)
- No additional dependencies — `fetch` for GitHub API, `navigator.geolocation` for GPS
- CSS, mobile-first
- GitHub Pages deployment (already configured)

## Data Model

Single JSON file at `data/logs.json` in the repo:

```json
[
  {
    "station": "sirindhorn",
    "line": "mrt_blue",
    "direction": "tha_phra",
    "time": "08:09",
    "dayType": "workday",
    "date": "2026-02-23"
  }
]
```

Three `dayType` values:
- `workday` — Mon-Fri, non-holiday
- `weekend` — Sat-Sun, non-holiday
- `holiday` — any day with the holiday toggle on

## Station Data

Hardcoded JSON with all stations for four Bangkok rail lines. Each station has: id, name (English), line, latitude, longitude.

Direction labels use terminal station names:

| Line | Direction A | Direction B |
|------|-------------|-------------|
| MRT Blue | Tha Phra | Lak Song |
| BTS Sukhumvit | Khu Khot | Kheha |
| BTS Silom | National Stadium | Bang Wa |
| ARL | Phaya Thai | Suvarnabhumi |

## Screens and Flow

### 1. Setup Screen (first visit only)

- Asks for GitHub Personal Access Token and repo owner/name
- Stored in localStorage
- Shows again if token is missing or invalid

### 2. Main Screen

On load:
1. Request GPS location
2. Find nearest Bangkok rail station from hardcoded data
3. If multiple stations nearby or GPS unavailable, show station picker grouped by line
4. Auto-detect day type (workday/weekend) with a holiday toggle override
5. Display prediction and logging UI

#### Prediction Section

For the selected station + direction + current day type:
- Show predicted arrival times for the current hour and next hour
- Derived from aggregated historical logs
- If insufficient data: "Not enough data yet — keep logging!"

#### Logging Section

- Two direction buttons labelled with terminal station names (e.g. "-> Tha Phra" / "-> Lak Song")
- On tap: log current time rounded down to the nearest minute
- Holiday toggle (defaults off; when on, logs are tagged `holiday`)

## Prediction Logic

For a given station + direction + dayType:
1. Collect all logged times matching those filters
2. For the current hour and next hour, find all recorded arrival minutes
3. Cluster nearby times and pick representative times
4. Display sorted: "Trains expected at 08:03, 08:12, 08:19, 08:27..."
5. Needs a minimum threshold of data points before showing predictions

## GitHub Storage Mechanics

- **Read**: `GET /repos/{owner}/{repo}/contents/data/logs.json` — decode base64, parse JSON
- **Write**: Append new entry, encode, `PUT` with the file's current SHA (optimistic concurrency)
- On SHA mismatch (rare): re-fetch, merge, retry once
- Token needs `repo` scope or fine-grained Contents read/write permission

## Out of Scope

- User authentication beyond the GitHub token
- Offline support / service worker
- Data export/import
- Historical analytics or charts
- Multi-user support
