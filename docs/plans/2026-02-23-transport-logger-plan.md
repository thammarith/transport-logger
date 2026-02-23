# Transport Logger Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a mobile-first web app that logs Bangkok train arrival times and predicts upcoming arrivals from historical data, stored in a GitHub repo as JSON.

**Architecture:** Static React SPA on GitHub Pages. No backend. Data persisted as `data/logs.json` in the GitHub repo via the GitHub Contents API. GPS used to find nearest station. Predictions computed client-side by clustering historical logs.

**Tech Stack:** React 19, TypeScript, Vite, Vitest for testing, CSS (no UI library), GitHub Contents API, Geolocation API.

---

### Task 1: Set up testing infrastructure

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.app.json`
- Create: `src/test/setup.ts`

**Step 1: Install test dependencies**

Run:
```bash
pnpm add -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

**Step 2: Configure Vitest in vite.config.ts**

Replace `vite.config.ts` with:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/transport-logger/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
```

**Step 3: Create test setup file**

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

**Step 4: Add vitest types to tsconfig**

In `tsconfig.app.json`, add `"vitest/globals"` to the `types` array:

```json
"types": ["vite/client", "vitest/globals"]
```

**Step 5: Add test script to package.json**

Add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 6: Verify setup with a smoke test**

Create `src/smoke.test.ts`:

```ts
describe('smoke test', () => {
  it('works', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `pnpm test`
Expected: PASS

**Step 7: Remove smoke test and commit**

Delete `src/smoke.test.ts`.

```bash
git add -A && git commit -m "chore: set up vitest testing infrastructure"
```

---

### Task 2: Define TypeScript types

**Files:**
- Create: `src/types.ts`

**Step 1: Create types file**

Create `src/types.ts`:

```ts
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
  owner: string
  repo: string
}
```

**Step 2: Commit**

```bash
git add src/types.ts && git commit -m "feat: add TypeScript type definitions"
```

---

### Task 3: Create station and line data

**Files:**
- Create: `src/data/lines.ts`
- Create: `src/data/stations.ts`
- Create: `src/data/stations.test.ts`

**Step 1: Create line definitions**

Create `src/data/lines.ts`:

```ts
import type { Line } from '../types'

export const lines: Line[] = [
  {
    id: 'mrt_blue',
    name: 'MRT Blue',
    directions: [
      { id: 'tha_phra', label: 'Tha Phra' },
      { id: 'lak_song', label: 'Lak Song' },
    ],
  },
  {
    id: 'bts_sukhumvit',
    name: 'BTS Sukhumvit',
    directions: [
      { id: 'khu_khot', label: 'Khu Khot' },
      { id: 'kheha', label: 'Kheha' },
    ],
  },
  {
    id: 'bts_silom',
    name: 'BTS Silom',
    directions: [
      { id: 'national_stadium', label: 'National Stadium' },
      { id: 'bang_wa', label: 'Bang Wa' },
    ],
  },
  {
    id: 'arl',
    name: 'Airport Rail Link',
    directions: [
      { id: 'phaya_thai', label: 'Phaya Thai' },
      { id: 'suvarnabhumi', label: 'Suvarnabhumi' },
    ],
  },
]

export function getLine(lineId: string): Line | undefined {
  return lines.find((l) => l.id === lineId)
}
```

**Step 2: Create station data**

Create `src/data/stations.ts`. This file contains all Bangkok rail stations with approximate coordinates. Coordinates are approximate (within ~200m) — sufficient for nearest-station detection since stations are typically 1km+ apart.

```ts
import type { Station } from '../types'

export const stations: Station[] = [
  // === MRT Blue Line ===
  // Lak Song end → loop → Tha Phra end
  { id: 'mrt_lak_song', name: 'Lak Song', line: 'mrt_blue', lat: 13.7210, lng: 100.3940 },
  { id: 'mrt_phetkasem_48', name: 'Phetkasem 48', line: 'mrt_blue', lat: 13.7160, lng: 100.4090 },
  { id: 'mrt_bang_wa', name: 'Bang Wa', line: 'mrt_blue', lat: 13.7210, lng: 100.4130 },
  { id: 'mrt_tha_phra', name: 'Tha Phra', line: 'mrt_blue', lat: 13.7230, lng: 100.4370 },
  { id: 'mrt_itsaraphap', name: 'Itsaraphap', line: 'mrt_blue', lat: 13.7300, lng: 100.4480 },
  { id: 'mrt_sanam_chai', name: 'Sanam Chai', line: 'mrt_blue', lat: 13.7440, lng: 100.4970 },
  { id: 'mrt_sam_yot', name: 'Sam Yot', line: 'mrt_blue', lat: 13.7450, lng: 100.5000 },
  { id: 'mrt_wat_mangkon', name: 'Wat Mangkon', line: 'mrt_blue', lat: 13.7420, lng: 100.5100 },
  { id: 'mrt_hua_lamphong', name: 'Hua Lamphong', line: 'mrt_blue', lat: 13.7380, lng: 100.5172 },
  { id: 'mrt_sam_yan', name: 'Sam Yan', line: 'mrt_blue', lat: 13.7320, lng: 100.5290 },
  { id: 'mrt_silom', name: 'Silom', line: 'mrt_blue', lat: 13.7290, lng: 100.5360 },
  { id: 'mrt_lumphini', name: 'Lumphini', line: 'mrt_blue', lat: 13.7260, lng: 100.5460 },
  { id: 'mrt_khlong_toei', name: 'Khlong Toei', line: 'mrt_blue', lat: 13.7220, lng: 100.5540 },
  { id: 'mrt_queen_sirikit', name: 'Queen Sirikit National Convention Centre', line: 'mrt_blue', lat: 13.7230, lng: 100.5600 },
  { id: 'mrt_sukhumvit', name: 'Sukhumvit', line: 'mrt_blue', lat: 13.7367, lng: 100.5604 },
  { id: 'mrt_phetchaburi', name: 'Phetchaburi', line: 'mrt_blue', lat: 13.7480, lng: 100.5640 },
  { id: 'mrt_phra_ram_9', name: 'Phra Ram 9', line: 'mrt_blue', lat: 13.7570, lng: 100.5650 },
  { id: 'mrt_thailand_cultural_centre', name: 'Thailand Cultural Centre', line: 'mrt_blue', lat: 13.7650, lng: 100.5700 },
  { id: 'mrt_huai_khwang', name: 'Huai Khwang', line: 'mrt_blue', lat: 13.7780, lng: 100.5740 },
  { id: 'mrt_sutthisan', name: 'Sutthisan', line: 'mrt_blue', lat: 13.7880, lng: 100.5740 },
  { id: 'mrt_ratchadaphisek', name: 'Ratchadaphisek', line: 'mrt_blue', lat: 13.7930, lng: 100.5740 },
  { id: 'mrt_lat_phrao', name: 'Lat Phrao', line: 'mrt_blue', lat: 13.8060, lng: 100.5730 },
  { id: 'mrt_phahon_yothin', name: 'Phahon Yothin', line: 'mrt_blue', lat: 13.8120, lng: 100.5610 },
  { id: 'mrt_chatuchak_park', name: 'Chatuchak Park', line: 'mrt_blue', lat: 13.8024, lng: 100.5538 },
  { id: 'mrt_kamphaeng_phet', name: 'Kamphaeng Phet', line: 'mrt_blue', lat: 13.7990, lng: 100.5510 },
  { id: 'mrt_bang_sue', name: 'Bang Sue', line: 'mrt_blue', lat: 13.8060, lng: 100.5400 },
  { id: 'mrt_tao_poon', name: 'Tao Poon', line: 'mrt_blue', lat: 13.8060, lng: 100.5310 },
  { id: 'mrt_bang_pho', name: 'Bang Pho', line: 'mrt_blue', lat: 13.8060, lng: 100.5170 },
  { id: 'mrt_bang_o', name: 'Bang O', line: 'mrt_blue', lat: 13.7960, lng: 100.4990 },
  { id: 'mrt_bang_phlat', name: 'Bang Phlat', line: 'mrt_blue', lat: 13.7880, lng: 100.4850 },
  { id: 'mrt_sirindhorn', name: 'Sirindhorn', line: 'mrt_blue', lat: 13.7780, lng: 100.4660 },
  { id: 'mrt_bang_yi_khan', name: 'Bang Yi Khan', line: 'mrt_blue', lat: 13.7700, lng: 100.4560 },
  { id: 'mrt_bang_khun_non', name: 'Bang Khun Non', line: 'mrt_blue', lat: 13.7600, lng: 100.4500 },
  { id: 'mrt_fai_chai', name: 'Fai Chai', line: 'mrt_blue', lat: 13.7460, lng: 100.4440 },
  { id: 'mrt_charan_13', name: 'Charan 13', line: 'mrt_blue', lat: 13.7350, lng: 100.4400 },

  // === BTS Sukhumvit Line ===
  // Khu Khot (north) → Kheha (south)
  { id: 'bts_khu_khot', name: 'Khu Khot', line: 'bts_sukhumvit', lat: 13.9280, lng: 100.6130 },
  { id: 'bts_royal_thai_air_force_museum', name: 'Royal Thai Air Force Museum', line: 'bts_sukhumvit', lat: 13.9180, lng: 100.6210 },
  { id: 'bts_yaek_kor_por_or', name: 'Yaek Kor Por Or', line: 'bts_sukhumvit', lat: 13.9080, lng: 100.6170 },
  { id: 'bts_phahon_yothin_59', name: 'Phahon Yothin 59', line: 'bts_sukhumvit', lat: 13.8960, lng: 100.6050 },
  { id: 'bts_sai_luat', name: 'Sai Luat', line: 'bts_sukhumvit', lat: 13.8880, lng: 100.5970 },
  { id: 'bts_saphan_mai', name: 'Saphan Mai', line: 'bts_sukhumvit', lat: 13.8780, lng: 100.5930 },
  { id: 'bts_bamphen', name: 'Bamphen', line: 'bts_sukhumvit', lat: 13.8690, lng: 100.5890 },
  { id: 'bts_kasetsart', name: 'Kasetsart University', line: 'bts_sukhumvit', lat: 13.8570, lng: 100.5800 },
  { id: 'bts_royal_forest_dept', name: 'Royal Forest Department', line: 'bts_sukhumvit', lat: 13.8500, lng: 100.5750 },
  { id: 'bts_bang_bua', name: 'Bang Bua', line: 'bts_sukhumvit', lat: 13.8410, lng: 100.5690 },
  { id: 'bts_11th_infantry', name: '11th Infantry Regiment', line: 'bts_sukhumvit', lat: 13.8310, lng: 100.5650 },
  { id: 'bts_mo_chit', name: 'Mo Chit', line: 'bts_sukhumvit', lat: 13.8030, lng: 100.5535 },
  { id: 'bts_saphan_khwai', name: 'Saphan Khwai', line: 'bts_sukhumvit', lat: 13.7937, lng: 100.5490 },
  { id: 'bts_ari', name: 'Ari', line: 'bts_sukhumvit', lat: 13.7797, lng: 100.5445 },
  { id: 'bts_sanam_pao', name: 'Sanam Pao', line: 'bts_sukhumvit', lat: 13.7727, lng: 100.5420 },
  { id: 'bts_victory_monument', name: 'Victory Monument', line: 'bts_sukhumvit', lat: 13.7627, lng: 100.5347 },
  { id: 'bts_phaya_thai', name: 'Phaya Thai', line: 'bts_sukhumvit', lat: 13.7570, lng: 100.5350 },
  { id: 'bts_ratchathewi', name: 'Ratchathewi', line: 'bts_sukhumvit', lat: 13.7513, lng: 100.5340 },
  { id: 'bts_siam', name: 'Siam', line: 'bts_sukhumvit', lat: 13.7454, lng: 100.5340 },
  { id: 'bts_chit_lom', name: 'Chit Lom', line: 'bts_sukhumvit', lat: 13.7440, lng: 100.5430 },
  { id: 'bts_ploen_chit', name: 'Ploen Chit', line: 'bts_sukhumvit', lat: 13.7430, lng: 100.5490 },
  { id: 'bts_nana', name: 'Nana', line: 'bts_sukhumvit', lat: 13.7400, lng: 100.5550 },
  { id: 'bts_asok', name: 'Asok', line: 'bts_sukhumvit', lat: 13.7367, lng: 100.5604 },
  { id: 'bts_phrom_phong', name: 'Phrom Phong', line: 'bts_sukhumvit', lat: 13.7310, lng: 100.5690 },
  { id: 'bts_thong_lo', name: 'Thong Lo', line: 'bts_sukhumvit', lat: 13.7240, lng: 100.5780 },
  { id: 'bts_ekkamai', name: 'Ekkamai', line: 'bts_sukhumvit', lat: 13.7190, lng: 100.5850 },
  { id: 'bts_phra_khanong', name: 'Phra Khanong', line: 'bts_sukhumvit', lat: 13.7150, lng: 100.5920 },
  { id: 'bts_on_nut', name: 'On Nut', line: 'bts_sukhumvit', lat: 13.7060, lng: 100.6012 },
  { id: 'bts_bang_chak', name: 'Bang Chak', line: 'bts_sukhumvit', lat: 13.6970, lng: 100.6050 },
  { id: 'bts_punnawithi', name: 'Punnawithi', line: 'bts_sukhumvit', lat: 13.6890, lng: 100.6090 },
  { id: 'bts_udom_suk', name: 'Udom Suk', line: 'bts_sukhumvit', lat: 13.6810, lng: 100.6090 },
  { id: 'bts_bang_na', name: 'Bang Na', line: 'bts_sukhumvit', lat: 13.6690, lng: 100.6050 },
  { id: 'bts_bearing', name: 'Bearing', line: 'bts_sukhumvit', lat: 13.6610, lng: 100.6010 },
  { id: 'bts_samrong', name: 'Samrong', line: 'bts_sukhumvit', lat: 13.6454, lng: 100.6070 },
  { id: 'bts_pu_chao', name: 'Pu Chao', line: 'bts_sukhumvit', lat: 13.6370, lng: 100.6100 },
  { id: 'bts_chang_erawan', name: 'Chang Erawan', line: 'bts_sukhumvit', lat: 13.6280, lng: 100.6120 },
  { id: 'bts_royal_thai_naval_academy', name: 'Royal Thai Naval Academy', line: 'bts_sukhumvit', lat: 13.6200, lng: 100.6090 },
  { id: 'bts_pak_nam', name: 'Pak Nam', line: 'bts_sukhumvit', lat: 13.6100, lng: 100.6050 },
  { id: 'bts_srinagarindra', name: 'Srinagarindra', line: 'bts_sukhumvit', lat: 13.6030, lng: 100.6070 },
  { id: 'bts_phraek_sa', name: 'Phraek Sa', line: 'bts_sukhumvit', lat: 13.5960, lng: 100.6100 },
  { id: 'bts_kheha', name: 'Kheha', line: 'bts_sukhumvit', lat: 13.5900, lng: 100.6130 },

  // === BTS Silom Line ===
  // National Stadium → Bang Wa
  { id: 'bts_national_stadium', name: 'National Stadium', line: 'bts_silom', lat: 13.7463, lng: 100.5290 },
  { id: 'bts_siam_silom', name: 'Siam', line: 'bts_silom', lat: 13.7454, lng: 100.5340 },
  { id: 'bts_ratchadamri', name: 'Ratchadamri', line: 'bts_silom', lat: 13.7400, lng: 100.5390 },
  { id: 'bts_sala_daeng', name: 'Sala Daeng', line: 'bts_silom', lat: 13.7284, lng: 100.5340 },
  { id: 'bts_chong_nonsi', name: 'Chong Nonsi', line: 'bts_silom', lat: 13.7230, lng: 100.5290 },
  { id: 'bts_saint_louis', name: 'Saint Louis', line: 'bts_silom', lat: 13.7200, lng: 100.5240 },
  { id: 'bts_surasak', name: 'Surasak', line: 'bts_silom', lat: 13.7180, lng: 100.5170 },
  { id: 'bts_saphan_taksin', name: 'Saphan Taksin', line: 'bts_silom', lat: 13.7190, lng: 100.5080 },
  { id: 'bts_krung_thon_buri', name: 'Krung Thon Buri', line: 'bts_silom', lat: 13.7200, lng: 100.5020 },
  { id: 'bts_wongwian_yai', name: 'Wongwian Yai', line: 'bts_silom', lat: 13.7210, lng: 100.4940 },
  { id: 'bts_pho_nimit', name: 'Pho Nimit', line: 'bts_silom', lat: 13.7230, lng: 100.4850 },
  { id: 'bts_talat_phlu', name: 'Talat Phlu', line: 'bts_silom', lat: 13.7220, lng: 100.4760 },
  { id: 'bts_wutthakat', name: 'Wutthakat', line: 'bts_silom', lat: 13.7210, lng: 100.4680 },
  { id: 'bts_bang_wa_silom', name: 'Bang Wa', line: 'bts_silom', lat: 13.7210, lng: 100.4570 },

  // === Airport Rail Link ===
  // Phaya Thai → Suvarnabhumi
  { id: 'arl_phaya_thai', name: 'Phaya Thai', line: 'arl', lat: 13.7570, lng: 100.5350 },
  { id: 'arl_ratchaprarop', name: 'Ratchaprarop', line: 'arl', lat: 13.7530, lng: 100.5420 },
  { id: 'arl_makkasan', name: 'Makkasan', line: 'arl', lat: 13.7500, lng: 100.5600 },
  { id: 'arl_ramkhamhaeng', name: 'Ramkhamhaeng', line: 'arl', lat: 13.7580, lng: 100.5890 },
  { id: 'arl_hua_mak', name: 'Hua Mak', line: 'arl', lat: 13.7380, lng: 100.6450 },
  { id: 'arl_ban_thap_chang', name: 'Ban Thap Chang', line: 'arl', lat: 13.7300, lng: 100.6780 },
  { id: 'arl_lat_krabang', name: 'Lat Krabang', line: 'arl', lat: 13.7280, lng: 100.7080 },
  { id: 'arl_suvarnabhumi', name: 'Suvarnabhumi', line: 'arl', lat: 13.6930, lng: 100.7510 },
]
```

**Step 3: Write test for station data integrity**

Create `src/data/stations.test.ts`:

```ts
import { stations } from './stations'
import { lines, getLine } from './lines'

describe('station data', () => {
  it('all stations reference a valid line', () => {
    const lineIds = new Set(lines.map((l) => l.id))
    for (const station of stations) {
      expect(lineIds.has(station.line)).toBe(true)
    }
  })

  it('all station IDs are unique', () => {
    const ids = stations.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all stations have valid coordinates', () => {
    for (const station of stations) {
      expect(station.lat).toBeGreaterThan(13)
      expect(station.lat).toBeLessThan(15)
      expect(station.lng).toBeGreaterThan(99)
      expect(station.lng).toBeLessThan(102)
    }
  })
})

describe('getLine', () => {
  it('returns correct line by id', () => {
    expect(getLine('mrt_blue')?.name).toBe('MRT Blue')
  })

  it('returns undefined for unknown line', () => {
    expect(getLine('unknown')).toBeUndefined()
  })
})
```

**Step 4: Run tests**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/types.ts src/data/ && git commit -m "feat: add types, station data, and line definitions"
```

---

### Task 4: Day type utility (TDD)

**Files:**
- Create: `src/utils/dayType.ts`
- Create: `src/utils/dayType.test.ts`

**Step 1: Write failing tests**

Create `src/utils/dayType.test.ts`:

```ts
import { getDayType } from './dayType'

describe('getDayType', () => {
  it('returns workday for Monday non-holiday', () => {
    // 2026-02-23 is a Monday
    expect(getDayType(new Date('2026-02-23'), false)).toBe('workday')
  })

  it('returns workday for Friday non-holiday', () => {
    // 2026-02-27 is a Friday
    expect(getDayType(new Date('2026-02-27'), false)).toBe('workday')
  })

  it('returns weekend for Saturday', () => {
    // 2026-02-28 is a Saturday
    expect(getDayType(new Date('2026-02-28'), false)).toBe('weekend')
  })

  it('returns weekend for Sunday', () => {
    // 2026-03-01 is a Sunday
    expect(getDayType(new Date('2026-03-01'), false)).toBe('weekend')
  })

  it('returns holiday when holiday toggle is on, regardless of day', () => {
    expect(getDayType(new Date('2026-02-23'), true)).toBe('holiday') // Monday
    expect(getDayType(new Date('2026-02-28'), true)).toBe('holiday') // Saturday
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/utils/dayType.ts`:

```ts
import type { DayType } from '../types'

export function getDayType(date: Date, isHoliday: boolean): DayType {
  if (isHoliday) return 'holiday'
  const day = date.getDay()
  if (day === 0 || day === 6) return 'weekend'
  return 'workday'
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/ && git commit -m "feat: add day type utility"
```

---

### Task 5: Geolocation and nearest station utility (TDD)

**Files:**
- Create: `src/utils/geo.ts`
- Create: `src/utils/geo.test.ts`

**Step 1: Write failing tests**

Create `src/utils/geo.test.ts`:

```ts
import { haversineDistance, findNearbyStations } from './geo'
import type { Station } from '../types'

const testStations: Station[] = [
  { id: 'a', name: 'Station A', line: 'mrt_blue', lat: 13.7780, lng: 100.4660 },
  { id: 'b', name: 'Station B', line: 'mrt_blue', lat: 13.7880, lng: 100.4850 },
  { id: 'c', name: 'Station C', line: 'bts_sukhumvit', lat: 13.9280, lng: 100.6130 },
]

describe('haversineDistance', () => {
  it('returns 0 for same point', () => {
    expect(haversineDistance(13.75, 100.52, 13.75, 100.52)).toBe(0)
  })

  it('returns approximately correct distance between two Bangkok points', () => {
    // Siam to Asok is roughly 2.9km
    const distance = haversineDistance(13.7454, 100.5340, 13.7367, 100.5604)
    expect(distance).toBeGreaterThan(2500)
    expect(distance).toBeLessThan(3500)
  })
})

describe('findNearbyStations', () => {
  it('returns nearest station first', () => {
    // Position near Station A
    const result = findNearbyStations(13.7785, 100.4665, testStations)
    expect(result[0].id).toBe('a')
  })

  it('filters by max distance (default 1500m)', () => {
    // Position near Station A — Station C is far away
    const result = findNearbyStations(13.7785, 100.4665, testStations)
    expect(result.find((s) => s.id === 'c')).toBeUndefined()
  })

  it('returns empty array if no stations nearby', () => {
    const result = findNearbyStations(14.0, 101.0, testStations)
    expect(result).toEqual([])
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL

**Step 3: Write implementation**

Create `src/utils/geo.ts`:

```ts
import type { Station } from '../types'

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000 // Earth's radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function findNearbyStations(
  lat: number,
  lng: number,
  allStations: Station[],
  maxDistanceMetres = 1500,
): Station[] {
  return allStations
    .map((station) => ({
      station,
      distance: haversineDistance(lat, lng, station.lat, station.lng),
    }))
    .filter(({ distance }) => distance <= maxDistanceMetres)
    .sort((a, b) => a.distance - b.distance)
    .map(({ station }) => station)
}
```

**Step 4: Run tests**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/geo.ts src/utils/geo.test.ts && git commit -m "feat: add geolocation and nearest station utilities"
```

---

### Task 6: Prediction logic (TDD)

**Files:**
- Create: `src/utils/prediction.ts`
- Create: `src/utils/prediction.test.ts`

**Step 1: Write failing tests**

Create `src/utils/prediction.test.ts`:

```ts
import { predictArrivals } from './prediction'
import type { LogEntry } from '../types'

const makeLogs = (times: string[]): LogEntry[] =>
  times.map((time) => ({
    station: 'mrt_sirindhorn',
    line: 'mrt_blue' as const,
    direction: 'tha_phra',
    time,
    dayType: 'workday' as const,
    date: '2026-02-20',
  }))

describe('predictArrivals', () => {
  it('returns empty array when no logs match', () => {
    const result = predictArrivals([], 'mrt_sirindhorn', 'tha_phra', 'workday', 8)
    expect(result).toEqual([])
  })

  it('returns sorted unique times for the requested hour', () => {
    const logs = makeLogs(['08:05', '08:12', '08:20', '08:05', '08:12'])
    const result = predictArrivals(logs, 'mrt_sirindhorn', 'tha_phra', 'workday', 8)
    expect(result).toEqual(['08:05', '08:12', '08:20'])
  })

  it('filters by station, direction, and dayType', () => {
    const logs: LogEntry[] = [
      ...makeLogs(['08:05']),
      {
        station: 'mrt_sirindhorn',
        line: 'mrt_blue',
        direction: 'lak_song', // wrong direction
        time: '08:10',
        dayType: 'workday',
        date: '2026-02-20',
      },
      {
        station: 'mrt_silom', // wrong station
        line: 'mrt_blue',
        direction: 'tha_phra',
        time: '08:15',
        dayType: 'workday',
        date: '2026-02-20',
      },
    ]
    const result = predictArrivals(logs, 'mrt_sirindhorn', 'tha_phra', 'workday', 8)
    expect(result).toEqual(['08:05'])
  })

  it('clusters times within 2 minutes, taking the most common', () => {
    // 08:04, 08:05, 08:05, 08:06 → cluster around 08:05
    // 08:12, 08:13 → cluster around 08:12
    const logs = makeLogs(['08:04', '08:05', '08:05', '08:06', '08:12', '08:13'])
    const result = predictArrivals(logs, 'mrt_sirindhorn', 'tha_phra', 'workday', 8)
    expect(result).toEqual(['08:05', '08:12'])
  })

  it('returns times for the specified hour only', () => {
    const logs = makeLogs(['07:55', '08:05', '09:10'])
    const result = predictArrivals(logs, 'mrt_sirindhorn', 'tha_phra', 'workday', 8)
    expect(result).toEqual(['08:05'])
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL

**Step 3: Write implementation**

Create `src/utils/prediction.ts`:

```ts
import type { DayType, LogEntry } from '../types'

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function clusterTimes(minutes: number[]): number[] {
  if (minutes.length === 0) return []

  const sorted = [...minutes].sort((a, b) => a - b)
  const clusters: number[][] = [[sorted[0]]]

  for (let i = 1; i < sorted.length; i++) {
    const lastCluster = clusters[clusters.length - 1]
    if (sorted[i] - lastCluster[lastCluster.length - 1] <= 2) {
      lastCluster.push(sorted[i])
    } else {
      clusters.push([sorted[i]])
    }
  }

  // Pick the most frequent value in each cluster, tie-break by median
  return clusters.map((cluster) => {
    const freq = new Map<number, number>()
    for (const m of cluster) {
      freq.set(m, (freq.get(m) ?? 0) + 1)
    }
    const maxFreq = Math.max(...freq.values())
    const mostCommon = [...freq.entries()]
      .filter(([, count]) => count === maxFreq)
      .map(([val]) => val)
    return mostCommon[Math.floor(mostCommon.length / 2)]
  })
}

export function predictArrivals(
  logs: LogEntry[],
  station: string,
  direction: string,
  dayType: DayType,
  hour: number,
): string[] {
  const matching = logs.filter(
    (log) =>
      log.station === station &&
      log.direction === direction &&
      log.dayType === dayType,
  )

  const hourStart = hour * 60
  const hourEnd = hourStart + 60

  const minutesInHour = matching
    .map((log) => timeToMinutes(log.time))
    .filter((m) => m >= hourStart && m < hourEnd)

  const clustered = clusterTimes(minutesInHour)
  return clustered.map(minutesToTime)
}
```

**Step 4: Run tests**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/prediction.ts src/utils/prediction.test.ts && git commit -m "feat: add train arrival prediction logic"
```

---

### Task 7: GitHub storage service (TDD)

**Files:**
- Create: `src/services/github.ts`
- Create: `src/services/github.test.ts`

**Step 1: Write failing tests**

Create `src/services/github.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchLogs, appendLog } from './github'
import type { LogEntry, GitHubConfig } from '../types'

const config: GitHubConfig = { token: 'test-token', owner: 'user', repo: 'repo' }

const mockLog: LogEntry = {
  station: 'mrt_sirindhorn',
  line: 'mrt_blue',
  direction: 'tha_phra',
  time: '08:09',
  dayType: 'workday',
  date: '2026-02-23',
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('fetchLogs', () => {
  it('returns empty array when file does not exist (404)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 404 }),
    )
    const result = await fetchLogs(config)
    expect(result).toEqual([])
  })

  it('decodes and parses existing log file', async () => {
    const logs = [mockLog]
    const content = btoa(JSON.stringify(logs))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ content, sha: 'abc123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const result = await fetchLogs(config)
    expect(result).toEqual(logs)
  })
})

describe('appendLog', () => {
  it('creates file when it does not exist', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    // First call: GET returns 404
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }))

    // Second call: PUT creates file
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ content: { sha: 'new123' } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await appendLog(config, mockLog)

    const putCall = fetchMock.mock.calls[1]
    expect(putCall[1]?.method).toBe('PUT')
    const body = JSON.parse(putCall[1]?.body as string)
    expect(body.message).toContain('Add log entry')
    // Should not include sha when creating new file
    expect(body.sha).toBeUndefined()
  })

  it('appends to existing file with sha', async () => {
    const existingLogs = [mockLog]
    const content = btoa(JSON.stringify(existingLogs))
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    // GET returns existing file
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ content, sha: 'existing-sha' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    // PUT updates file
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ content: { sha: 'updated-sha' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const newLog = { ...mockLog, time: '08:15' }
    await appendLog(config, newLog)

    const putCall = fetchMock.mock.calls[1]
    const body = JSON.parse(putCall[1]?.body as string)
    expect(body.sha).toBe('existing-sha')
    const decoded = JSON.parse(atob(body.content))
    expect(decoded).toHaveLength(2)
    expect(decoded[1].time).toBe('08:15')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL

**Step 3: Write implementation**

Create `src/services/github.ts`:

```ts
import type { GitHubConfig, LogEntry } from '../types'

const FILE_PATH = 'data/logs.json'

function apiUrl(config: GitHubConfig): string {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${FILE_PATH}`
}

function headers(config: GitHubConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  }
}

interface GitHubFileResponse {
  content: string
  sha: string
}

async function getFile(
  config: GitHubConfig,
): Promise<{ logs: LogEntry[]; sha: string | null }> {
  const response = await fetch(apiUrl(config), { headers: headers(config) })
  if (response.status === 404) {
    return { logs: [], sha: null }
  }
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }
  const data: GitHubFileResponse = await response.json()
  const decoded = atob(data.content.replace(/\n/g, ''))
  return { logs: JSON.parse(decoded), sha: data.sha }
}

export async function fetchLogs(config: GitHubConfig): Promise<LogEntry[]> {
  const { logs } = await getFile(config)
  return logs
}

export async function appendLog(
  config: GitHubConfig,
  entry: LogEntry,
): Promise<void> {
  const { logs, sha } = await getFile(config)
  logs.push(entry)

  const body: Record<string, unknown> = {
    message: `Add log entry: ${entry.station} ${entry.direction} ${entry.time}`,
    content: btoa(JSON.stringify(logs, null, 2)),
  }
  if (sha) {
    body.sha = sha
  }

  const response = await fetch(apiUrl(config), {
    method: 'PUT',
    headers: headers(config),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }
}
```

**Step 4: Run tests**

Run: `pnpm test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/ && git commit -m "feat: add GitHub storage service for reading/writing logs"
```

---

### Task 8: Setup screen component

**Files:**
- Create: `src/components/SetupScreen.tsx`

**Step 1: Create component**

Create `src/components/SetupScreen.tsx`:

```tsx
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
```

**Step 2: Commit**

```bash
git add src/components/ && git commit -m "feat: add setup screen component"
```

---

### Task 9: Main screen — station picker and prediction display

**Files:**
- Create: `src/components/MainScreen.tsx`

**Step 1: Create component**

Create `src/components/MainScreen.tsx`:

```tsx
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
                <h3>→ {dir.label}</h3>
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
                  {logging ? 'Saving...' : `Log → ${dir.label}`}
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
```

**Step 2: Commit**

```bash
git add src/components/MainScreen.tsx && git commit -m "feat: add main screen with station picker, predictions, and logging"
```

---

### Task 10: Wire App.tsx and localStorage config

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Step 1: Replace App.tsx**

Replace `src/App.tsx` with:

```tsx
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
```

**Step 2: Commit**

```bash
git add src/App.tsx && git commit -m "feat: wire App.tsx with config persistence and screen routing"
```

---

### Task 11: Mobile-first CSS styling

**Files:**
- Modify: `src/App.css`
- Modify: `src/index.css`

**Step 1: Replace index.css with global reset**

Replace `src/index.css` with:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
}

body {
  background: #f5f5f5;
  color: #1a1a1a;
  min-height: 100dvh;
}

#root {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
}
```

**Step 2: Replace App.css with component styles**

Replace `src/App.css` with:

```css
/* Setup Screen */
.setup-screen {
  padding: 24px 0;
}

.setup-screen h1 {
  font-size: 1.5rem;
  margin-bottom: 8px;
}

.setup-screen p {
  color: #666;
  margin-bottom: 24px;
}

.setup-screen form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setup-screen label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.875rem;
  font-weight: 600;
}

.setup-screen input {
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
}

.setup-screen button[type='submit'] {
  padding: 14px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}

/* Main Screen */
.main-screen header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.main-screen h1 {
  font-size: 1.25rem;
}

.controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.holiday-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.875rem;
}

.day-type-badge {
  background: #e0e7ff;
  color: #3730a3;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.settings-btn {
  background: none;
  border: 1px solid #ddd;
  padding: 4px 12px;
  border-radius: 8px;
  font-size: 0.875rem;
  cursor: pointer;
}

.error {
  background: #fef2f2;
  color: #dc2626;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.875rem;
  margin-bottom: 12px;
}

/* Station Picker */
.station-picker {
  margin-bottom: 16px;
}

.station-picker h3,
.station-picker h4 {
  font-size: 0.875rem;
  color: #666;
  margin: 12px 0 8px;
}

.station-option {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 4px;
  cursor: pointer;
  font-size: 0.9375rem;
}

.station-option.selected {
  border-color: #2563eb;
  background: #eff6ff;
}

.line-tag {
  font-size: 0.75rem;
  color: #6b7280;
}

.line-group {
  margin-bottom: 8px;
}

details summary {
  cursor: pointer;
  font-size: 0.875rem;
  color: #2563eb;
  margin: 12px 0;
}

/* Selected Station */
.selected-station {
  background: white;
  padding: 12px 16px;
  border-radius: 12px;
  margin-bottom: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.selected-station h2 {
  font-size: 1.125rem;
  flex: 1;
}

.change-link {
  font-size: 0.875rem;
  color: #2563eb;
}

/* Direction Sections */
.direction-section {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
}

.direction-section h3 {
  font-size: 1rem;
  margin-bottom: 8px;
}

.predictions p {
  font-size: 1.25rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.no-data {
  color: #9ca3af;
  font-size: 0.875rem !important;
  font-weight: 400 !important;
}

.log-btn {
  display: block;
  width: 100%;
  padding: 14px;
  margin-top: 12px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
}

.log-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.last-logged {
  text-align: center;
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 12px;
}
```

**Step 3: Run build to check for compile errors**

Run: `pnpm build`
Expected: Build succeeds

**Step 4: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/App.css src/index.css && git commit -m "feat: add mobile-first CSS styling"
```

---

### Task 12: Final integration test and cleanup

**Files:**
- Delete: `src/assets/react.svg`
- Delete: `public/vite.svg`
- Modify: `index.html` (update title)

**Step 1: Update page title**

In `index.html`, change `<title>Vite + React + TS</title>` to `<title>Transport Logger</title>`.

**Step 2: Remove unused assets**

Delete `src/assets/react.svg` and `public/vite.svg`.

**Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

**Step 4: Run build**

Run: `pnpm build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add -A && git commit -m "chore: clean up starter template files and update title"
```

---

## Summary

12 tasks total:
1. Testing infrastructure (Vitest)
2. TypeScript types
3. Station and line data (with tests)
4. Day type utility (TDD)
5. Geolocation + nearest station (TDD)
6. Prediction logic (TDD)
7. GitHub storage service (TDD)
8. Setup screen component
9. Main screen component
10. App.tsx wiring
11. CSS styling
12. Cleanup and final verification
