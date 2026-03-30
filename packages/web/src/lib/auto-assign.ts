/**
 * 自動最佳化排桌演算法（非同步版本，不阻塞主線程）
 *
 * 策略：貪婪分群 + 局部搜尋
 * Step 1: 按群組和偏好分群，填入桌子
 * Step 2: 嘗試單人移動和兩人交換，依模式選擇接受條件
 * Step 3: 消除「想換桌」標記
 *
 * 兩種模式：
 * - balanced: 最大化全場平均滿意度（皆大歡喜）
 * - maximize-happy: 最大化 85+ 高滿意度人數（讓關係好的人盡量湊在一起）
 *
 * 只排「未分配」的賓客，保留已排的不動。
 */

import type { Guest, Table, AvoidPair } from './types'
import { recalculateAll } from './satisfaction'

export type AutoAssignMode = 'balanced' | 'maximize-happy'

interface Assignment {
  guestId: string
  tableId: string
}

export interface AutoAssignProgress {
  /** 使用者看得懂的描述 */
  label: string
  /** 具體的嘗試進度（如「已嘗試 1,200 / 9,000 種組合」） */
  detail: string
  /** 0-1 整體進度 */
  progress: number
  /** 全場平均滿意度 */
  currentAvg: number
  /** 預估剩餘秒數（null = 尚未估算或資料不足） */
  remainingSeconds: number | null
}

/**
 * 預估自動分配所需時間（秒）
 * 跑一輪 recalculateAll 測量耗時，乘以預估的迭代次數
 */
export function estimateAutoAssignTime(
  guests: Guest[],
  tables: Table[],
  avoidPairs: AvoidPair[],
): number {
  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed')
  const unassigned = confirmed.filter((g) => !g.assignedTableId)
  if (unassigned.length === 0) return 0

  // 測量單次 recalculateAll 耗時
  const t0 = performance.now()
  recalculateAll(guests, tables, avoidPairs)
  const singleCallMs = performance.now() - t0

  // Step 2 每輪：N_assigned * N_tables (moves) + N_assigned^2/2 (swaps)
  const nAssigned = unassigned.length
  const nTables = tables.length
  const step2CallsPerRound = nAssigned * nTables + (nAssigned * (nAssigned - 1)) / 2
  const step2Rounds = 10 // 平均約跑一半的 MAX_ROUNDS
  const step2Calls = step2CallsPerRound * step2Rounds

  // Step 3 每輪：N_all_seated * N_tables
  const nAllSeated = confirmed.length
  const step3CallsPerRound = nAllSeated * nTables
  const step3Rounds = 5 // 平均約 5 輪
  const step3Calls = step3CallsPerRound * step3Rounds

  const totalMs = (step2Calls + step3Calls) * singleCallMs
  return Math.ceil(totalMs / 1000)
}

/** yield 回主線程，讓 UI 有機會更新 */
const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0))

/**
 * 自動分配未入座的賓客到桌子（非同步，不阻塞 UI）
 * @param onProgress 進度回呼（每輪呼叫一次）
 * @returns 每位賓客的桌次分配
 */
