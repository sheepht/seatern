/**
 * 滿意度計算引擎（純函式）
 *
 * 公式：個人滿意度 = 50（基礎）+ 群組分（0-20）+ 偏好分（0-25）+ 需求分（固定 +5）
 * 權威來源：PRD（CLAUDE.md）§3.4
 */

import type { Guest, Table, AvoidPair } from './types'

// ─── 群組分（0-20）──────────────────────────────────
// 同桌有同群組的人佔比

export function calculateGroupScore(
  guest: Guest,
  tableGuests: Guest[],
): number {
  if (tableGuests.length <= 1) return 0

  const guestTagNames = guest.guestTags.map((gt) => gt.tag.name)
  if (guestTagNames.length === 0) return 0

  const others = tableGuests.filter((g) => g.id !== guest.id)
  if (others.length === 0) return 0

  const sameGroupCount = others.filter((other) => {
    const otherTagNames = other.guestTags.map((gt) => gt.tag.name)
    return guestTagNames.some((tag) => otherTagNames.includes(tag))
  }).length

  const ratio = sameGroupCount / others.length

  if (ratio >= 0.5) return 20
  if (ratio >= 0.3) return 15
  if (ratio >= 0.1) return 10
  if (sameGroupCount >= 1) return 5
  return 0
}

// ─── 偏好分（0-25）──────────────────────────────────
// 想同桌的人配對成功數

export function calculatePreferenceScore(
  guest: Guest,
  tableGuests: Guest[],
  allGuests: Guest[],
  tables: Table[],
): number {
  if (guest.seatPreferences.length === 0) return 0

  const tableGuestIds = new Set(tableGuests.map((g) => g.id))
  const preferredIds = guest.seatPreferences.map((p) => p.preferredGuestId)

  const matchedCount = preferredIds.filter((id) => tableGuestIds.has(id)).length
  const totalPrefs = preferredIds.length

  if (totalPrefs >= 3 && matchedCount >= 3) return 25
  if (matchedCount >= 2) return 18
  if (matchedCount >= 1) return 10

  // 0 配對：檢查是否有人在鄰桌
  if (matchedCount === 0 && guest.assignedTableId) {
    const currentTable = tables.find((t) => t.id === guest.assignedTableId)
    if (currentTable) {
      const hasNeighbor = preferredIds.some((prefId) => {
        const prefGuest = allGuests.find((g) => g.id === prefId)
        if (!prefGuest?.assignedTableId || prefGuest.assignedTableId === guest.assignedTableId) return false
        const prefTable = tables.find((t) => t.id === prefGuest.assignedTableId)
        if (!prefTable) return false
        return isNeighborTable(currentTable, prefTable)
      })
      if (hasNeighbor) return 5
    }
  }

  return 0
}

// ─── 鄰桌判定 ───────────────────────────────────────
// 邏輯座標，閾值 = 桌次直徑的 2 倍（約 250 邏輯單位）

const NEIGHBOR_THRESHOLD = 250

export function isNeighborTable(a: Table, b: Table): boolean {
  const dx = a.positionX - b.positionX
  const dy = a.positionY - b.positionY
  const distance = Math.sqrt(dx * dx + dy * dy)
  return distance <= NEIGHBOR_THRESHOLD
}

// ─── 避免同桌懲罰（每個衝突 -20，最低 0）───────────────

const AVOID_PENALTY = 60

export function calculateAvoidPenalty(
  guest: Guest,
  tableGuests: Guest[],
  avoidPairs: AvoidPair[],
): number {
  const tableGuestIds = new Set(tableGuests.filter((g) => g.id !== guest.id).map((g) => g.id))
  const violations = avoidPairs.filter(
    (ap) =>
      (ap.guestAId === guest.id && tableGuestIds.has(ap.guestBId)) ||
      (ap.guestBId === guest.id && tableGuestIds.has(ap.guestAId)),
  )
  return violations.length * AVOID_PENALTY
}

// ─── 個人滿意度 ─────────────────────────────────────

export function calculateSatisfaction(
  guest: Guest,
  allGuests: Guest[],
  tables: Table[],
  avoidPairs: AvoidPair[] = [],
): number {
  // 婉拒的不計算
  if (guest.rsvpStatus === 'declined') return 0

  // 未分配的：基礎分 + 需求分
  if (!guest.assignedTableId) return 55

  const tableGuests = allGuests.filter(
    (g) => g.assignedTableId === guest.assignedTableId && g.rsvpStatus === 'confirmed',
  )

  const base = 50
  const groupScore = calculateGroupScore(guest, tableGuests)
  const prefScore = calculatePreferenceScore(guest, tableGuests, allGuests, tables)
  const needsScore = 5 // 固定 +5
  const avoidPenalty = calculateAvoidPenalty(guest, tableGuests, avoidPairs)

  return Math.max(0, base + groupScore + prefScore + needsScore - avoidPenalty)
}

// ─── 桌次平均滿意度 ─────────────────────────────────

export function calculateTableAverage(
  tableId: string,
  allGuests: Guest[],
  tables: Table[],
): number {
  const tableGuests = allGuests.filter(
    (g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed',
  )
  if (tableGuests.length === 0) return 0

  const total = tableGuests.reduce(
    (sum, g) => sum + calculateSatisfaction(g, allGuests, tables),
    0,
  )
  return Math.round((total / tableGuests.length) * 10) / 10
}

// ─── 全量重算 ───────────────────────────────────────
// 每次移動賓客後呼叫，重算所有人的滿意度

export interface RecalcResult {
  guests: Array<{ id: string; satisfactionScore: number }>
  tables: Array<{ id: string; averageSatisfaction: number }>
  overallAverage: number
}

export function recalculateAll(
  guests: Guest[],
  tables: Table[],
  avoidPairs: AvoidPair[] = [],
): RecalcResult {
  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed')

  const guestScores = confirmed.map((g) => ({
    id: g.id,
    satisfactionScore: calculateSatisfaction(g, guests, tables, avoidPairs),
  }))

  const tableScores = tables.map((t) => ({
    id: t.id,
    averageSatisfaction: calculateTableAverage(t.id, guests, tables),
  }))

  const assignedScores = guestScores.filter((g) => {
    const guest = guests.find((gg) => gg.id === g.id)
    return guest?.assignedTableId != null
  })

  const overallAverage =
    assignedScores.length > 0
      ? Math.round(
          (assignedScores.reduce((s, g) => s + g.satisfactionScore, 0) / assignedScores.length) * 10,
        ) / 10
      : 0

  return { guests: guestScores, tables: tableScores, overallAverage }
}

// ─── 滿意度 delta 顯示值（> 0.1 至少 ±1）─────────────

export function formatScoreDelta(rawDelta: number): number {
  if (rawDelta > 0.1) return Math.max(1, Math.round(rawDelta))
  if (rawDelta < -0.1) return Math.min(-1, Math.round(rawDelta))
  return 0
}

// ─── 滿意度顏色 ──────────────────────────────────────
// >= 75 綠、>= 50 黃、>= 25 橘、< 25 紅

export function getSatisfactionColor(score: number): string {
  if (score >= 75) return '#16A34A'
  if (score >= 50) return '#CA8A04'
  if (score >= 25) return '#EA580C'
  return '#DC2626'
}
