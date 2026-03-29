import { create } from 'zustand'
import { recalculateAll } from '@/lib/satisfaction'
import { autoAssignGuests as runAutoAssign } from '@/lib/auto-assign'
import { findFreePosition } from '@/lib/viewport'
import { buildSlotArray, placeGuest, extractSeatIndices, type Slot } from '@/lib/seat-shift'

// ─── Types ──────────────────────────────────────────

export interface Guest {
  id: string
  name: string
  aliases: string[]
  category: string
  relationScore: number
  rsvpStatus: 'pending' | 'confirmed' | 'declined' | 'modified'
  attendeeCount: number
  dietaryNote: string
  specialNote: string
  satisfactionScore: number
  assignedTableId: string | null
  seatIndex: number | null
  isOverflow: boolean
  isIsolated: boolean
  seatPreferences: Array<{ preferredGuestId: string; rank: number }>
  guestTags: Array<{ tag: { id: string; name: string } }>
}

export interface Table {
  id: string
  name: string
  capacity: number
  positionX: number
  positionY: number
  averageSatisfaction: number
  color: string | null
  note: string | null
}

export interface AvoidPair {
  id: string
  guestAId: string
  guestBId: string
  reason: string | null
}

export interface SeatingSnapshot {
  id: string
  name: string
  data: any
  averageSatisfaction: number
  createdAt: string
}

// ─── Store ──────────────────────────────────────────

interface SeatingState {
  // Data
  eventId: string | null
  eventName: string
  guests: Guest[]
  tables: Table[]
  avoidPairs: AvoidPair[]
  snapshots: SeatingSnapshot[]

  // UI state
  selectedTableId: string | null
  hoveredGuestId: string | null
  hoveredGuestScreenY: number | null
  loading: boolean

  // 拖曳狀態
  activeDragGuestId: string | null // 從 dragStart 到 dragEnd 持續存在
  hoverSuppressedUntil: number // drop 後暫時抑制 hover，讓滿意度動畫播完
  dragPreview: {
    tableId: string
    previewSlots: Slot[]
    draggedGuestId: string
    /** 預覽滿意度：被拖的賓客和受影響賓客的即時分數 */
    previewScores: Map<string, number>
    /** 預覽桌次平均滿意度 */
    previewTableScores: Map<string, number>
  } | null
  dragRejectTableId: string | null // 拖曳 hover 時無法放置的桌 ID（滿桌提示）
  /** 智慧推薦：hover 賓客時各桌的預覽滿意度（用於顯示 ±N badge） */
  recommendationTableScores: Map<string, number>
  /** 智慧推薦：hover 的賓客在最佳推薦桌的預覽分數 */
  recommendationGuestScore: { guestId: string; score: number } | null
  /** 智慧推薦：最佳推薦的全場平均滿意度 */
  recommendationOverallScore: number | null
  /** 智慧推薦：最佳推薦的每位賓客預覽滿意度 */
  recommendationPreviewScores: Map<string, number>
  /** 有更好位置的賓客 ID 集合（顯示💡圖示） */
  guestsWithRecommendations: Set<string>
  /** 上次重排的時間戳，用於觸發入場動畫 */
  lastResetAt: number
  /** 重排動畫進行中（桌上賓客淡出） */
  isResetting: boolean
  /** 正在飛行動畫中的賓客 ID（用於 undo 動畫隱藏個別賓客） */
  flyingGuestIds: Set<string>

  // Undo stack
  undoStack: Array<
    | {
        type?: 'move-guest'
        guestId: string
        fromTableId: string | null
        toTableId: string | null
        prevSeatIndices: Map<string, number | null>
        batchId?: string
      }
    | {
        type: 'add-table'
        tableId: string
      }
    | {
        type: 'move-table'
        tableId: string
        fromX: number
        fromY: number
        toX: number
        toY: number
      }
    | {
        type: 'rename-table'
        tableId: string
        oldName: string
        newName: string
      }
    | {
        type: 'auto-arrange'
        positions: Map<string, { fromX: number; fromY: number }>
      }
    | {
        type: 'auto-assign'
        assignments: Array<{ guestId: string; fromTableId: string | null }>
        createdTableIds: string[] // 自動新增的桌子，undo 時要刪除
      }
  >

  // Actions
  loadEvent: (eventId: string) => Promise<void>
  setSelectedTable: (tableId: string | null) => void
  setHoveredGuest: (guestId: string | null, screenY?: number | null) => void
  setActiveDragGuest: (guestId: string | null) => void
  moveGuest: (guestId: string, toTableId: string | null) => void
  moveGuestToSeat: (guestId: string, tableId: string, seatIndex: number, cursorBias?: 'left' | 'right') => void
  setDragPreview: (tableId: string | null, seatIndex?: number, draggedGuestId?: string, cursorBias?: 'left' | 'right') => void
  undo: () => void
  clearTable: (tableId: string) => void
  resetAllSeats: () => void
  updateEventName: (name: string) => void
  addTable: (name: string, positionX: number, positionY: number) => Promise<void>
  removeTable: (tableId: string) => Promise<void>
  updateTableName: (tableId: string, name: string) => void
  updateTablePosition: (tableId: string, x: number, y: number) => void
  saveTablePosition: (tableId: string, fromX?: number, fromY?: number) => void
  saveSnapshot: (name: string) => Promise<void>
  restoreSnapshot: (snapshotId: string) => void
  addAvoidPair: (guestAId: string, guestBId: string, reason?: string) => Promise<void>
  removeAvoidPair: (pairId: string) => Promise<void>
  checkAvoidViolation: (guestId: string, tableId: string) => AvoidPair | null
  autoArrangeTables: (positions: Array<{ tableId: string; x: number; y: number }>) => Promise<void>
  autoAssignGuests: () => Promise<void>

