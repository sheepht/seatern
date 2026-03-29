/**
 * 自動最佳化排桌演算法
 *
 * 策略：貪婪分群 + 局部搜尋
 * Step 1: 按群組和偏好分群，填入桌子
 * Step 2: 嘗試交換兩人，只接受改善全場平均的交換
 *
 * 只排「未分配」的賓客，保留已排的不動。
 */

import type { Guest, Table, AvoidPair } from '@/stores/seating'
import { recalculateAll } from './satisfaction'

interface Assignment {
  guestId: string
  tableId: string
}

/**
 * 自動分配未入座的賓客到桌子
 * @returns 每位賓客的桌次分配
 */
export function autoAssignGuests(
  guests: Guest[],
  tables: Table[],
  avoidPairs: AvoidPair[],
): Assignment[] {
  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed')
  const unassigned = confirmed.filter((g) => !g.assignedTableId)
  if (unassigned.length === 0) return []

  // 計算每桌剩餘容量（扣掉已入座的人）
  const tableRemaining = new Map<string, number>()
  for (const t of tables) {
    const seated = confirmed.filter((g) => g.assignedTableId === t.id)
    const seatCount = seated.reduce((s, g) => s + g.attendeeCount, 0)
    tableRemaining.set(t.id, t.capacity - seatCount)
  }

  // ─── Step 1: 貪婪分群 ──────────────────────────────

  // 建立賓客間的親和度矩陣（用於分群）
  const affinityMap = new Map<string, Map<string, number>>()
  for (const g of unassigned) {
    affinityMap.set(g.id, new Map())
  }

  // 同 tag → 親和度 +2
  for (let i = 0; i < unassigned.length; i++) {
    const a = unassigned[i]
    const aTags = a.guestTags.map((gt) => gt.tag.name)
    if (aTags.length === 0) continue
    for (let j = i + 1; j < unassigned.length; j++) {
      const b = unassigned[j]
      const bTags = b.guestTags.map((gt) => gt.tag.name)
      const shared = aTags.some((t) => bTags.includes(t))
      if (shared) {
        affinityMap.get(a.id)!.set(b.id, (affinityMap.get(a.id)!.get(b.id) || 0) + 2)
        affinityMap.get(b.id)!.set(a.id, (affinityMap.get(b.id)!.get(a.id) || 0) + 2)
      }
    }
  }

  // seatPreference → 親和度 +5（雙向 +10）
  for (const g of unassigned) {
    for (const pref of g.seatPreferences) {
      const other = unassigned.find((u) => u.id === pref.preferredGuestId)
      if (other) {
        affinityMap.get(g.id)!.set(other.id, (affinityMap.get(g.id)!.get(other.id) || 0) + 5)
      }
    }
  }

  // avoidPair → 親和度 -100（強烈排斥）
  for (const ap of avoidPairs) {
    if (affinityMap.has(ap.guestAId) && affinityMap.has(ap.guestBId)) {
      affinityMap.get(ap.guestAId)!.set(ap.guestBId, -100)
      affinityMap.get(ap.guestBId)!.set(ap.guestAId, -100)
    }
  }

  // 貪婪填桌：按親和度高的人優先放在一起
  const assigned = new Map<string, string>() // guestId → tableId
  const remaining = [...unassigned]

  // 按 tag 數量排序（有群組的先排，散客後排）
  remaining.sort((a, b) => {
    const aScore = a.guestTags.length * 10 + a.seatPreferences.length * 5
    const bScore = b.guestTags.length * 10 + b.seatPreferences.length * 5
    return bScore - aScore
  })

  for (const guest of remaining) {
    if (assigned.has(guest.id)) continue

    // 找最適合的桌：優先選已有同群組/偏好人的桌
    let bestTable: string | null = null
    let bestScore = -Infinity

    for (const t of tables) {
      const cap = tableRemaining.get(t.id) || 0
      if (cap < guest.attendeeCount) continue

      // 計算這張桌對這位賓客的吸引力
      let score = 0

      // 已入座的人的親和度
      const seatedAtTable = confirmed.filter(
        (g) => g.assignedTableId === t.id || assigned.get(g.id) === t.id,
      )
      for (const seated of seatedAtTable) {
        score += affinityMap.get(guest.id)?.get(seated.id) || 0
      }

      // 空桌小幅扣分（優先填有人的桌）
      if (seatedAtTable.length === 0) score -= 1

      if (score > bestScore) {
        bestScore = score
        bestTable = t.id
      }
    }

    if (bestTable) {
      assigned.set(guest.id, bestTable)
      tableRemaining.set(bestTable, (tableRemaining.get(bestTable) || 0) - guest.attendeeCount)
    }
  }

  // 放不下的賓客不硬塞（caller 應確保桌子容量足夠）

  // ─── Step 2: 確定性局部搜尋 ─────────────────────────
  // 掃描所有可能的兩人交換，每輪找到最大改善的交換並執行，
  // 直到沒有任何交換能改善為止。完全確定性，同輸入同結果。

  const simGuests = guests.map((g) => {
    const tableId = assigned.get(g.id)
    return tableId ? { ...g, assignedTableId: tableId } : g
  })

  let currentScore = recalculateAll(simGuests, tables, avoidPairs).overallAverage
  const assignedIds = [...assigned.keys()]

  // 預算每桌座位數（避免重複計算）
  const tableSeatCounts = new Map<string, number>()
  const refreshSeatCounts = () => {
    tableSeatCounts.clear()
    for (const t of tables) {
      const count = simGuests.filter((g) => g.assignedTableId === t.id).reduce((s, g) => s + g.attendeeCount, 0)
      tableSeatCounts.set(t.id, count)
    }
  }

  const MAX_ROUNDS = 20 // 最多改善 20 輪（每輪掃描所有配對）
  for (let round = 0; round < MAX_ROUNDS; round++) {
    refreshSeatCounts()
    let bestImprovement = 0.01 // 最小改善門檻
    let bestSwap: [string, string] | null = null
    let bestScore = currentScore

    for (let i = 0; i < assignedIds.length; i++) {
      for (let j = i + 1; j < assignedIds.length; j++) {
        const gA = simGuests.find((g) => g.id === assignedIds[i])!
        const gB = simGuests.find((g) => g.id === assignedIds[j])!
        if (gA.assignedTableId === gB.assignedTableId) continue

        // 容量檢查
        const seatsA = tableSeatCounts.get(gA.assignedTableId!) || 0
        const seatsB = tableSeatCounts.get(gB.assignedTableId!) || 0
        const capA = tables.find((t) => t.id === gA.assignedTableId)!.capacity
        const capB = tables.find((t) => t.id === gB.assignedTableId)!.capacity
        if (seatsA - gA.attendeeCount + gB.attendeeCount > capA) continue
        if (seatsB - gB.attendeeCount + gA.attendeeCount > capB) continue

        // 試交換
        const swapped = simGuests.map((g) => {
          if (g.id === gA.id) return { ...g, assignedTableId: gB.assignedTableId }
          if (g.id === gB.id) return { ...g, assignedTableId: gA.assignedTableId }
          return g
        })
        const newScore = recalculateAll(swapped, tables, avoidPairs).overallAverage
        const improvement = newScore - currentScore
        if (improvement > bestImprovement) {
          bestImprovement = improvement
          bestSwap = [assignedIds[i], assignedIds[j]]
          bestScore = newScore
        }
      }
    }

    if (!bestSwap) break // 沒有任何改善，結束

    // 執行最佳交換
    const gA = simGuests.find((g) => g.id === bestSwap[0])!
    const gB = simGuests.find((g) => g.id === bestSwap[1])!
    const tmpTable = gA.assignedTableId
    gA.assignedTableId = gB.assignedTableId
    gB.assignedTableId = tmpTable
    assigned.set(bestSwap[0], gA.assignedTableId!)
    assigned.set(bestSwap[1], gB.assignedTableId!)
    currentScore = bestScore
  }

  return [...assigned.entries()].map(([guestId, tableId]) => ({ guestId, tableId }))
}
