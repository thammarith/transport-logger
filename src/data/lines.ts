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