  // Computed helpers
  getTableGuests: (tableId: string) => Guest[]
  getUnassignedGuests: () => Guest[]
  getTableSeatCount: (tableId: string) => number
  getTotalAssignedSeats: () => number
  getTotalConfirmedSeats: () => number
}

export const useSeatingStore = create<SeatingState>((set, get) => ({
  eventId: null,
  eventName: '',
  guests: [],
  tables: [],
  avoidPairs: [],
  snapshots: [],
  selectedTableId: null,
  hoveredGuestId: null,
  hoveredGuestScreenY: null,
  loading: false,
  activeDragGuestId: null,
  hoverSuppressedUntil: 0,
  dragPreview: null,
  dragRejectTableId: null,
  recommendationTableScores: new Map(),
  recommendationGuestScore: null,
  recommendationOverallScore: null,
  recommendationPreviewScores: new Map(),
  guestsWithRecommendations: new Set(),
  undoStack: [],
  lastResetAt: 0,
  isResetting: false,
  flyingGuestIds: new Set(),

  loadEvent: async (eventId: string) => {
    set({ loading: true })
    try {
      const res = await fetch(`/api/events/${eventId}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load event')
      const data = await res.json()

      const guests = data.guests.map((g: any) => ({
        id: g.id,
        name: g.name,
        aliases: g.aliases || [],
        category: g.category || '',
        relationScore: g.relationScore,
        rsvpStatus: g.rsvpStatus,
        attendeeCount: g.attendeeCount,
        dietaryNote: g.dietaryNote || '',
        specialNote: g.specialNote || '',
        satisfactionScore: 0,
        assignedTableId: g.assignedTableId,
        seatIndex: g.seatIndex ?? null,
        isOverflow: g.isOverflow,
        isIsolated: g.isIsolated,
        seatPreferences: g.seatPreferences || [],
        guestTags: g.guestTags || [],
      }))
      const tables = data.tables as Table[]

      // 初始滿意度計算
      const result = recalculateAll(guests, tables, data.avoidPairs || [])
      for (const gs of result.guests) {
        const g = guests.find((gg: Guest) => gg.id === gs.id)
        if (g) g.satisfactionScore = gs.satisfactionScore
      }
      for (const ts of result.tables) {
        const t = tables.find((tt: Table) => tt.id === ts.id)
        if (t) t.averageSatisfaction = ts.averageSatisfaction
      }

      // 為沒有 seatIndex 的賓客自動分配座位索引
      for (const t of tables) {
        const tableGuests = guests.filter(
          (g: Guest) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed',
        )
        const needsIndex = tableGuests.filter((g: Guest) => g.seatIndex === null)
        if (needsIndex.length > 0) {
          // 找出已使用的座位索引
          const usedIndices = new Set(
            tableGuests.filter((g: Guest) => g.seatIndex !== null).map((g: Guest) => g.seatIndex!),
          )
          // 也要考慮眷屬佔的位子
          for (const g of tableGuests) {
            if (g.seatIndex !== null) {
              for (let c = 1; c < g.attendeeCount; c++) {
                usedIndices.add((g.seatIndex + c) % t.capacity)
              }
            }
          }
          let nextFree = 0
          for (const g of needsIndex) {
            while (usedIndices.has(nextFree)) nextFree++
            g.seatIndex = nextFree
            usedIndices.add(nextFree)
            for (let c = 1; c < g.attendeeCount; c++) {
              usedIndices.add(nextFree + c)
            }
            nextFree++
          }
        }
      }

      set({
        eventId: data.id,
        eventName: data.name,
        guests,
        tables,
        avoidPairs: data.avoidPairs || [],
        snapshots: data.snapshots || [],
        loading: false,
        selectedTableId: null,
        dragPreview: null,
        undoStack: [],
      })
    } catch (err) {
      console.error('Failed to load event:', err)
      set({ loading: false })
    }
  },

  setSelectedTable: (tableId) => set({ selectedTableId: tableId }),
  setHoveredGuest: (guestId, screenY) => set({ hoveredGuestId: guestId, hoveredGuestScreenY: screenY ?? null }),
  setActiveDragGuest: (guestId) => set({
    activeDragGuestId: guestId,
    dragPreview: guestId ? undefined : null,
    dragRejectTableId: guestId ? undefined : null,
    // drop 時抑制 hover 400ms，讓滿意度動畫播完
    hoverSuppressedUntil: guestId ? 0 : Date.now() + 400,
  }),

  moveGuest: (guestId, toTableId) => {
    const { guests, tables, undoStack, avoidPairs } = get()
    const guest = guests.find((g) => g.id === guestId)
    if (!guest) return

    const fromTableId = guest.assignedTableId

    // 記錄原始 seatIndex（用於 undo）
    const prevSeatIndices = new Map<string, number | null>()
    prevSeatIndices.set(guestId, guest.seatIndex)

    // 更新賓客位置（移除桌時清 seatIndex）
    const updatedGuests = guests.map((g) =>
      g.id === guestId ? { ...g, assignedTableId: toTableId, seatIndex: toTableId === null ? null : g.seatIndex } : g,
    )

    // 全量重算滿意度
    const result = recalculateAll(updatedGuests, tables, avoidPairs)
    const finalGuests = updatedGuests.map((g) => {
      const score = result.guests.find((gs) => gs.id === g.id)
      return score ? { ...g, satisfactionScore: score.satisfactionScore } : g
    })
    const finalTables = tables.map((t) => {
      const score = result.tables.find((ts) => ts.id === t.id)
      return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t
    })

    set({
      guests: finalGuests,
      tables: finalTables,
      dragPreview: null,
      undoStack: [...undoStack, { guestId, fromTableId, toTableId, prevSeatIndices }],
    })

    // 非同步存到後端（不 block UI）
    const { eventId } = get()
    if (eventId) {
      fetch(`/api/events/${eventId}/guests/${guestId}/table`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableId: toTableId, seatIndex: toTableId === null ? null : guest.seatIndex }),
      }).catch(console.error)
    }
  },

  moveGuestToSeat: (guestId, tableId, seatIndex, cursorBias) => {
    const { guests, tables, undoStack, avoidPairs } = get()
    const guest = guests.find((g) => g.id === guestId)
    if (!guest) return

    const fromTableId = guest.assignedTableId
    const table = tables.find((t) => t.id === tableId)
    if (!table) return

    // 記錄所有可能受影響的 seatIndex（用於 undo）
    const prevSeatIndices = new Map<string, number | null>()
    prevSeatIndices.set(guestId, guest.seatIndex)

    // 建立目標桌的 slot 陣列（排除正在拖的賓客）
    const tableGuests = guests.filter(
      (g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed' && g.id !== guestId,
    )
    for (const g of tableGuests) {
      prevSeatIndices.set(g.id, g.seatIndex)
    }

    const seatGuests = tableGuests
      .filter((g) => g.seatIndex !== null)
      .map((g) => ({ id: g.id, seatIndex: g.seatIndex!, attendeeCount: g.attendeeCount }))

    const slots = buildSlotArray(seatGuests, table.capacity)
    const newSlots = placeGuest(slots, seatIndex, guestId, guest.attendeeCount, cursorBias)

    if (!newSlots) return // 無法放置

    // 提取新的 seatIndex mapping
    const newIndices = extractSeatIndices(newSlots)

    // 更新所有賓客
    const updatedGuests = guests.map((g) => {
      if (g.id === guestId) {
        return { ...g, assignedTableId: tableId, seatIndex: newIndices.get(guestId) ?? seatIndex }
      }
      if (newIndices.has(g.id)) {
        return { ...g, seatIndex: newIndices.get(g.id)! }
      }
      return g
    })

    // 全量重算滿意度
    const result = recalculateAll(updatedGuests, tables, avoidPairs)
    const finalGuests = updatedGuests.map((g) => {
      const score = result.guests.find((gs) => gs.id === g.id)
      return score ? { ...g, satisfactionScore: score.satisfactionScore } : g
    })
    const finalTables = tables.map((t) => {
      const score = result.tables.find((ts) => ts.id === t.id)
      return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t
    })

    set({
      guests: finalGuests,
      tables: finalTables,
      dragPreview: null,
      undoStack: [...undoStack, { guestId, fromTableId, toTableId: tableId, prevSeatIndices }],
    })

    // 非同步存到後端 — 所有受影響的賓客
    const { eventId } = get()
    if (eventId) {
      // 被拖的賓客
      fetch(`/api/events/${eventId}/guests/${guestId}/table`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableId, seatIndex: newIndices.get(guestId) ?? seatIndex }),
      }).catch(console.error)

      // 被位移的同桌賓客
      for (const [id, newIdx] of newIndices) {
        if (id !== guestId) {
          const prev = prevSeatIndices.get(id)
          if (prev !== newIdx) {
            fetch(`/api/events/${eventId}/guests/${id}/table`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ tableId, seatIndex: newIdx }),
            }).catch(console.error)
          }
        }
      }
    }
  },

  setDragPreview: (tableId, seatIndex, draggedGuestId, cursorBias) => {
    if (!tableId || seatIndex === undefined || !draggedGuestId) {
      set({ dragPreview: null, dragRejectTableId: null })
      return
    }

    const { guests, tables, avoidPairs } = get()
    const table = tables.find((t) => t.id === tableId)
    const draggedGuest = guests.find((g) => g.id === draggedGuestId)
    if (!table || !draggedGuest) {
      set({ dragPreview: null, dragRejectTableId: null })
      return
    }

    // 建立 slot 陣列（排除被拖的賓客）
    const tableGuests = guests.filter(
      (g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed' && g.id !== draggedGuestId,
    )
    const seatGuests = tableGuests
      .filter((g) => g.seatIndex !== null)
      .map((g) => ({ id: g.id, seatIndex: g.seatIndex!, attendeeCount: g.attendeeCount }))

    const slots = buildSlotArray(seatGuests, table.capacity)
    const newSlots = placeGuest(slots, seatIndex, draggedGuestId, draggedGuest.attendeeCount, cursorBias)

    if (!newSlots) {
      // 無法放置 — 區分原因：真的滿桌 vs 不可移動的位子
      const emptySlots = slots.filter((s) => s === null).length
      const isTrulyFull = emptySlots < draggedGuest.attendeeCount
      set({ dragPreview: null, dragRejectTableId: isTrulyFull ? tableId : null })
      return
    }

    // 計算預覽滿意度：模擬被拖賓客放到目標位後的分數
    const newIndices = extractSeatIndices(newSlots)
    const previewGuests = guests.map((g) => {
      if (g.id === draggedGuestId) {
        return { ...g, assignedTableId: tableId, seatIndex: newIndices.get(g.id) ?? seatIndex }
      }
      if (newIndices.has(g.id)) {
        return { ...g, seatIndex: newIndices.get(g.id)! }
      }
      return g
    })
    const previewResult = recalculateAll(previewGuests, tables, avoidPairs)

    const previewScores = new Map<string, number>()
    for (const gs of previewResult.guests) previewScores.set(gs.id, gs.satisfactionScore)
    const previewTableScores = new Map<string, number>()
    for (const ts of previewResult.tables) previewTableScores.set(ts.id, ts.averageSatisfaction)

    // 目標位留空 — 被拖的賓客跟著游標（DragOverlay），不顯示在桌上
    for (let i = 0; i < newSlots.length; i++) {
      if (newSlots[i]?.guestId === draggedGuestId) {
        newSlots[i] = null
      }
    }

    set({
      dragPreview: {
        tableId,
        previewSlots: newSlots,
        draggedGuestId,
        previewScores,
        previewTableScores,
      },
      dragRejectTableId: null,
    })
  },

  undo: () => {
    const { undoStack, guests, tables, eventId, avoidPairs } = get()
    if (undoStack.length === 0) return

    const last = undoStack[undoStack.length - 1]

    // ─── 還原「新增桌」：刪掉該桌 ───
    if (last.type === 'add-table') {
      const tableId = last.tableId
      const tableGuests = guests.filter((g) => g.assignedTableId === tableId)
      const updatedGuests = guests.map((g) =>
        g.assignedTableId === tableId ? { ...g, assignedTableId: undefined as string | undefined, seatIndex: null } : g,
      )
      set({
        tables: tables.filter((t) => t.id !== tableId),
        guests: updatedGuests,
        undoStack: undoStack.slice(0, -1),
        selectedTableId: get().selectedTableId === tableId ? null : get().selectedTableId,
      })
      if (eventId) {
        for (const g of tableGuests) {
          fetch(`/api/events/${eventId}/guests/${g.id}/table`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ tableId: null, seatIndex: null }),
          }).catch(console.error)
        }
        fetch(`/api/events/${eventId}/tables/${tableId}`, {
          method: 'DELETE',
          credentials: 'include',
        }).catch(console.error)
      }
      return
    }

    // ─── 還原「移動桌子」：回到原始位置 ───
    if (last.type === 'move-table') {
      const { tableId, fromX, fromY } = last
      set({
        tables: tables.map((t) => t.id === tableId ? { ...t, positionX: fromX, positionY: fromY } : t),
        undoStack: undoStack.slice(0, -1),
      })
      if (eventId) {
        fetch(`/api/events/${eventId}/tables/${tableId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ positionX: fromX, positionY: fromY }),
        }).catch(console.error)
      }
      return
    }

    // ─── 還原「改桌名」 ───
    if (last.type === 'rename-table') {
      const { tableId, oldName } = last
      set({
        tables: tables.map((t) => t.id === tableId ? { ...t, name: oldName } : t),
        undoStack: undoStack.slice(0, -1),
      })
      if (eventId) {
        fetch(`/api/events/${eventId}/tables/${tableId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: oldName }),
        }).catch(console.error)
      }
      return
    }

    // ─── 還原「自動排列」：所有桌子回到原始位置 ───
    if (last.type === 'auto-arrange') {
      const updatedTables = tables.map((t) => {
        const prev = last.positions.get(t.id)
        return prev ? { ...t, positionX: prev.fromX, positionY: prev.fromY } : t
      })
      set({ tables: updatedTables, undoStack: undoStack.slice(0, -1) })
      if (eventId) {
        for (const [tableId, { fromX, fromY }] of last.positions) {
          fetch(`/api/events/${eventId}/tables/${tableId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ positionX: fromX, positionY: fromY }),
          }).catch(console.error)
        }
      }
      return
    }

    // ─── 還原「自動分配」：賓客回到原始桌次 + 刪除自動新增的桌子 ───
    if (last.type === 'auto-assign') {
      // 還原賓客分配
      const updatedGuests = guests.map((g) => {
        const orig = last.assignments.find((a) => a.guestId === g.id)
        return orig ? { ...g, assignedTableId: orig.fromTableId, seatIndex: null } : g
      })
      // 刪除自動新增的桌子
      const remainingTables = tables.filter((t) => !last.createdTableIds.includes(t.id))
      const result = recalculateAll(updatedGuests, remainingTables, avoidPairs)
      const finalGuests = updatedGuests.map((g) => {
        const score = result.guests.find((gs) => gs.id === g.id)
        return score ? { ...g, satisfactionScore: score.satisfactionScore } : g
      })
      const finalTables = remainingTables.map((t) => {
        const score = result.tables.find((ts) => ts.id === t.id)
        return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t
      })
      set({ guests: finalGuests, tables: finalTables, undoStack: undoStack.slice(0, -1) })
      if (eventId) {
        for (const a of last.assignments) {
          fetch(`/api/events/${eventId}/guests/${a.guestId}/table`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ tableId: a.fromTableId, seatIndex: null }),
          }).catch(console.error)
        }
        // 刪除自動新增的桌子
        for (const tableId of last.createdTableIds) {
          fetch(`/api/events/${eventId}/tables/${tableId}`, {
            method: 'DELETE',
            credentials: 'include',
          }).catch(console.error)
        }
      }
      return
    }

    // ─── 還原「移動賓客」 ───
    // 批次還原：如果最後一筆有 batchId，找出所有同 batch 的 entry 一起還原
    const entriesToUndo = last.batchId
      ? undoStack.filter((e) => e.type !== 'add-table' && e.batchId === last.batchId)
      : [last]
    const remainingStack = last.batchId
      ? undoStack.filter((e) => e.type === 'add-table' || e.batchId !== last.batchId)
      : undoStack.slice(0, -1)

    // 還原所有受影響賓客的 seatIndex + tableId
    let updatedGuests = [...guests]
    for (const entry of entriesToUndo) {
      if (entry.type === 'add-table') continue
      updatedGuests = updatedGuests.map((g) => {
        if (g.id === entry.guestId) {
          const prevIdx = entry.prevSeatIndices.get(g.id) ?? null
          return { ...g, assignedTableId: entry.fromTableId, seatIndex: prevIdx }
        }
        if (entry.prevSeatIndices.has(g.id)) {
          return { ...g, seatIndex: entry.prevSeatIndices.get(g.id) ?? null }
        }
        return g
      })
    }

    // 全量重算
    const result = recalculateAll(updatedGuests, tables, avoidPairs)
    const finalGuests = updatedGuests.map((g) => {
      const score = result.guests.find((gs) => gs.id === g.id)
      return score ? { ...g, satisfactionScore: score.satisfactionScore } : g
    })
    const finalTables = tables.map((t) => {
      const score = result.tables.find((ts) => ts.id === t.id)
      return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t
    })

    set({
      guests: finalGuests,
      tables: finalTables,
      undoStack: remainingStack,
    })

    // 後端同步：還原所有受影響的賓客（批次還原時要同步每一筆）
    if (eventId) {
      const synced = new Set<string>()
      for (const entry of entriesToUndo) {
        if (entry.type === 'add-table') continue
        // 被拖的賓客
        if (!synced.has(entry.guestId)) {
          synced.add(entry.guestId)
          const prevIdx = entry.prevSeatIndices.get(entry.guestId) ?? null
          fetch(`/api/events/${eventId}/guests/${entry.guestId}/table`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ tableId: entry.fromTableId, seatIndex: prevIdx }),
          }).catch(console.error)
        }
        // 其他被位移的賓客
        for (const [id, idx] of entry.prevSeatIndices) {
          if (id !== entry.guestId && !synced.has(id)) {
            synced.add(id)
            const currentGuest = guests.find((g) => g.id === id)
            if (currentGuest && currentGuest.seatIndex !== idx) {
              fetch(`/api/events/${eventId}/guests/${id}/table`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ tableId: currentGuest.assignedTableId, seatIndex: idx }),
              }).catch(console.error)
            }
          }
        }
      }
    }
  },

  removeTable: async (tableId) => {
    const { eventId, tables, guests, selectedTableId } = get()
    if (!eventId) return

    // 先把所有桌上的賓客移回未安排
    const tableGuests = guests.filter((g) => g.assignedTableId === tableId)
    const updatedGuests = guests.map((g) =>
      g.assignedTableId === tableId ? { ...g, assignedTableId: undefined } : g,
    )

    set({
      tables: tables.filter((t) => t.id !== tableId),
      guests: updatedGuests,
      selectedTableId: selectedTableId === tableId ? null : selectedTableId,
    })

    // 回寫 API：移除桌上賓客
    await Promise.all(
      tableGuests.map((g) =>
        fetch(`/api/events/${eventId}/guests/${g.id}/seat`, {
          method: 'DELETE',
          credentials: 'include',
        }).catch(console.error),
      ),
    )

    await fetch(`/api/events/${eventId}/tables/${tableId}`, {
      method: 'DELETE',
      credentials: 'include',
    }).catch(console.error)
  },

  addTable: async (name, positionX, positionY) => {
    const { eventId, tables } = get()
    if (!eventId) return

    const res = await fetch(`/api/events/${eventId}/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, positionX, positionY }),
    })
    if (!res.ok) return

    const table = await res.json()
    set({ tables: [...tables, table], undoStack: [...get().undoStack, { type: 'add-table' as const, tableId: table.id }] })
  },

  clearTable: (tableId) => {
    const { guests, tables, avoidPairs, eventId, undoStack } = get()
    const tableGuests = guests.filter((g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed')
    if (tableGuests.length === 0) return

    const batchId = `clear-${tableId}-${Date.now()}`
    const undoEntries = tableGuests.map((g) => ({
      guestId: g.id,
      fromTableId: g.assignedTableId ?? null,
      toTableId: null as string | null,
      prevSeatIndices: new Map<string, number | null>([[g.id, g.seatIndex ?? null]]),
      batchId,
    }))

    const updatedGuests = guests.map((g) =>
      g.assignedTableId === tableId ? { ...g, assignedTableId: null as string | undefined | null, seatIndex: null, satisfactionScore: g.rsvpStatus === 'confirmed' ? 55 : 0 } : g,
    )
    const result = recalculateAll(updatedGuests, tables, avoidPairs)
    const finalGuests = updatedGuests.map((g) => {
      const score = result.guests.find((gs) => gs.id === g.id)
      return score ? { ...g, satisfactionScore: score.satisfactionScore } : g
    })
    const finalTables = tables.map((t) => {
      const score = result.tables.find((ts) => ts.id === t.id)
      return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t
    })

    set({ guests: finalGuests, tables: finalTables, undoStack: [...undoStack, ...undoEntries] })

    if (eventId) {
      for (const g of tableGuests) {
        fetch(`/api/events/${eventId}/guests/${g.id}/table`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ tableId: null, seatIndex: null }),
        }).catch(console.error)
      }
    }
  },

  resetAllSeats: () => {
    const { guests, tables, avoidPairs, eventId, undoStack } = get()
    const assigned = guests.filter((g) => g.assignedTableId)
    if (assigned.length === 0) return

    // 把每位已安排賓客的狀態推入 undoStack，共享 batchId 讓「還原」一次全部回來
    const batchId = `reset-${Date.now()}`
    const undoEntries = assigned.map((g) => ({
      guestId: g.id,
      fromTableId: g.assignedTableId ?? null,
      toTableId: null as string | null,
      prevSeatIndices: new Map<string, number | null>([[g.id, g.seatIndex ?? null]]),
      batchId,
    }))

    const updatedGuests = guests.map((g) => ({
      ...g,
      assignedTableId: null as string | undefined | null,
      seatIndex: null,
      satisfactionScore: g.rsvpStatus === 'confirmed' ? 55 : 0,
    }))
    const updatedTables = tables.map((t) => ({ ...t, averageSatisfaction: 0 }))

    set({ guests: updatedGuests, tables: updatedTables, selectedTableId: null, undoStack: [...undoStack, ...undoEntries], lastResetAt: Date.now(), isResetting: false })

    // 批次清除後端座位分配
    if (eventId) {
      Promise.all(
        assigned.map((g) =>
          fetch(`/api/events/${eventId}/guests/${g.id}/table`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ tableId: null, seatIndex: null }),
          }).catch(console.error),
        ),
      )
    }
  },

  updateEventName: (name) => {
    const { eventId } = get()
    set({ eventName: name })
    if (!eventId) return
    fetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name }),
    }).catch(console.error)
  },

  updateTableName: (tableId, name) => {
    const { eventId, tables, undoStack } = get()
    const oldName = tables.find((t) => t.id === tableId)?.name
    set({
      tables: tables.map((t) => t.id === tableId ? { ...t, name } : t),
      undoStack: oldName !== undefined && oldName !== name
        ? [...undoStack, { type: 'rename-table' as const, tableId, oldName, newName: name }]
        : undoStack,
    })
    if (!eventId) return
    fetch(`/api/events/${eventId}/tables/${tableId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name }),
    }).catch(console.error)
  },

  updateTablePosition: (tableId, x, y) => {
    const { tables } = get()
    // 只更新本地狀態，不打 API（拖曳中會頻繁呼叫）
    set({
      tables: tables.map((t) =>
        t.id === tableId ? { ...t, positionX: x, positionY: y } : t,
      ),
    })
  },

  saveTablePosition: (tableId, fromX?, fromY?) => {
    const { tables, eventId, undoStack } = get()
    if (!eventId) return
    const table = tables.find((t) => t.id === tableId)
    if (!table) return

    // 推入 undo（有提供原始位置且確實移動過時）
    if (fromX !== undefined && fromY !== undefined && (fromX !== table.positionX || fromY !== table.positionY)) {
      set({ undoStack: [...undoStack, { type: 'move-table' as const, tableId, fromX, fromY, toX: table.positionX, toY: table.positionY }] })
    }

    fetch(`/api/events/${eventId}/tables/${tableId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ positionX: table.positionX, positionY: table.positionY }),
    }).catch(console.error)
  },

  autoArrangeTables: async (positions) => {
    const { tables, eventId, undoStack } = get()
    // 記錄原始位置（undo 用）
    const prevPositions = new Map<string, { fromX: number; fromY: number }>()
    for (const t of tables) prevPositions.set(t.id, { fromX: t.positionX, fromY: t.positionY })

    // 更新 store
    const updatedTables = tables.map((t) => {
      const pos = positions.find((p) => p.tableId === t.id)
      return pos ? { ...t, positionX: pos.x, positionY: pos.y } : t
    })
    set({
      tables: updatedTables,
      undoStack: [...undoStack, { type: 'auto-arrange' as const, positions: prevPositions }],
    })

    // 批次存 DB
    if (eventId) {
      try {
        await Promise.all(
          positions.map((p) =>
            fetch(`/api/events/${eventId}/tables/${p.tableId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ positionX: p.x, positionY: p.y }),
            }).then((res) => { if (!res.ok) throw new Error(`Save failed: ${p.tableId}`) }),
          ),
        )
      } catch {
        // 失敗 → 自動 revert
        const reverted = get().tables.map((t) => {
          const prev = prevPositions.get(t.id)
          return prev ? { ...t, positionX: prev.fromX, positionY: prev.fromY } : t
        })
        set({ tables: reverted, undoStack: get().undoStack.slice(0, -1) })
        throw new Error('保存失敗，已恢復原排列')
      }
    }
  },

  autoAssignGuests: async () => {
    const { guests, tables, avoidPairs, undoStack, eventId } = get()
    const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed')
    const unassigned = confirmed.filter((g) => !g.assignedTableId)
    if (unassigned.length === 0) return

    // 檢查容量是否足夠，不夠就自動新增桌子
    const totalSeatsNeeded = unassigned.reduce((s, g) => s + g.attendeeCount, 0)
    const totalRemaining = tables.reduce((s, t) => {
      const seated = confirmed.filter((g) => g.assignedTableId === t.id)
      const used = seated.reduce((ss, g) => ss + g.attendeeCount, 0)
      return s + Math.max(0, t.capacity - used)
    }, 0)

    let currentTables = tables
    const newTableIds: string[] = []
    if (totalSeatsNeeded > totalRemaining) {
      const deficit = totalSeatsNeeded - totalRemaining
      const defaultCapacity = 10
      const tablesToAdd = Math.ceil(deficit / defaultCapacity)
      const existingCount = tables.length

      for (let i = 0; i < tablesToAdd; i++) {
        const currentTbls = get().tables
        const num = currentTbls.length + 1
        const pos = findFreePosition(currentTbls)
        const name = `第${num}桌`

        await get().addTable(name, pos.x, pos.y)
        const latestTables = get().tables
        const newTable = latestTables.find((t) => t.name === name)
        if (newTable) newTableIds.push(newTable.id)
      }
      // 重新讀取最新的 tables
      currentTables = get().tables
    }

    const latestGuests = get().guests
    const assignments = runAutoAssign(latestGuests, currentTables, avoidPairs)
    if (assignments.length === 0) return

    // 記錄原始分配（undo 用）
    const undoData = assignments.map((a) => ({
      guestId: a.guestId,
      fromTableId: latestGuests.find((g) => g.id === a.guestId)?.assignedTableId || null,
    }))

    // 更新 store：設定 assignedTableId + 自動分配 seatIndex
    const updatedGuests = latestGuests.map((g) => {
      const assignment = assignments.find((a) => a.guestId === g.id)
      return assignment ? { ...g, assignedTableId: assignment.tableId } : g
    })

    // 為新分配的賓客自動分配 seatIndex
    for (const t of currentTables) {
      const tableGuests = updatedGuests.filter(
        (g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed',
      )
      const needsIndex = tableGuests.filter((g) => g.seatIndex === null)
      if (needsIndex.length === 0) continue

      const usedIndices = new Set<number>()
      for (const g of tableGuests) {
        if (g.seatIndex !== null) {
          usedIndices.add(g.seatIndex)
          for (let c = 1; c < g.attendeeCount; c++) {
            usedIndices.add((g.seatIndex + c) % t.capacity)
          }
        }
      }
      let nextFree = 0
      for (const g of needsIndex) {
        while (usedIndices.has(nextFree)) nextFree++
        g.seatIndex = nextFree
        usedIndices.add(nextFree)
        for (let c = 1; c < g.attendeeCount; c++) {
          usedIndices.add(nextFree + c)
        }
        nextFree++
      }
    }

    // 重算滿意度
    const result = recalculateAll(updatedGuests, currentTables, avoidPairs)
    const finalGuests = updatedGuests.map((g) => {
      const score = result.guests.find((gs) => gs.id === g.id)
      return score ? { ...g, satisfactionScore: score.satisfactionScore } : g
    })
    const finalTables = currentTables.map((t) => {
      const score = result.tables.find((ts) => ts.id === t.id)
      return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t
    })

    // 移除 addTable 推入的個別 undo entries（合併到 auto-assign 的 compound undo）
    const currentStack = get().undoStack.filter(
      (entry) => !(entry.type === 'add-table' && newTableIds.includes(entry.tableId))
    )

    set({
      guests: finalGuests,
      tables: finalTables,
      undoStack: [...currentStack, { type: 'auto-assign' as const, assignments: undoData, createdTableIds: newTableIds }],
    })

    // 存 DB
    if (eventId) {
      try {
        await Promise.all(
          assignments.map((a) => {
            const guest = finalGuests.find((g) => g.id === a.guestId)
            return fetch(`/api/events/${eventId}/guests/${a.guestId}/table`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ tableId: a.tableId, seatIndex: guest?.seatIndex ?? null }),
            }).then((res) => { if (!res.ok) throw new Error(`Save failed: ${a.guestId}`) })
          }),
        )
      } catch {
        // 失敗 → 自動 revert
        const reverted = get().guests.map((g) => {
          const orig = undoData.find((u) => u.guestId === g.id)
          return orig ? { ...g, assignedTableId: orig.fromTableId } : g
        })
        const revertResult = recalculateAll(reverted, tables, avoidPairs)
        const revertedGuests = reverted.map((g) => {
          const score = revertResult.guests.find((gs) => gs.id === g.id)
          return score ? { ...g, satisfactionScore: score.satisfactionScore } : g
        })
        set({ guests: revertedGuests, undoStack: get().undoStack.slice(0, -1) })
        throw new Error('保存失敗，已恢復原排列')
      }
    }
  },

  saveSnapshot: async (name) => {
    const { eventId, guests, tables, snapshots } = get()
    if (!eventId) return

    const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed')
    const assignedScores = confirmed.filter((g) => g.assignedTableId)
    const avg = assignedScores.length > 0
      ? Math.round((assignedScores.reduce((s, g) => s + g.satisfactionScore, 0) / assignedScores.length) * 10) / 10
      : 0

    const data = {
      guests: confirmed.map((g) => ({
        guestId: g.id,
        tableId: g.assignedTableId,
        seatIndex: g.seatIndex,
        satisfactionScore: g.satisfactionScore,
        isOverflow: g.isOverflow,
      })),
      tables: tables.map((t) => ({
        tableId: t.id,
        name: t.name,
        positionX: t.positionX,
        positionY: t.positionY,
      })),
    }

    const res = await fetch(`/api/events/${eventId}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, data, averageSatisfaction: avg }),
    })
    if (!res.ok) return
    const snapshot = await res.json()
    set({ snapshots: [snapshot, ...snapshots] })
  },

  restoreSnapshot: (snapshotId) => {
    const { snapshots, guests, tables, avoidPairs } = get()
    const snapshot = snapshots.find((s) => s.id === snapshotId)
    if (!snapshot) return

    const snapData = snapshot.data as {
      guests: Array<{ guestId: string; tableId: string | null; seatIndex?: number | null; satisfactionScore: number }>
      tables: Array<{ tableId: string; name?: string; positionX: number; positionY: number }>
    }

    // 還原賓客分配
    const restoredGuests = guests.map((g) => {
      const sg = snapData.guests.find((sg) => sg.guestId === g.id)
      if (sg) {
        return { ...g, assignedTableId: sg.tableId, seatIndex: sg.seatIndex ?? null, satisfactionScore: sg.satisfactionScore }
      }
      return g
    })

    // 還原桌次位置：只保留快照裡有的桌（快照後新增的桌一律刪除）
    const snapshotTableIds = new Set(snapData.tables.map((st) => st.tableId))
    const restoredTables = tables
      .filter((t) => snapshotTableIds.has(t.id))
      .map((t) => {
        const st = snapData.tables.find((st) => st.tableId === t.id)!
        return { ...t, positionX: st.positionX, positionY: st.positionY, ...(st.name ? { name: st.name } : {}) }
      })

    // 重算滿意度（確保一致）
    const result = recalculateAll(restoredGuests, restoredTables, avoidPairs)
    const finalGuests = restoredGuests.map((g) => {
      const score = result.guests.find((gs) => gs.id === g.id)
      return score ? { ...g, satisfactionScore: score.satisfactionScore } : g
    })
    const finalTables = restoredTables.map((t) => {
      const score = result.tables.find((ts) => ts.id === t.id)
      return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t
    })

    // 快照後新增、需要刪除的桌
    const extraTableIds = tables.filter((t) => !snapshotTableIds.has(t.id)).map((t) => t.id)

    set({ guests: finalGuests, tables: finalTables, undoStack: [] })

    // 後端同步
    const { eventId } = get()
    if (eventId) {
      // 還原賓客座位
      for (const sg of snapData.guests) {
        fetch(`/api/events/${eventId}/guests/${sg.guestId}/table`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ tableId: sg.tableId, seatIndex: sg.seatIndex ?? null }),
        }).catch(console.error)
      }
      // 刪除快照後新增的桌
      for (const tableId of extraTableIds) {
        fetch(`/api/events/${eventId}/tables/${tableId}`, {
          method: 'DELETE',
          credentials: 'include',
        }).catch(console.error)
      }
    }
  },

  addAvoidPair: async (guestAId, guestBId, reason) => {
    const { eventId, avoidPairs } = get()
    if (!eventId) return

    const res = await fetch(`/api/events/${eventId}/avoid-pairs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ guestAId, guestBId, reason }),
    })
    if (!res.ok) return
    const pair = await res.json()
    set({ avoidPairs: [...avoidPairs, pair] })
  },

  removeAvoidPair: async (pairId) => {
    const { eventId, avoidPairs } = get()
    if (!eventId) return

    await fetch(`/api/events/${eventId}/avoid-pairs/${pairId}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    set({ avoidPairs: avoidPairs.filter((ap) => ap.id !== pairId) })
  },

  checkAvoidViolation: (guestId, tableId) => {
    const { guests, avoidPairs } = get()
    const tableGuestIds = guests
      .filter((g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed')
      .map((g) => g.id)

    return avoidPairs.find((ap) =>
      (ap.guestAId === guestId && tableGuestIds.includes(ap.guestBId)) ||
      (ap.guestBId === guestId && tableGuestIds.includes(ap.guestAId))
    ) || null
  },

  // Computed
  getTableGuests: (tableId) => {
    return get().guests.filter(
      (g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed',
    )
  },

  getUnassignedGuests: () => {
    return get().guests.filter(
      (g) => g.assignedTableId === null && g.rsvpStatus === 'confirmed',
    )
  },

  getTableSeatCount: (tableId) => {
    return get()
      .guests.filter((g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed')
      .reduce((sum, g) => sum + g.attendeeCount, 0)
  },

  getTotalAssignedSeats: () => {
    return get()
      .guests.filter((g) => g.assignedTableId !== null && g.rsvpStatus === 'confirmed')
      .reduce((sum, g) => sum + g.attendeeCount, 0)
  },

  getTotalConfirmedSeats: () => {
    return get()
      .guests.filter((g) => g.rsvpStatus === 'confirmed')
      .reduce((sum, g) => sum + g.attendeeCount, 0)
  },
}))
