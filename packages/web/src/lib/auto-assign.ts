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

  // 處理放不下的賓客（所有桌都滿了）→ 放到剩餘容量最大的桌
  for (const guest of remaining) {
    if (assigned.has(guest.id)) continue
    let bestTable: string | null = null
    let bestCap = -Infinity
    for (const t of tables) {
      const cap = tableRemaining.get(t.id) || 0
      if (cap > bestCap) { bestCap = cap; bestTable = t.id }
    }
    if (bestTable) {
      assigned.set(guest.id, bestTable)
      tableRemaining.set(bestTable, (tableRemaining.get(bestTable) || 0) - guest.attendeeCount)
    }
  }

  // ─── Step 2: 局部搜尋 ──────────────────────────────

  // 建立模擬用的 guest 陣列（套用 step 1 的分配）
  const simGuests = guests.map((g) => {
    const tableId = assigned.get(g.id)
    return tableId ? { ...g, assignedTableId: tableId } : g
  })

  let currentScore = recalculateAll(simGuests, tables, avoidPairs).overallAverage
  const assignedIds = [...assigned.keys()]

  // 最多 500 輪，或連續 50 輪沒改善就停
  const MAX_ITERATIONS = 500
  let noImprovementCount = 0

  for (let iter = 0; iter < MAX_ITERATIONS && noImprovementCount < 50; iter++) {
    // 隨機選兩位不同桌的已分配賓客嘗試交換
    const idxA = Math.floor(Math.random() * assignedIds.length)
    let idxB = Math.floor(Math.random() * assignedIds.length)
    if (idxA === idxB) continue

    const guestA = simGuests.find((g) => g.id === assignedIds[idxA])!
    const guestB = simGuests.find((g) => g.id === assignedIds[idxB])!
    if (guestA.assignedTableId === guestB.assignedTableId) { noImprovementCount++; continue }

    // 檢查容量（交換後兩桌都不能超額）
    const tableA = tables.find((t) => t.id === guestA.assignedTableId)!
    const tableB = tables.find((t) => t.id === guestB.assignedTableId)!
    const seatsA = simGuests.filter((g) => g.assignedTableId === tableA.id).reduce((s, g) => s + g.attendeeCount, 0)
    const seatsB = simGuests.filter((g) => g.assignedTableId === tableB.id).reduce((s, g) => s + g.attendeeCount, 0)
    const newSeatsA = seatsA - guestA.attendeeCount + guestB.attendeeCount
    const newSeatsB = seatsB - guestB.attendeeCount + guestA.attendeeCount
    if (newSeatsA > tableA.capacity || newSeatsB > tableB.capacity) { noImprovementCount++; continue }

    // 試交換
    const swapped = simGuests.map((g) => {
      if (g.id === guestA.id) return { ...g, assignedTableId: guestB.assignedTableId }
      if (g.id === guestB.id) return { ...g, assignedTableId: guestA.assignedTableId }
      return g
    })

    const newScore = recalculateAll(swapped, tables, avoidPairs).overallAverage
    if (newScore > currentScore + 0.01) {
      // 接受交換
      const ga = simGuests.find((g) => g.id === guestA.id)!
      const gb = simGuests.find((g) => g.id === guestB.id)!
      const tmpTable = ga.assignedTableId
      ga.assignedTableId = gb.assignedTableId
      gb.assignedTableId = tmpTable
      assigned.set(guestA.id, ga.assignedTableId!)
      assigned.set(guestB.id, gb.assignedTableId!)
      currentScore = newScore
      noImprovementCount = 0
    } else {
      noImprovementCount++
    }
  }

  return [...assigned.entries()].map(([guestId, tableId]) => ({ guestId, tableId }))
}
