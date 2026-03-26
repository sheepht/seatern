import { create } from 'zustand'
import { recalculateAll } from '@/lib/satisfaction'

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

  // Undo stack
  undoStack: Array<{ guestId: string; fromTableId: string | null; toTableId: string | null }>

  // Actions
  loadEvent: (eventId: string) => Promise<void>
  setSelectedTable: (tableId: string | null) => void
  setHoveredGuest: (guestId: string | null) => void
  moveGuest: (guestId: string, toTableId: string | null) => void
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

      set({
        eventId: data.id,
        eventName: data.name,
        guests,
        tables,
        avoidPairs: data.avoidPairs || [],
        snapshots: data.snapshots || [],
        loading: false,
        selectedTableId: null,
        undoStack: [],
      })
    } catch (err) {
      console.error('Failed to load event:', err)
      set({ loading: false })
    }
  },

  setSelectedTable: (tableId) => set({ selectedTableId: tableId }),
  setHoveredGuest: (guestId) => set({ hoveredGuestId: guestId }),

  moveGuest: (guestId, toTableId) => {
    const { guests, tables, undoStack } = get()
    const guest = guests.find((g) => g.id === guestId)
    if (!guest) return

    const fromTableId = guest.assignedTableId

    // 更新賓客位置
    const updatedGuests = guests.map((g) =>
      g.id === guestId ? { ...g, assignedTableId: toTableId } : g,
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
      undoStack: [...undoStack, { guestId, fromTableId, toTableId }],
    })

    // 非同步存到後端（不 block UI）
    const { eventId } = get()
    if (eventId) {
      fetch(`/api/events/${eventId}/guests/${guestId}/table`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableId: toTableId }),
      }).catch(console.error)
    }
  },

  undo: () => {
    const { undoStack, guests, tables, eventId } = get()
    if (undoStack.length === 0) return

    const last = undoStack[undoStack.length - 1]
    const updatedGuests = guests.map((g) =>
      g.id === last.guestId ? { ...g, assignedTableId: last.fromTableId } : g,
    )

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

    // 後端同步
    if (eventId) {
      fetch(`/api/events/${eventId}/guests/${last.guestId}/table`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tableId: last.fromTableId }),
      }).catch(console.error)
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
      guests: Array<{ guestId: string; tableId: string | null; satisfactionScore: number }>
      tables: Array<{ tableId: string; positionX: number; positionY: number }>
    }

    // 還原賓客分配
    const restoredGuests = guests.map((g) => {
      const sg = snapData.guests.find((sg) => sg.guestId === g.id)
      if (sg) {
        return { ...g, assignedTableId: sg.tableId, satisfactionScore: sg.satisfactionScore }
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

    // 後端同步：逐一更新賓客的 tableId
    const { eventId } = get()
    if (eventId) {
      for (const sg of snapData.guests) {
        fetch(`/api/events/${eventId}/guests/${sg.guestId}/table`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ tableId: sg.tableId }),
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
