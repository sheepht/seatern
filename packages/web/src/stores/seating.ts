import { create } from 'zustand'
import { recalculateAll } from '@/lib/satisfaction'
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

  // Undo stack
  undoStack: Array<{
    guestId: string
    fromTableId: string | null
    toTableId: string | null
    prevSeatIndices: Map<string, number | null>
  }>

  // Actions
  loadEvent: (eventId: string) => Promise<void>
  setSelectedTable: (tableId: string | null) => void
  setHoveredGuest: (guestId: string | null) => void
  setActiveDragGuest: (guestId: string | null) => void
  moveGuest: (guestId: string, toTableId: string | null) => void
  moveGuestToSeat: (guestId: string, tableId: string, seatIndex: number, cursorBias?: 'left' | 'right') => void
  setDragPreview: (tableId: string | null, seatIndex?: number, draggedGuestId?: string, cursorBias?: 'left' | 'right') => void
  undo: () => void
  addTable: (name: string, positionX: number, positionY: number) => Promise<void>
  updateTablePosition: (tableId: string, x: number, y: number) => void
  saveTablePosition: (tableId: string) => void
  saveSnapshot: (name: string) => Promise<void>
  restoreSnapshot: (snapshotId: string) => void
  addAvoidPair: (guestAId: string, guestBId: string, reason?: string) => Promise<void>
  removeAvoidPair: (pairId: string) => Promise<void>
  checkAvoidViolation: (guestId: string, tableId: string) => AvoidPair | null

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
  loading: false,
  activeDragGuestId: null,
  hoverSuppressedUntil: 0,
  dragPreview: null,
  dragRejectTableId: null,
  recommendationTableScores: new Map(),
  undoStack: [],

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
      const result = recalculateAll(guests, tables)
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
  setHoveredGuest: (guestId) => set({ hoveredGuestId: guestId }),
  setActiveDragGuest: (guestId) => set({
    activeDragGuestId: guestId,
    dragPreview: guestId ? undefined : null,
    dragRejectTableId: guestId ? undefined : null,
    // drop 時抑制 hover 400ms，讓滿意度動畫播完
    hoverSuppressedUntil: guestId ? 0 : Date.now() + 400,
  }),

  moveGuest: (guestId, toTableId) => {
    const { guests, tables, undoStack } = get()
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
    const result = recalculateAll(updatedGuests, tables)
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
    const { guests, tables, undoStack } = get()
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
    const result = recalculateAll(updatedGuests, tables)
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

    const { guests, tables } = get()
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
    const previewResult = recalculateAll(previewGuests, tables)

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
    const { undoStack, guests, tables, eventId } = get()
    if (undoStack.length === 0) return

    const last = undoStack[undoStack.length - 1]

    // 還原所有受影響賓客的 seatIndex + tableId
    const updatedGuests = guests.map((g) => {
      if (g.id === last.guestId) {
        const prevIdx = last.prevSeatIndices.get(g.id) ?? null
        return { ...g, assignedTableId: last.fromTableId, seatIndex: prevIdx }
      }
      if (last.prevSeatIndices.has(g.id)) {
        return { ...g, seatIndex: last.prevSeatIndices.get(g.id) ?? null }
      }
      return g
    })

    // 全量重算
    const result = recalculateAll(updatedGuests, tables)
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
      undoStack: undoStack.slice(0, -1),
    })

    // 後端同步：還原所有受影響的賓客
    if (eventId) {
      // 被拖的賓客
      const prevIdx = last.prevSeatIndices.get(last.guestId) ?? null
      fetch(`/api/events/${eventId}/guests/${last.guestId}/table`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableId: last.fromTableId, seatIndex: prevIdx }),
      }).catch(console.error)

      // 其他被位移的賓客
      for (const [id, idx] of last.prevSeatIndices) {
        if (id !== last.guestId) {
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
    set({ tables: [...tables, table] })
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

  saveTablePosition: (tableId) => {
    const { tables, eventId } = get()
    if (!eventId) return
    const table = tables.find((t) => t.id === tableId)
    if (!table) return

    fetch(`/api/events/${eventId}/tables/${tableId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ positionX: table.positionX, positionY: table.positionY }),
    }).catch(console.error)
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
    const { snapshots, guests, tables } = get()
    const snapshot = snapshots.find((s) => s.id === snapshotId)
    if (!snapshot) return

    const snapData = snapshot.data as {
      guests: Array<{ guestId: string; tableId: string | null; seatIndex?: number | null; satisfactionScore: number }>
      tables: Array<{ tableId: string; positionX: number; positionY: number }>
    }

    // 還原賓客分配
    const restoredGuests = guests.map((g) => {
      const sg = snapData.guests.find((sg) => sg.guestId === g.id)
      if (sg) {
        return { ...g, assignedTableId: sg.tableId, seatIndex: sg.seatIndex ?? null, satisfactionScore: sg.satisfactionScore }
      }
      return g
    })

    // 還原桌次位置
    const restoredTables = tables.map((t) => {
      const st = snapData.tables.find((st) => st.tableId === t.id)
      if (st) {
        return { ...t, positionX: st.positionX, positionY: st.positionY }
      }
      return t
    })

    // 重算滿意度（確保一致）
    const result = recalculateAll(restoredGuests, restoredTables)
    const finalGuests = restoredGuests.map((g) => {
      const score = result.guests.find((gs) => gs.id === g.id)
      return score ? { ...g, satisfactionScore: score.satisfactionScore } : g
    })
    const finalTables = restoredTables.map((t) => {
      const score = result.tables.find((ts) => ts.id === t.id)
      return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t
    })

    set({ guests: finalGuests, tables: finalTables, undoStack: [] })

    // 後端同步：逐一更新賓客的 tableId + seatIndex
    const { eventId } = get()
    if (eventId) {
      for (const sg of snapData.guests) {
        fetch(`/api/events/${eventId}/guests/${sg.guestId}/table`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ tableId: sg.tableId, seatIndex: sg.seatIndex ?? null }),
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