export async function autoAssignGuests(
  guests: Guest[],
  tables: Table[],
  avoidPairs: AvoidPair[],
  mode: AutoAssignMode = 'balanced',
  onProgress?: (progress: AutoAssignProgress) => void,
): Promise<Assignment[]> {
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

  const startTime = performance.now()

  const reportProgress = (label: string, detail: string, progress: number, avg: number) => {
    const elapsed = (performance.now() - startTime) / 1000
    // 跑超過 3 秒且進度 > 5% 才顯示預估，避免一開始就出現不準的數字
    let remainingSeconds: number | null = null
    if (elapsed > 3 && progress > 0.05 && progress < 1) {
      remainingSeconds = Math.ceil((elapsed / progress) * (1 - progress))
    }
    onProgress?.({ label, detail, progress, currentAvg: avg, remainingSeconds })
  }

  reportProgress('正在分組...', `${unassigned.length} 位賓客待分配`, 0.02, 0)

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
  // 每輪同時嘗試「單人移動」和「兩人交換」，選最大改善的執行，
  // 直到沒有任何操作能改善為止。完全確定性，同輸入同結果。

  const simGuests = guests.map((g) => {
    const tableId = assigned.get(g.id)
    return tableId ? { ...g, assignedTableId: tableId } : g
  })

  const baseResult = recalculateAll(simGuests, tables, avoidPairs)
  // 不在 Step 1 結束時顯示分佈（此時很多人分數低，會誤導使用者）
  let currentAvg = baseResult.overallAverage
  let currentHappyCount = countHappy(baseResult)
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

  // 比較函式：根據模式決定「新結果是否比現在好」
  // 回傳正數代表改善，越大越好
  const evaluateImprovement = (result: ReturnType<typeof recalculateAll>): number => {
    if (mode === 'maximize-happy') {
      const newHappy = countHappy(result)
      const happyDelta = newHappy - currentHappyCount
      if (happyDelta > 0) return happyDelta * 100 + (result.overallAverage - currentAvg)
      if (happyDelta === 0 && result.overallAverage > currentAvg) return result.overallAverage - currentAvg
      return 0
    }
    return result.overallAverage - currentAvg
  }

  const MAX_ROUNDS = 20 // 最多改善 20 輪
  const nTables = tables.length
  const step2CombosPerRound = assignedIds.length * nTables + (assignedIds.length * (assignedIds.length - 1)) / 2
  const step2TotalCombos = step2CombosPerRound * MAX_ROUNDS

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Step 2 佔整體 10%~80%
    const step2Progress = 0.1 + (round / MAX_ROUNDS) * 0.7
    const triedSoFar = Math.round(round * step2CombosPerRound)
    reportProgress(
      '尋找更好的座位組合...',
      `第 ${round + 1}/${MAX_ROUNDS} 輪 · 已嘗試 ${triedSoFar.toLocaleString()} / ${Math.round(step2TotalCombos).toLocaleString()} 種組合`,
      step2Progress,
      currentAvg,
    )
    await yieldToMain()

    refreshSeatCounts()
    let bestImprovement = 0.01 // 最小改善門檻
    let bestMove: { type: 'move'; guestId: string; tableId: string } | { type: 'swap'; a: string; b: string } | null = null
    let bestResult: ReturnType<typeof recalculateAll> | null = null

    // 2a: 嘗試單人移動（把一個人移到另一桌）
    let calcCount = 0
    for (const guestId of assignedIds) {
      const guest = simGuests.find((g) => g.id === guestId)!
      for (const t of tables) {
        if (t.id === guest.assignedTableId) continue
        const targetSeats = tableSeatCounts.get(t.id) || 0
        if (targetSeats + guest.attendeeCount > t.capacity) continue

        const moved = simGuests.map((g) => g.id === guestId ? { ...g, assignedTableId: t.id } : g)
        const result = recalculateAll(moved, tables, avoidPairs)
        const improvement = evaluateImprovement(result)
        if (improvement > bestImprovement) {
          bestImprovement = improvement
          bestMove = { type: 'move', guestId, tableId: t.id }
          bestResult = result
        }
        if (++calcCount % 200 === 0) await yieldToMain()
      }
    }

    // 2b: 嘗試兩人交換
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
        const result = recalculateAll(swapped, tables, avoidPairs)
        const improvement = evaluateImprovement(result)
        if (improvement > bestImprovement) {
          bestImprovement = improvement
          bestMove = { type: 'swap', a: assignedIds[i], b: assignedIds[j] }
          bestResult = result
        }
        if (++calcCount % 200 === 0) await yieldToMain()
      }
    }

    if (!bestMove || !bestResult) break // 沒有任何改善，結束

    // 執行最佳操作
    if (bestMove.type === 'move') {
      const guest = simGuests.find((g) => g.id === bestMove.guestId)!
      guest.assignedTableId = bestMove.tableId
      assigned.set(bestMove.guestId, bestMove.tableId)
    } else {
      const gA = simGuests.find((g) => g.id === bestMove.a)!
      const gB = simGuests.find((g) => g.id === bestMove.b)!
      const tmpTable = gA.assignedTableId
      gA.assignedTableId = gB.assignedTableId
      gB.assignedTableId = tmpTable
      assigned.set(bestMove.a, gA.assignedTableId!)
      assigned.set(bestMove.b, gB.assignedTableId!)
    }
    currentAvg = bestResult.overallAverage
    currentHappyCount = countHappy(bestResult)
  }

  // ─── Step 3: 消除「想換桌」標記 ────────────────────────
  // 用跟 FloorPlan 背景掃描完全相同的條件，掃描「所有已入座賓客」
  // （不只新分配的），反覆移動直到沒有任何人會被標上「想換桌」圖示。
  const allSeatedIds = simGuests
    .filter((g) => g.assignedTableId && g.rsvpStatus === 'confirmed')
    .map((g) => g.id)

  const MAX_ELIM_ROUNDS = 50
  for (let round = 0; round < MAX_ELIM_ROUNDS; round++) {
    // Step 3 佔整體 80%~100%
    const step3Progress = 0.8 + (round / MAX_ELIM_ROUNDS) * 0.2
    reportProgress(
      '最後微調中...',
      `檢查每位賓客是否有更好的位置（第 ${round + 1} 輪）`,
      step3Progress,
      currentAvg,
    )
    await yieldToMain()

    refreshSeatCounts()
    // 每輪重算所有人的滿意度（Step 1/2 只更新 assignedTableId，分數是舊的）
    const baseResult = recalculateAll(simGuests, tables, avoidPairs)
    const baseOverall = baseResult.overallAverage
    // 建立 guestId → 當前真實滿意度 的查找表
    const currentScores = new Map<string, number>()
    for (const gs of baseResult.guests) currentScores.set(gs.id, gs.satisfactionScore)
    // 建立 tableId → 當前真實桌均滿意度 的查找表
    const currentTableAvgs = new Map<string, number>()
    for (const ts of baseResult.tables) currentTableAvgs.set(ts.id, ts.averageSatisfaction)

    // 找出所有會被標記「想換桌」的賓客，選改善最大的執行
    let bestCandidate: { guestId: string; tableId: string; guestDelta: number } | null = null

    let step3CalcCount = 0
    for (const guestId of allSeatedIds) {
      const guest = simGuests.find((g) => g.id === guestId)!
      if (!guest.assignedTableId) continue
      const guestCurrentScore = currentScores.get(guestId) ?? 0

      for (const t of tables) {
        if (t.id === guest.assignedTableId) continue
        const targetSeats = tableSeatCounts.get(t.id) || 0
        if (targetSeats + guest.attendeeCount > t.capacity) continue

        const moved = simGuests.map((g) => g.id === guestId ? { ...g, assignedTableId: t.id } : g)
        const simResult = recalculateAll(moved, tables, avoidPairs)
        if (++step3CalcCount % 200 === 0) await yieldToMain()
        const newGuestScore = simResult.guests.find((g) => g.id === guestId)?.satisfactionScore ?? 0
        const guestDelta = newGuestScore - guestCurrentScore
        const rawTableDelta = (simResult.tables.find((ts) => ts.id === t.id)?.averageSatisfaction ?? 0)
          - (currentTableAvgs.get(t.id) ?? 0)
        const rawOverallDelta = simResult.overallAverage - baseOverall

        // 跟 FloorPlan.tsx 背景掃描完全相同的條件
        if (guestDelta > 0.1 && (rawTableDelta > 0.1 || rawOverallDelta > 0.1)) {
          if (!bestCandidate || guestDelta > bestCandidate.guestDelta) {
            bestCandidate = { guestId, tableId: t.id, guestDelta }
          }
        }
      }
    }

    if (!bestCandidate) break // 沒有任何人想換桌了

    // 執行移動（如果是原本就入座的賓客，也加入 assigned 讓 caller 知道）
    const guest = simGuests.find((g) => g.id === bestCandidate.guestId)!
    guest.assignedTableId = bestCandidate.tableId
    assigned.set(bestCandidate.guestId, bestCandidate.tableId)
  }

  return [...assigned.entries()].map(([guestId, tableId]) => ({ guestId, tableId }))
}

const HAPPY_THRESHOLD = 85

function countHappy(result: ReturnType<typeof recalculateAll>): number {
  return result.guests.filter((g) => g.satisfactionScore >= HAPPY_THRESHOLD).length
}
