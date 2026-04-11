import { create } from 'zustand';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { recalculateAll } from '@/lib/satisfaction';
import { type AutoAssignMode, type AutoAssignProgress } from '@/lib/auto-assign';
import { runAutoAssignInWorker } from '@/lib/auto-assign-client';
import { findFreePosition } from '@/lib/viewport';
import { buildSlotArray, placeGuest, extractSeatIndices, type Slot } from '@/lib/seat-shift';
import { trackEvent } from '@/lib/analytics';
import { ensureDefaultEvent } from '@/lib/ensure-default-event';

// ─── Types ──────────────────────────────────────────

export type { Guest, Table, AvoidPair, Subcategory, SeatPreviewGuest, SnapshotData } from '@/lib/types';
import type { Guest, Table, AvoidPair, Subcategory, SeatPreviewGuest, SnapshotData } from '@/lib/types';

export interface SeatingSnapshot {
  id: string
  name: string
  data: SnapshotData
  averageSatisfaction: number
  createdAt: string
}

// ─── Event Cache (localStorage) ────────────────────
// bootEvent 成功後快取整個 event state，下次載入直接用，省掉 API round trip
export interface EventCache {
  ts: number
  eventId: string
  eventName: string
  eventCategories: string[]
  guests: Guest[]
  tables: Table[]
  subcategories: Subcategory[]
  avoidPairs: AvoidPair[]
  snapshots: SeatingSnapshot[]
  tableLimit: number
  planStatus: string | null
  planExpiresAt: string | null
}

const EVENT_CACHE_KEY = 'seatern-event-cache';

function saveEventCache(state: EventCache) {
  try {
    localStorage.setItem(EVENT_CACHE_KEY, JSON.stringify(state));
  } catch { /* localStorage full or unavailable */ }
}

function loadEventCache(): EventCache | null {
  try {
    const raw = localStorage.getItem(EVENT_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as EventCache;
    if (!cache.eventId || !cache.ts) return null;
    return cache;
  } catch { return null; }
}

export function clearEventCache() {
  try { localStorage.removeItem(EVENT_CACHE_KEY); } catch { /* ok */ }
}

// ─── Workspace Backup (localStorage) ───────────────
export interface WorkspaceBackup {
  ts: number
  eventName: string
  tables: Table[]
  guestAssignments: Array<{ id: string; assignedTableId: string | null; seatIndex: number | null }>
}

// ─── localStorage 備份 debounce ────────────────────
let _backupTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleBackup(eventId: string, state: { eventName: string; tables: Table[]; guests: Guest[] }) {
  if (_backupTimer) clearTimeout(_backupTimer);
  _backupTimer = setTimeout(() => {
    try {
      const backup: WorkspaceBackup = {
        ts: Date.now(),
        eventName: state.eventName,
        tables: state.tables,
        guestAssignments: state.guests.map((g) => ({
          id: g.id,
          assignedTableId: g.assignedTableId,
          seatIndex: g.seatIndex,
        })),
      };
      localStorage.setItem(`seatern-backup-${eventId}`, JSON.stringify(backup));
    } catch { /* localStorage full or unavailable */ }
  }, 500);
}

// ─── Helpers: fetch & apply event data ─────────────

type SetFn = (partial: Partial<SeatingState> | ((state: SeatingState) => Partial<SeatingState>)) => void;
type GetFn = () => SeatingState;

/** 從 API 抓取 event 資料，處理後套用到 store + 寫入快取 */
async function fetchAndApplyEvent(set: SetFn, get: GetFn) {
  const res = await ensureDefaultEvent('auto_first_login');
  if (!res) {
    set({ loading: false });
    window.location.href = '/';
    return;
  }
  const data = res.data;

  interface ApiGuest {
    id: string; name: string; aliases: string[]; category: string | null;
    rsvpStatus: Guest['rsvpStatus']; companionCount: number;
    dietaryNote: string | null; specialNote: string | null;
    assignedTableId: string | null; seatIndex: number | null;
    isOverflow: boolean; isIsolated: boolean;
    seatPreferences: Guest['seatPreferences']; subcategory: Guest['subcategory'];
  }
  const guests = data.guests.map((g: ApiGuest) => ({
    id: g.id,
    name: g.name,
    aliases: g.aliases || [],
    category: g.category || '',
    rsvpStatus: g.rsvpStatus,
    companionCount: g.companionCount,
    seatCount: g.companionCount + 1,
    dietaryNote: g.dietaryNote || '',
    specialNote: g.specialNote || '',
    satisfactionScore: 0,
    assignedTableId: g.assignedTableId,
    seatIndex: g.seatIndex ?? null,
    isOverflow: g.isOverflow,
    isIsolated: g.isIsolated,
    seatPreferences: g.seatPreferences || [],
    subcategory: g.subcategory || null,
  }));
  const tables = data.tables as Table[];
  const subcategories = (data.subcategories || []) as Subcategory[];
  const avoidPairs = data.avoidPairs || [];
  const snapshots = data.snapshots || [];

  // 初始滿意度計算
  const result = recalculateAll(guests, tables, avoidPairs);
  for (const gs of result.guests) {
    const g = guests.find((gg: Guest) => gg.id === gs.id);
    if (g) g.satisfactionScore = gs.satisfactionScore;
  }
  for (const ts of result.tables) {
    const t = tables.find((tt: Table) => tt.id === ts.id);
    if (t) t.averageSatisfaction = ts.averageSatisfaction;
  }

  // 為沒有 seatIndex 的賓客自動分配座位索引
  for (const t of tables) {
    const tableGuests = guests.filter(
      (g: Guest) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed',
    );
    const needsIndex = tableGuests.filter((g: Guest) => g.seatIndex === null);
    if (needsIndex.length > 0) {
      const usedIndices = new Set(
        tableGuests.filter((g: Guest) => g.seatIndex !== null).map((g: Guest) => g.seatIndex!),
      );
      for (const g of tableGuests) {
        if (g.seatIndex !== null) {
          for (let c = 1; c < g.seatCount; c++) {
            usedIndices.add((g.seatIndex + c) % t.capacity);
          }
        }
      }
      let nextFree = 0;
      for (const g of needsIndex) {
        while (usedIndices.has(nextFree)) nextFree++;
        g.seatIndex = nextFree;
        usedIndices.add(nextFree);
        for (let c = 1; c < g.seatCount; c++) {
          usedIndices.add(nextFree + c);
        }
        nextFree++;
      }
    }
  }

  // 組合成 EventCache 格式，套用到 store + 寫入快取
  const eventData: EventCache = {
    ts: Date.now(),
    eventId: data.id,
    eventName: data.name,
    eventCategories: data.categories || ['男方', '女方', '共同'],
    guests,
    tables,
    subcategories,
    avoidPairs,
    snapshots,
    tableLimit: data.tableLimit ?? 20,
    planStatus: data.planStatus ?? null,
    planExpiresAt: data.planExpiresAt ?? null,
  };

  applyEventData(set, get, eventData);
  saveEventCache(eventData);
}

/** 將 EventCache 資料套用到 store（從 API 或 localStorage 載入都走這裡） */
function applyEventData(set: SetFn, _get: GetFn, data: EventCache) {
  // 從快取載入時需要重算滿意度（快取可能不含最新的 satisfactionScore）
  const result = recalculateAll(data.guests, data.tables, data.avoidPairs);
  const guests = data.guests.map((g) => {
    const s = result.guests.find((gs) => gs.id === g.id);
    return s ? { ...g, satisfactionScore: s.satisfactionScore } : g;
  });
  const tables = data.tables.map((t) => {
    const s = result.tables.find((ts) => ts.id === t.id);
    return s ? { ...t, averageSatisfaction: s.averageSatisfaction } : t;
  });

  // 檢查 localStorage 備份（未存的排位變更）
  let recoveryState: { showRecoveryPrompt: boolean; backupData: WorkspaceBackup | null } = { showRecoveryPrompt: false, backupData: null };
  try {
    const raw = localStorage.getItem(`seatern-backup-${data.eventId}`);
    if (raw) {
      const backup = JSON.parse(raw) as WorkspaceBackup;
      if (backup.ts && backup.guestAssignments?.length > 0) {
        recoveryState = { showRecoveryPrompt: true, backupData: backup };
      }
    }
  } catch { /* localStorage parse error, ignore */ }

  set({
    eventId: data.eventId,
    eventName: data.eventName,
    eventCategories: data.eventCategories,
    guests,
    tables,
    subcategories: data.subcategories,
    avoidPairs: data.avoidPairs,
    snapshots: data.snapshots,
    tableLimit: data.tableLimit,
    planStatus: data.planStatus,
    planExpiresAt: data.planExpiresAt,
    loading: false,
    isDirty: false,
    isSaving: false,
    selectedTableId: null,
    dragPreview: null,
    undoStack: [],
    ...recoveryState,
  });
}

// ─── Store ──────────────────────────────────────────

interface SeatingState {
  // Data
  eventId: string | null
  eventName: string
  eventCategories: string[]
  guests: Guest[]
  tables: Table[]
  subcategories: Subcategory[]
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
  /** 空位 popover hover 預覽：顯示賓客預覽在指定空位 */
  seatPreviewGuest: SeatPreviewGuest | null
  /** 有更好位置的賓客 ID 集合（顯示💡圖示） */
  guestsWithRecommendations: Set<string>
  /** 長按換位：hover 中賓客的最佳推薦目標桌 ID */
  bestSwapTableId: string | null
  /** 長按換位進行中 */
  longPressActive: boolean
  /** 手機觸控拖曳中（讓所有 GuestSeatOverlay 變 pointer-events:none 以便 hit-test SeatDropZone） */
  touchDragActive: boolean
  /** 手機觸控拖曳中，手指目前懸停的座位（用來顯示目標虛線 + 決定放置位置） */
  touchHoverSeat: { tableId: string; seatIndex: number } | null
  /** 上次重排的時間戳，用於觸發入場動畫 */
  lastResetAt: number
  /** 重排動畫進行中（桌上賓客淡出） */
  isResetting: boolean
  /** 正在飛行動畫中的賓客 ID（用於 undo 動畫隱藏個別賓客） */
  flyingGuestIds: Set<string>
  /** 排位頁面：正在編輯的賓客 ID（開啟 GuestEditModal） */
  editingGuestId: string | null
  /** 桌數上限（從 API 取得） */
  tableLimit: number
  /** 方案狀態 */
  planStatus: string | null
  /** 方案到期時間 */
  planExpiresAt: string | null
  /** 桌數上限已達到（顯示 TableLimitModal） */
  tableLimitReached: boolean
  /** 用戶已點「稍後再說」關閉上限 modal */
  tableLimitDismissed: boolean
  /** Demo 資料載入中 */
  demoLoading: boolean
  /** 批次座位寫入中（自動分配/重排後等待後端回應） */
  isBatchSaving: boolean
  /** 有未存的 workspace 變更 */
  isDirty: boolean
  /** saveAll 進行中 */
  isSaving: boolean
  /** 上次存檔時間戳 */
  lastSavedAt: number | null
  /** localStorage 備份恢復提示 */
  showRecoveryPrompt: boolean
  /** localStorage 備份資料 */
  backupData: WorkspaceBackup | null
  /** 自動分配進度（null = 未執行） */
  autoAssignProgress: AutoAssignProgress | null
  /** 自動分配取消控制器 */
  autoAssignAbort: AbortController | null
  cancelAutoAssign: () => void

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
        assignments: Array<{ guestId: string; fromTableId: string | null; fromSeatIndex?: number | null }>
        createdTableIds: string[] // 自動新增的桌子，undo 時要刪除
      }
  >

  // Actions
  bootEvent: () => Promise<void>
  /** 強制從 API 重新載入（忽略 localStorage 快取） */
  reloadEvent: () => Promise<void>
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
  addTable: (name: string, positionX: number, positionY: number) => void
  removeTable: (tableId: string) => void
  updateTableName: (tableId: string, name: string) => void
  updateTableCapacity: (tableId: string, capacity: number) => void
  updateTablePosition: (tableId: string, x: number, y: number) => void
  saveTablePosition: (tableId: string, fromX?: number, fromY?: number) => void
  saveSnapshot: (name: string) => Promise<void>
  restoreSnapshot: (snapshotId: string) => Promise<void>
  addAvoidPair: (guestAId: string, guestBId: string, reason?: string) => Promise<void>
  removeAvoidPair: (pairId: string) => Promise<void>
  checkAvoidViolation: (guestId: string, tableId: string) => AvoidPair | null
  autoArrangeTables: (positions: Array<{ tableId: string; x: number; y: number }>) => void
  autoAssignGuests: (mode?: AutoAssignMode) => Promise<void>
  randomAssignGuests: (ratio?: number) => void
  setEditingGuest: (guestId: string | null) => void
  saveAll: () => Promise<void>
  restoreFromBackup: () => void
  dismissBackup: () => void

  // Guest CRUD (管理頁面用)
  updateGuest: (guestId: string, patch: Partial<Guest>) => Promise<boolean>
  deleteGuest: (guestId: string) => Promise<boolean>
  addGuest: (data: { name: string; category?: string; rsvpStatus?: string; companionCount?: number; dietaryNote?: string; specialNote?: string }) => Promise<Guest | null>

  // Per-guest preference & tag management
  updateGuestPreferences: (guestId: string, preferences: Array<{ preferredGuestId: string; rank: number }>) => Promise<boolean>
  setGuestSubcategory: (guestId: string, subcategoryId: string | null) => Promise<boolean>

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
  eventCategories: ['男方', '女方', '共同'],
  guests: [],
  tables: [],
  subcategories: [],
  avoidPairs: [],
  snapshots: [],
  selectedTableId: null,
  editingGuestId: null,
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
  seatPreviewGuest: null,
  guestsWithRecommendations: new Set(),
  bestSwapTableId: null,
  longPressActive: false,
  touchDragActive: false,
  touchHoverSeat: null,
  undoStack: [],
  lastResetAt: 0,
  isResetting: false,
  demoLoading: false,
  isBatchSaving: false,
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  showRecoveryPrompt: false,
  backupData: null,
  flyingGuestIds: new Set(),
  tableLimit: 10,
  planStatus: null,
  planExpiresAt: null,
  tableLimitReached: false,
  tableLimitDismissed: false,
  autoAssignProgress: null,
  autoAssignAbort: null,
  cancelAutoAssign: () => {
    const ctrl = get().autoAssignAbort;
    if (ctrl) ctrl.abort();
  },

  /**
   * 啟動時的快取 fast path：有 localStorage 快取就直接套用省掉 API round trip，
   * 沒快取才打 API。只該在 app 啟動/頁面第一次載入時呼叫。
   * ⚠️ 任何寫後端的操作之後要 refresh，請用 reloadEvent 而不是 bootEvent，
   * 否則快取會把畫面鎖死在舊狀態。
   */
  bootEvent: async () => {
    // 先依 Supabase session 預設 tableLimit（未登入 10、已登入 20），
    // 避免 loading 期間顯示錯誤的桌數上限
    const { data: { session } } = await supabase.auth.getSession();
    set({ loading: true, tableLimit: session ? 20 : 10 });
    try {
      // 1. 嘗試從 localStorage 快取載入（省掉 API round trip）
      const cache = loadEventCache();
      if (cache) {
        // 快取存在 — 直接套用，不打 API
        applyEventData(set, get, cache);
        return;
      }

      // 2. 沒有快取 — 從 API 載入
      await fetchAndApplyEvent(set, get);
    } catch (err) {
      console.error('Failed to boot event:', err);
      set({ loading: false });
    }
  },

  reloadEvent: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    set({ loading: true, tableLimit: session ? 20 : 10 });
    clearEventCache();
    try {
      await fetchAndApplyEvent(set, get);
    } catch (err) {
      console.error('Failed to reload event:', err);
      set({ loading: false });
    }
  },

  setSelectedTable: (tableId) => set({ selectedTableId: tableId }),
  setEditingGuest: (guestId) => set({ editingGuestId: guestId }),
  setHoveredGuest: (guestId, screenY) => set({ hoveredGuestId: guestId, hoveredGuestScreenY: screenY ?? null }),
  setActiveDragGuest: (guestId) => set({
    activeDragGuestId: guestId,
    dragPreview: guestId ? undefined : null,
    dragRejectTableId: guestId ? undefined : null,
    // drop 時抑制 hover 400ms，讓滿意度動畫播完
    hoverSuppressedUntil: guestId ? 0 : Date.now() + 400,
  }),

  moveGuest: (guestId, toTableId) => {
    const { guests, tables, undoStack, avoidPairs } = get();
    const guest = guests.find((g) => g.id === guestId);
    if (!guest) return;

    const fromTableId = guest.assignedTableId;

    // 記錄原始 seatIndex（用於 undo）
    const prevSeatIndices = new Map<string, number | null>();
    prevSeatIndices.set(guestId, guest.seatIndex);

    // 更新賓客位置（移除桌時清 seatIndex）
    const updatedGuests = guests.map((g) =>
      g.id === guestId ? { ...g, assignedTableId: toTableId, seatIndex: toTableId === null ? null : g.seatIndex } : g,
    );

    // 全量重算滿意度
    const result = recalculateAll(updatedGuests, tables, avoidPairs);
    const finalGuests = updatedGuests.map((g) => {
      const score = result.guests.find((gs) => gs.id === g.id);
      return score ? { ...g, satisfactionScore: score.satisfactionScore } : g;
    });
    const finalTables = tables.map((t) => {
      const score = result.tables.find((ts) => ts.id === t.id);
      return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t;
    });

    set({
      guests: finalGuests,
      tables: finalTables,
      dragPreview: null,
      isDirty: true,
      undoStack: [...undoStack, { guestId, fromTableId, toTableId, prevSeatIndices }],
    });

    const { eventId } = get();
    if (eventId) scheduleBackup(eventId, get());
  },

  moveGuestToSeat: (guestId, tableId, seatIndex, cursorBias) => {
    const { guests, tables, undoStack, avoidPairs } = get();
    const guest = guests.find((g) => g.id === guestId);
    if (!guest) return;

    const fromTableId = guest.assignedTableId;
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    // 記錄所有可能受影響的 seatIndex（用於 undo）
    const prevSeatIndices = new Map<string, number | null>();
    prevSeatIndices.set(guestId, guest.seatIndex);

    // 建立目標桌的 slot 陣列（排除正在拖的賓客）
    const tableGuests = guests.filter(
      (g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed' && g.id !== guestId,
    );
    for (const g of tableGuests) {
      prevSeatIndices.set(g.id, g.seatIndex);
    }

    const seatGuests = tableGuests
      .filter((g) => g.seatIndex !== null)
      .map((g) => ({ id: g.id, seatIndex: g.seatIndex!, seatCount: g.seatCount }));

    const slots = buildSlotArray(seatGuests, table.capacity);
    const newSlots = placeGuest(slots, seatIndex, guestId, guest.seatCount, cursorBias);

    if (!newSlots) return; // 無法放置

    // 提取新的 seatIndex mapping
    const newIndices = extractSeatIndices(newSlots);

    // 更新所有賓客
    const updatedGuests = guests.map((g) => {
      if (g.id === guestId) {
        return { ...g, assignedTableId: tableId, seatIndex: newIndices.get(guestId) ?? seatIndex };
      }
      if (newIndices.has(g.id)) {
        return { ...g, seatIndex: newIndices.get(g.id)! };
      }
      return g;
    });

    // 全量重算滿意度
    const result = recalculateAll(updatedGuests, tables, avoidPairs);
    const finalGuests = updatedGuests.map((g) => {
      const score = result.guests.find((gs) => gs.id === g.id);
      return score ? { ...g, satisfactionScore: score.satisfactionScore } : g;
    });
    const finalTables = tables.map((t) => {
      const score = result.tables.find((ts) => ts.id === t.id);
      return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t;
    });

    set({
      guests: finalGuests,
      tables: finalTables,
      dragPreview: null,
      isDirty: true,
      undoStack: [...undoStack, { guestId, fromTableId, toTableId: tableId, prevSeatIndices }],
    });

    const { eventId } = get();
    if (eventId) scheduleBackup(eventId, get());
  },

  setDragPreview: (tableId, seatIndex, draggedGuestId, cursorBias) => {
    if (!tableId || seatIndex === undefined || !draggedGuestId) {
      set({ dragPreview: null, dragRejectTableId: null });
      return;
    }

    const { guests, tables, avoidPairs } = get();
    const table = tables.find((t) => t.id === tableId);
    const draggedGuest = guests.find((g) => g.id === draggedGuestId);
    if (!table || !draggedGuest) {
      set({ dragPreview: null, dragRejectTableId: null });
      return;
    }

    // 建立 slot 陣列（排除被拖的賓客）
    const tableGuests = guests.filter(
      (g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed' && g.id !== draggedGuestId,
    );
    const seatGuests = tableGuests
      .filter((g) => g.seatIndex !== null)
      .map((g) => ({ id: g.id, seatIndex: g.seatIndex!, seatCount: g.seatCount }));

    const slots = buildSlotArray(seatGuests, table.capacity);
    const newSlots = placeGuest(slots, seatIndex, draggedGuestId, draggedGuest.seatCount, cursorBias);

    if (!newSlots) {
      // 無法放置 — 區分原因：真的滿桌 vs 不可移動的位子
      const emptySlots = slots.filter((s) => s === null).length;
      const isTrulyFull = emptySlots < draggedGuest.seatCount;
      set({ dragPreview: null, dragRejectTableId: isTrulyFull ? tableId : null });
      return;
    }

    // 計算預覽滿意度：模擬被拖賓客放到目標位後的分數
    const newIndices = extractSeatIndices(newSlots);
    const previewGuests = guests.map((g) => {
      if (g.id === draggedGuestId) {
        return { ...g, assignedTableId: tableId, seatIndex: newIndices.get(g.id) ?? seatIndex };
      }
      if (newIndices.has(g.id)) {
        return { ...g, seatIndex: newIndices.get(g.id)! };
      }
      return g;
    });
    const previewResult = recalculateAll(previewGuests, tables, avoidPairs);

    const previewScores = new Map<string, number>();
    for (const gs of previewResult.guests) previewScores.set(gs.id, gs.satisfactionScore);
    const previewTableScores = new Map<string, number>();
    for (const ts of previewResult.tables) previewTableScores.set(ts.id, ts.averageSatisfaction);

    // 目標位留空 — 被拖的賓客跟著游標（DragOverlay），不顯示在桌上
    for (let i = 0; i < newSlots.length; i++) {
      if (newSlots[i]?.guestId === draggedGuestId) {
        newSlots[i] = null;
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
    });
  },

  undo: () => {
    const { undoStack, guests, tables, eventId, avoidPairs } = get();
    if (undoStack.length === 0) return;

    const last = undoStack[undoStack.length - 1];

    // ─── 還原「新增桌」：刪掉該桌 ───
    if (last.type === 'add-table') {
      const tableId = last.tableId;
      const updatedGuests = guests.map((g) =>
        g.assignedTableId === tableId ? { ...g, assignedTableId: null as string | null, seatIndex: null } : g,
      );
      set({
        tables: tables.filter((t) => t.id !== tableId),
        guests: updatedGuests,
        undoStack: undoStack.slice(0, -1),
        isDirty: true,
        selectedTableId: get().selectedTableId === tableId ? null : get().selectedTableId,
      });
      if (eventId) scheduleBackup(eventId, get());
      return;
    }

    // ─── 還原「移動桌子」：回到原始位置 ───
    if (last.type === 'move-table') {
      const { tableId, fromX, fromY } = last;
      set({
        tables: tables.map((t) => t.id === tableId ? { ...t, positionX: fromX, positionY: fromY } : t),
        undoStack: undoStack.slice(0, -1),
        isDirty: true,
      });
      if (eventId) scheduleBackup(eventId, get());
      return;
    }

    // ─── 還原「改桌名」 ───
    if (last.type === 'rename-table') {
      const { tableId, oldName } = last;
      set({
        tables: tables.map((t) => t.id === tableId ? { ...t, name: oldName } : t),
        undoStack: undoStack.slice(0, -1),
        isDirty: true,
      });
      if (eventId) scheduleBackup(eventId, get());
      return;
    }

    // ─── 還原「自動排列」：所有桌子回到原始位置 ───
    if (last.type === 'auto-arrange') {
      const updatedTables = tables.map((t) => {
        const prev = last.positions.get(t.id);
        return prev ? { ...t, positionX: prev.fromX, positionY: prev.fromY } : t;
      });
      set({ tables: updatedTables, undoStack: undoStack.slice(0, -1), isDirty: true });
      if (eventId) scheduleBackup(eventId, get());
      return;
    }

    // ─── 還原「自動分配」：賓客回到原始桌次 + 刪除自動新增的桌子 ───
    if (last.type === 'auto-assign') {
      // 還原賓客分配（含 seatIndex）
      const updatedGuests = guests.map((g) => {
        const orig = last.assignments.find((a) => a.guestId === g.id);
        return orig ? { ...g, assignedTableId: orig.fromTableId, seatIndex: orig.fromSeatIndex ?? null } : g;
      });
      // 刪除自動新增的桌子
      const remainingTables = tables.filter((t) => !last.createdTableIds.includes(t.id));
      const result = recalculateAll(updatedGuests, remainingTables, avoidPairs);
      const finalGuests = updatedGuests.map((g) => {
        const score = result.guests.find((gs) => gs.id === g.id);
        return score ? { ...g, satisfactionScore: score.satisfactionScore } : g;
      });
      const finalTables = remainingTables.map((t) => {
        const score = result.tables.find((ts) => ts.id === t.id);
        return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t;
      });
      set({ guests: finalGuests, tables: finalTables, undoStack: undoStack.slice(0, -1), isDirty: true });
      if (eventId) scheduleBackup(eventId, get());
      return;
    }

    // ─── 還原「移動賓客」 ───
    // 批次還原：如果最後一筆有 batchId，找出所有同 batch 的 entry 一起還原
    type MoveGuestEntry = Extract<typeof undoStack[number], { guestId: string }>;
    const isMoveGuest = (e: typeof undoStack[number]): e is MoveGuestEntry => !e.type || e.type === 'move-guest';
    const entriesToUndo = last.batchId
      ? undoStack.filter((e): e is MoveGuestEntry => isMoveGuest(e) && e.batchId === last.batchId)
      : [last];
    const remainingStack = last.batchId
      ? undoStack.filter((e) => !isMoveGuest(e) || e.batchId !== last.batchId)
      : undoStack.slice(0, -1);

    // 還原所有受影響賓客的 seatIndex + tableId
    let updatedGuests = [...guests];
    for (const entry of entriesToUndo) {
      updatedGuests = updatedGuests.map((g) => {
        if (g.id === entry.guestId) {
          const prevIdx = entry.prevSeatIndices.get(g.id) ?? null;
          return { ...g, assignedTableId: entry.fromTableId, seatIndex: prevIdx };
        }
        if (entry.prevSeatIndices.has(g.id)) {
          return { ...g, seatIndex: entry.prevSeatIndices.get(g.id) ?? null };
        }
        return g;
      });
    }

    // 全量重算
    const result = recalculateAll(updatedGuests, tables, avoidPairs);
    const finalGuests = updatedGuests.map((g) => {
      const score = result.guests.find((gs) => gs.id === g.id);
      return score ? { ...g, satisfactionScore: score.satisfactionScore } : g;
    });
    const finalTables = tables.map((t) => {
      const score = result.tables.find((ts) => ts.id === t.id);
      return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t;
    });

    set({
      guests: finalGuests,
      tables: finalTables,
      undoStack: remainingStack,
      isDirty: true,
    });

    if (eventId) scheduleBackup(eventId, get());
  },

  removeTable: (tableId) => {
    const { eventId, tables, guests, selectedTableId } = get();

    const updatedGuests = guests.map((g) =>
      g.assignedTableId === tableId ? { ...g, assignedTableId: null as string | null, seatIndex: null } : g,
    );

    set({
      tables: tables.filter((t) => t.id !== tableId),
      guests: updatedGuests,
      selectedTableId: selectedTableId === tableId ? null : selectedTableId,
      isDirty: true,
    });

    if (eventId) scheduleBackup(eventId, get());
  },

  addTable: (name, positionX, positionY) => {
    const { eventId, tables, tableLimit } = get();
    if (!eventId) return;

    // 前端檢查桌數上限
    if (tables.length >= tableLimit) {
      set({ tableLimitReached: true });
      return;
    }

    const table: Table = {
      id: crypto.randomUUID(),
      name,
      capacity: 10,
      positionX,
      positionY,
      averageSatisfaction: 0,
      color: null,
      note: null,
    };
    set({
      tables: [...tables, table],
      isDirty: true,
      undoStack: [...get().undoStack, { type: 'add-table' as const, tableId: table.id }],
    });
    scheduleBackup(eventId, get());
  },

  clearTable: (tableId) => {
    const { guests, tables, avoidPairs, eventId, undoStack } = get();
    const tableGuests = guests.filter((g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed');
    if (tableGuests.length === 0) return;

    const batchId = `clear-${tableId}-${Date.now()}`;
    const undoEntries = tableGuests.map((g) => ({
      guestId: g.id,
      fromTableId: g.assignedTableId ?? null,
      toTableId: null as string | null,
      prevSeatIndices: new Map<string, number | null>([[g.id, g.seatIndex ?? null]]),
      batchId,
    }));

    const updatedGuests = guests.map((g) =>
      g.assignedTableId === tableId ? { ...g, assignedTableId: null as string | null, seatIndex: null, satisfactionScore: g.rsvpStatus === 'confirmed' ? 55 : 0 } : g,
    );
    const result = recalculateAll(updatedGuests, tables, avoidPairs);
    const finalGuests = updatedGuests.map((g) => {
      const score = result.guests.find((gs) => gs.id === g.id);
      return score ? { ...g, satisfactionScore: score.satisfactionScore } : g;
    });
    const finalTables = tables.map((t) => {
      const score = result.tables.find((ts) => ts.id === t.id);
      return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t;
    });

    set({ guests: finalGuests, tables: finalTables, isDirty: true, undoStack: [...undoStack, ...undoEntries] });

    if (eventId) scheduleBackup(eventId, get());
  },

  resetAllSeats: () => {
    const { guests, tables, eventId, undoStack } = get();
    const assigned = guests.filter((g) => g.assignedTableId);
    if (assigned.length === 0) return;

    // 把每位已安排賓客的狀態推入 undoStack，共享 batchId 讓「還原」一次全部回來
    const batchId = `reset-${Date.now()}`;
    const undoEntries = assigned.map((g) => ({
      guestId: g.id,
      fromTableId: g.assignedTableId ?? null,
      toTableId: null as string | null,
      prevSeatIndices: new Map<string, number | null>([[g.id, g.seatIndex ?? null]]),
      batchId,
    }));

    const updatedGuests = guests.map((g) => ({
      ...g,
      assignedTableId: null as string | null,
      seatIndex: null,
      satisfactionScore: g.rsvpStatus === 'confirmed' ? 55 : 0,
    }));
    const updatedTables = tables.map((t) => ({ ...t, averageSatisfaction: 0 }));

    set({ guests: updatedGuests, tables: updatedTables, selectedTableId: null, isDirty: true, undoStack: [...undoStack, ...undoEntries], lastResetAt: Date.now(), isResetting: false });

    if (eventId) scheduleBackup(eventId, get());
  },

  updateEventName: (name) => {
    const { eventId } = get();
    set({ eventName: name, isDirty: true });
    if (eventId) scheduleBackup(eventId, get());
  },

  updateTableName: (tableId, name) => {
    const { eventId, tables, undoStack } = get();
    const oldName = tables.find((t) => t.id === tableId)?.name;
    set({
      tables: tables.map((t) => t.id === tableId ? { ...t, name } : t),
      isDirty: true,
      undoStack: oldName !== undefined && oldName !== name
        ? [...undoStack, { type: 'rename-table' as const, tableId, oldName, newName: name }]
        : undoStack,
    });
    if (eventId) scheduleBackup(eventId, get());
  },

  updateTableCapacity: (tableId, capacity) => {
    const { eventId, tables, guests, avoidPairs } = get();
    const updatedTables = tables.map((t) => t.id === tableId ? { ...t, capacity } : t);
    const result = recalculateAll(guests, updatedTables, avoidPairs);
    set({
      tables: updatedTables.map((t) => {
        const s = result.tables.find((ts) => ts.id === t.id);
        return s ? { ...t, averageSatisfaction: s.averageSatisfaction } : t;
      }),
      guests: guests.map((g) => {
        const s = result.guests.find((gs) => gs.id === g.id);
        return s ? { ...g, satisfactionScore: s.satisfactionScore } : g;
      }),
      isDirty: true,
    });
    if (eventId) scheduleBackup(eventId, get());
  },

  updateTablePosition: (tableId, x, y) => {
    const { guests, tables, avoidPairs } = get();
    // 更新位置（拖曳中頻繁呼叫，不打 API）
    const updatedTables = tables.map((t) =>
      t.id === tableId ? { ...t, positionX: x, positionY: y } : t,
    );
    // 即時重算滿意度（鄰桌關係隨位置改變）
    const result = recalculateAll(guests, updatedTables, avoidPairs);
    set({
      tables: updatedTables.map((t) => {
        const s = result.tables.find((ts) => ts.id === t.id);
        return s ? { ...t, averageSatisfaction: s.averageSatisfaction } : t;
      }),
      guests: guests.map((g) => {
        const s = result.guests.find((gs) => gs.id === g.id);
        return s ? { ...g, satisfactionScore: s.satisfactionScore } : g;
      }),
    });
  },

  saveTablePosition: (tableId, fromX?, fromY?) => {
    const { tables, eventId, undoStack } = get();
    if (!eventId) return;
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    // 推入 undo（有提供原始位置且確實移動過時）
    if (fromX !== undefined && fromY !== undefined && (fromX !== table.positionX || fromY !== table.positionY)) {
      set({ undoStack: [...undoStack, { type: 'move-table' as const, tableId, fromX, fromY, toX: table.positionX, toY: table.positionY }] });
    }

    // 鄰桌關係可能改變，重算滿意度
    const { guests, avoidPairs } = get();
    const result = recalculateAll(guests, tables, avoidPairs);
    set({
      guests: guests.map((g) => {
        const s = result.guests.find((gs) => gs.id === g.id);
        return s ? { ...g, satisfactionScore: s.satisfactionScore } : g;
      }),
      tables: tables.map((t) => {
        const s = result.tables.find((ts) => ts.id === t.id);
        return s ? { ...t, averageSatisfaction: s.averageSatisfaction } : t;
      }),
    });

    set({ isDirty: true });
    scheduleBackup(eventId, get());
  },

  autoArrangeTables: (positions) => {
    const { tables, eventId, undoStack } = get();
    // 記錄原始位置（undo 用）
    const prevPositions = new Map<string, { fromX: number; fromY: number }>();
    for (const t of tables) prevPositions.set(t.id, { fromX: t.positionX, fromY: t.positionY });

    // 更新 store
    const updatedTables = tables.map((t) => {
      const pos = positions.find((p) => p.tableId === t.id);
      return pos ? { ...t, positionX: pos.x, positionY: pos.y } : t;
    });
    set({
      tables: updatedTables,
      isDirty: true,
      undoStack: [...undoStack, { type: 'auto-arrange' as const, positions: prevPositions }],
    });

    if (eventId) scheduleBackup(eventId, get());
  },

  autoAssignGuests: async (mode: AutoAssignMode = 'balanced') => {
    const { guests, tables, avoidPairs, eventId } = get();
    const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed');
    const unassigned = confirmed.filter((g) => !g.assignedTableId);
    if (unassigned.length === 0) return;

    // 檢查容量是否足夠，不夠就自動新增桌子
    const totalSeatsNeeded = unassigned.reduce((s, g) => s + g.seatCount, 0);
    const totalRemaining = tables.reduce((s, t) => {
      const seated = confirmed.filter((g) => g.assignedTableId === t.id);
      const used = seated.reduce((ss, g) => ss + g.seatCount, 0);
      return s + Math.max(0, t.capacity - used);
    }, 0);

    let currentTables = tables;
    const newTableIds: string[] = [];
    if (totalSeatsNeeded > totalRemaining) {
      const deficit = totalSeatsNeeded - totalRemaining;
      const defaultCapacity = 10;
      const tablesToAdd = Math.ceil(deficit / defaultCapacity);

      for (let i = 0; i < tablesToAdd; i++) {
        const currentTbls = get().tables;
        const num = currentTbls.length + 1;
        const pos = findFreePosition(currentTbls);
        const name = `第${num}桌`;

        get().addTable(name, pos.x, pos.y);
        const latestTables = get().tables;
        const newTable = latestTables.find((t) => t.name === name);
        if (newTable) newTableIds.push(newTable.id);
      }
      // 重新讀取最新的 tables
      currentTables = get().tables;
    }

    const latestGuests = get().guests;
    const abortController = new AbortController();
    set({
      autoAssignProgress: { label: '正在分組...', detail: '', progress: 0, currentAvg: 0, remainingSeconds: null },
      autoAssignAbort: abortController,
    });
    let assignments: Array<{ guestId: string; tableId: string }>;
    try {
      assignments = await runAutoAssignInWorker(latestGuests, currentTables, avoidPairs, mode, (progress) => {
        set({ autoAssignProgress: progress });
      }, abortController.signal);
    } catch (e: unknown) {
      set({ autoAssignProgress: null, autoAssignAbort: null });
      if (e instanceof Error && e.name === 'AbortError') return; // 使用者取消
      throw e;
    }
    set({ autoAssignProgress: null, autoAssignAbort: null });
    if (assignments.length === 0) return;

    // 記錄原始分配（undo 用）
    const undoData = assignments.map((a) => {
      const g = latestGuests.find((g) => g.id === a.guestId);
      return { guestId: a.guestId, fromTableId: g?.assignedTableId || null, fromSeatIndex: g?.seatIndex ?? null };
    });

    // 更新 store：設定 assignedTableId + 自動分配 seatIndex
    const updatedGuests = latestGuests.map((g) => {
      const assignment = assignments.find((a) => a.guestId === g.id);
      return assignment ? { ...g, assignedTableId: assignment.tableId } : g;
    });

    // 為新分配的賓客自動分配 seatIndex
    for (const t of currentTables) {
      const tableGuests = updatedGuests.filter(
        (g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed',
      );
      const needsIndex = tableGuests.filter((g) => g.seatIndex === null);
      if (needsIndex.length === 0) continue;

      const usedIndices = new Set<number>();
      for (const g of tableGuests) {
        if (g.seatIndex !== null) {
          usedIndices.add(g.seatIndex);
          for (let c = 1; c < g.seatCount; c++) {
            usedIndices.add((g.seatIndex + c) % t.capacity);
          }
        }
      }
      let nextFree = 0;
      for (const g of needsIndex) {
        while (usedIndices.has(nextFree)) nextFree++;
        g.seatIndex = nextFree;
        usedIndices.add(nextFree);
        for (let c = 1; c < g.seatCount; c++) {
          usedIndices.add(nextFree + c);
        }
        nextFree++;
      }
    }

    // 重算滿意度
    const result = recalculateAll(updatedGuests, currentTables, avoidPairs);
    const finalGuests = updatedGuests.map((g) => {
      const score = result.guests.find((gs) => gs.id === g.id);
      return score ? { ...g, satisfactionScore: score.satisfactionScore } : g;
    });
    const finalTables = currentTables.map((t) => {
      const score = result.tables.find((ts) => ts.id === t.id);
      return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t;
    });

    // 移除 addTable 推入的個別 undo entries（合併到 auto-assign 的 compound undo）
    const currentStack = get().undoStack.filter(
      (entry) => !(entry.type === 'add-table' && newTableIds.includes(entry.tableId))
    );

    set({
      guests: finalGuests,
      tables: finalTables,
      isDirty: true,
      undoStack: [...currentStack, { type: 'auto-assign' as const, assignments: undoData, createdTableIds: newTableIds }],
    });

    if (eventId) scheduleBackup(eventId, get());
  },

  randomAssignGuests: (ratio = 0.75) => {
    const { guests, tables, avoidPairs, eventId, undoStack } = get();
    const allConfirmed = guests.filter((g) => g.rsvpStatus === 'confirmed');
    if (allConfirmed.length === 0 || tables.length === 0) return;

    const shuffled = [...allConfirmed];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.length = Math.ceil(shuffled.length * ratio);

    const remaining = new Map<string, number>();
    const nextSeat = new Map<string, number>();
    for (const t of tables) { remaining.set(t.id, t.capacity); nextSeat.set(t.id, 0); }
    const assignments = new Map<string, { tableId: string; seatIndex: number }>();
    for (const g of shuffled) {
      const avail = tables.find((t) => (remaining.get(t.id) || 0) >= g.seatCount);
      if (avail) {
        const seat = nextSeat.get(avail.id) || 0;
        assignments.set(g.id, { tableId: avail.id, seatIndex: seat });
        remaining.set(avail.id, (remaining.get(avail.id) || 0) - g.seatCount);
        nextSeat.set(avail.id, seat + g.seatCount);
      }
    }

    const updatedGuests = guests.map((g) => {
      const a = assignments.get(g.id);
      if (a) return { ...g, assignedTableId: a.tableId, seatIndex: a.seatIndex };
      if (g.rsvpStatus === 'confirmed') return { ...g, assignedTableId: null, seatIndex: null };
      return g;
    });
    const result = recalculateAll(updatedGuests, tables, avoidPairs);
    const finalGuests = updatedGuests.map((g) => { const s = result.guests.find((gs) => gs.id === g.id); return s ? { ...g, satisfactionScore: s.satisfactionScore } : g; });
    const finalTables = tables.map((t) => { const s = result.tables.find((ts) => ts.id === t.id); return s ? { ...t, averageSatisfaction: s.averageSatisfaction } : t; });

    set({
      guests: finalGuests, tables: finalTables, isDirty: true,
      undoStack: [...undoStack, { type: 'auto-assign' as const, assignments: allConfirmed.map((g) => ({ guestId: g.id, fromTableId: g.assignedTableId || null, fromSeatIndex: g.seatIndex })), createdTableIds: [] }],
    });

    if (eventId) scheduleBackup(eventId, get());
  },

  saveSnapshot: async (name) => {
    const { eventId, guests, tables, snapshots } = get();
    if (!eventId) return;

    const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed');
    const assignedScores = confirmed.filter((g) => g.assignedTableId);
    const avg = assignedScores.length > 0
      ? Math.round((assignedScores.reduce((s, g) => s + g.satisfactionScore, 0) / assignedScores.length) * 10) / 10
      : 0;

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
    };

    let snapshot;
    try {
      const res = await api.post(`/events/${eventId}/snapshots`, { name, data, averageSatisfaction: avg });
      snapshot = res.data;
    } catch {
      trackEvent('save_failed', { target: 'snapshot' });
      return;
    }
    set({ snapshots: [snapshot, ...snapshots] });
    trackEvent('save_snapshot', {
      guest_count: data.guests.length,
      table_count: data.tables.length,
      avg_satisfaction: Math.round(avg),
    });
  },

  restoreSnapshot: async (snapshotId) => {
    const { snapshots, guests, tables, avoidPairs } = get();
    const snapshot = snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) return;

    const snapData = snapshot.data as {
      guests: Array<{ guestId: string; tableId: string | null; seatIndex?: number | null; satisfactionScore: number }>
      tables: Array<{ tableId: string; name?: string; positionX: number; positionY: number }>
    };

    // 還原賓客分配
    const restoredGuests = guests.map((g) => {
      const sg = snapData.guests.find((sg) => sg.guestId === g.id);
      if (sg) {
        return { ...g, assignedTableId: sg.tableId, seatIndex: sg.seatIndex ?? null, satisfactionScore: sg.satisfactionScore };
      }
      return g;
    });

    // 還原桌次：保留快照裡有的桌、重建被刪除的桌、刪除快照後新增的桌
    const snapshotTableIds = new Set(snapData.tables.map((st) => st.tableId));
    const currentTableIds = new Set(tables.map((t) => t.id));

    // 目前存在且快照裡也有 → 還原位置和名稱
    const keptTables = tables
      .filter((t) => snapshotTableIds.has(t.id))
      .map((t) => {
        const st = snapData.tables.find((st) => st.tableId === t.id)!;
        return { ...t, positionX: st.positionX, positionY: st.positionY, ...(st.name ? { name: st.name } : {}) };
      });

    // 快照裡有但目前不存在 → 需要重建
    const missingSnapTables = snapData.tables.filter((st) => !currentTableIds.has(st.tableId));

    // 先用快照資料建立 placeholder
    const placeholderTables: typeof tables = missingSnapTables.map((st) => ({
      id: st.tableId,
      name: st.name || '桌',
      capacity: 10,
      positionX: st.positionX,
      positionY: st.positionY,
      averageSatisfaction: 0,
      color: null,
      note: null,
    }));

    const restoredTables = [...keptTables, ...placeholderTables];

    // 重算滿意度（確保一致）
    const result = recalculateAll(restoredGuests, restoredTables, avoidPairs);
    const finalGuests = restoredGuests.map((g) => {
      const score = result.guests.find((gs) => gs.id === g.id);
      return score ? { ...g, satisfactionScore: score.satisfactionScore } : g;
    });
    const finalTables = restoredTables.map((t) => {
      const score = result.tables.find((ts) => ts.id === t.id);
      return score ? { ...t, averageSatisfaction: score.averageSatisfaction } : t;
    });

    set({ guests: finalGuests, tables: finalTables, undoStack: [], isDirty: true });

    const { eventId } = get();
    if (eventId) scheduleBackup(eventId, get());
  },

  addAvoidPair: async (guestAId, guestBId, reason) => {
    const { eventId, avoidPairs } = get();
    if (!eventId) return;

    // Optimistic: add a temporary pair immediately
    const tempId = `temp-${Date.now()}`;
    const tempPair = { id: tempId, eventId, guestAId, guestBId, reason: reason || null };
    set({ avoidPairs: [...avoidPairs, tempPair] });

    try {
      const res = await api.post(`/events/${eventId}/avoid-pairs`, { guestAId, guestBId, reason });
      // Replace temp with real pair
      set({ avoidPairs: get().avoidPairs.map((ap) => (ap.id === tempId ? res.data : ap)) });
    } catch {
      // Rollback
      set({ avoidPairs: get().avoidPairs.filter((ap) => ap.id !== tempId) });
    }
  },

  removeAvoidPair: async (pairId) => {
    const { eventId, avoidPairs } = get();
    if (!eventId) return;

    // Optimistic: remove immediately
    const removed = avoidPairs.find((ap) => ap.id === pairId);
    set({ avoidPairs: avoidPairs.filter((ap) => ap.id !== pairId) });

    try {
      await api.delete(`/events/${eventId}/avoid-pairs/${pairId}`);
    } catch {
      // Rollback
      if (removed) set({ avoidPairs: [...get().avoidPairs, removed] });
    }
  },

  checkAvoidViolation: (guestId, tableId) => {
    const { guests, avoidPairs } = get();
    const tableGuestIds = guests
      .filter((g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed')
      .map((g) => g.id);

    return avoidPairs.find((ap) =>
      (ap.guestAId === guestId && tableGuestIds.includes(ap.guestBId)) ||
      (ap.guestBId === guestId && tableGuestIds.includes(ap.guestAId))
    ) || null;
  },

  // ─── Guest CRUD（管理頁面用）─────────────────────────

  updateGuest: async (guestId, patch) => {
    const { eventId, guests, tables, avoidPairs } = get();
    if (!eventId) return false;

    // Optimistic update
    const prevGuests = guests;
    const idx = guests.findIndex((g) => g.id === guestId);
    if (idx < 0) return false;
    const merged = { ...guests[idx], ...patch };
    if ('companionCount' in patch) merged.seatCount = (merged.companionCount ?? 0) + 1;

    // When declining, unassign from table
    if (patch.rsvpStatus === 'declined' && merged.assignedTableId) {
      merged.assignedTableId = null;
      merged.seatIndex = null;
      // Also persist the table removal to backend
      if (eventId) {
        api.patch(`/events/${eventId}/guests/${guestId}/table`, { tableId: null, seatIndex: null }).catch(console.error);
      }
    }

    const updated = merged;
    let nextGuests = [...guests];
    nextGuests[idx] = updated;
    set({ guests: nextGuests });

    // When companionCount changes and guest is seated, re-layout seats to avoid overlap
    if ('companionCount' in patch && updated.assignedTableId && updated.seatIndex !== null) {
      const table = tables.find((t) => t.id === updated.assignedTableId);
      if (table) {
        // Build slot array excluding the updated guest
        const tableGuests = nextGuests.filter(
          (g) => g.assignedTableId === table.id && g.rsvpStatus === 'confirmed' && g.id !== guestId,
        );
        const seatGuests = tableGuests
          .filter((g) => g.seatIndex !== null)
          .map((g) => ({ id: g.id, seatIndex: g.seatIndex!, seatCount: g.seatCount }));

        const slots = buildSlotArray(seatGuests, table.capacity);
        const newSlots = placeGuest(slots, updated.seatIndex, guestId, updated.seatCount);

        if (newSlots) {
          const newIndices = extractSeatIndices(newSlots);
          nextGuests = nextGuests.map((g) => {
            if (g.id === guestId) {
              return { ...g, seatIndex: newIndices.get(guestId) ?? updated.seatIndex };
            }
            if (newIndices.has(g.id)) {
              return { ...g, seatIndex: newIndices.get(g.id)! };
            }
            return g;
          });
          set({ guests: nextGuests });

          // Persist shifted seat indices to backend
          if (eventId) {
            for (const [id, newIdx] of newIndices) {
              if (id !== guestId) {
                const prev = tableGuests.find((g) => g.id === id);
                if (prev && prev.seatIndex !== newIdx) {
                  api.patch(`/events/${eventId}/guests/${id}/table`, { tableId: table.id, seatIndex: newIdx }).catch(console.error);
                }
              }
            }
          }
        }
      }
    }

    // Recalculate if score-affecting fields changed
    const scoreFields = ['companionCount', 'rsvpStatus'] as const;
    const needsRecalc = scoreFields.some((f) => f in patch);
    if (needsRecalc) {
      const result = recalculateAll(nextGuests, tables, avoidPairs);
      const recalcedGuests = nextGuests.map((g) => {
        const s = result.guests.find((gs) => gs.id === g.id);
        return s ? { ...g, satisfactionScore: s.satisfactionScore } : g;
      });
      const recalcedTables = tables.map((t) => {
        const ts = result.tables.find((ts) => ts.id === t.id);
        return ts ? { ...t, averageSatisfaction: ts.averageSatisfaction } : t;
      });
      set({ guests: recalcedGuests, tables: recalcedTables });
    }

    try {
      await api.patch(`/events/${eventId}/guests/${guestId}`, patch);
      return true;
    } catch {
      set({ guests: prevGuests });
      return false;
    }
  },

  deleteGuest: async (guestId) => {
    const { eventId, guests, tables, avoidPairs } = get();
    if (!eventId) return false;

    const guest = guests.find((g) => g.id === guestId);
    if (!guest) return false;

    // Remove from local state
    const nextGuests = guests.filter((g) => g.id !== guestId);
    const nextAvoidPairs = avoidPairs.filter(
      (ap) => ap.guestAId !== guestId && ap.guestBId !== guestId,
    );
    set({ guests: nextGuests, avoidPairs: nextAvoidPairs });

    // Recalculate satisfaction
    const result = recalculateAll(nextGuests, tables, nextAvoidPairs);
    const recalcedGuests = nextGuests.map((g) => {
      const s = result.guests.find((gs) => gs.id === g.id);
      return s ? { ...g, satisfactionScore: s.satisfactionScore } : g;
    });
    const recalcedTables = tables.map((t) => {
      const ts = result.tables.find((ts) => ts.id === t.id);
      return ts ? { ...t, averageSatisfaction: ts.averageSatisfaction } : t;
    });
    set({ guests: recalcedGuests, tables: recalcedTables });

    try {
      await api.delete(`/events/${eventId}/guests/${guestId}`);
      return true;
    } catch {
      return false;
    }
  },

  addGuest: async (data) => {
    const { eventId, guests, tables, avoidPairs } = get();
    if (!eventId) return null;

    try {
      const res = await api.post(`/events/${eventId}/guests`, data);
      const raw = res.data;
      const guest: Guest = { ...raw, seatCount: (raw.companionCount ?? 0) + 1 };
      const nextGuests = [...guests, guest];
      set({ guests: nextGuests });
      trackEvent('add_guest', { method: 'manual', total_guests: nextGuests.length });

      // Recalculate if confirmed
      if (guest.rsvpStatus === 'confirmed') {
        const result = recalculateAll(nextGuests, tables, avoidPairs);
        const recalcedGuests = nextGuests.map((g) => {
          const s = result.guests.find((gs) => gs.id === g.id);
          return s ? { ...g, satisfactionScore: s.satisfactionScore } : g;
        });
        const recalcedTables = tables.map((t) => {
          const ts = result.tables.find((ts) => ts.id === t.id);
          return ts ? { ...t, averageSatisfaction: ts.averageSatisfaction } : t;
        });
        set({ guests: recalcedGuests, tables: recalcedTables });
      }

      return guest;
    } catch {
      return null;
    }
  },

  // ─── Per-guest preference & tag management ─────────

  updateGuestPreferences: async (guestId, preferences) => {
    const { eventId, guests, tables, avoidPairs } = get();
    if (!eventId) return false;

    // Enforce max 3 preferences
    const clamped = preferences.slice(0, 3);

    // Optimistic update + immediate recalculation
    const prevGuests = guests;
    const prevTables = tables;
    const idx = guests.findIndex((g) => g.id === guestId);
    if (idx < 0) return false;
    const nextGuests = [...guests];
    nextGuests[idx] = { ...nextGuests[idx], seatPreferences: clamped };

    const result = recalculateAll(nextGuests, tables, avoidPairs);
    const recalcedGuests = nextGuests.map((g) => {
      const s = result.guests.find((gs) => gs.id === g.id);
      return s ? { ...g, satisfactionScore: s.satisfactionScore } : g;
    });
    const recalcedTables = tables.map((t) => {
      const ts = result.tables.find((ts) => ts.id === t.id);
      return ts ? { ...t, averageSatisfaction: ts.averageSatisfaction } : t;
    });
    set({ guests: recalcedGuests, tables: recalcedTables });

    try {
      await api.put(`/events/${eventId}/guests/${guestId}/preferences`, { preferences: clamped });
      return true;
    } catch {
      set({ guests: prevGuests, tables: prevTables });
      return false;
    }
  },

  setGuestSubcategory: async (guestId, subcategoryId) => {
    const { eventId, guests } = get();
    if (!eventId) return false;

    const idx = guests.findIndex((g) => g.id === guestId);
    if (idx < 0) return false;

    try {
      const res = await api.patch(`/events/${eventId}/guests/${guestId}`, { subcategoryId });
      const updated = res.data;

      const nextGuests = [...guests];
      nextGuests[idx] = {
        ...nextGuests[idx],
        subcategory: updated.subcategory || null,
      };
      set({ guests: nextGuests });
      return true;
    } catch {
      return false;
    }
  },

  // ─── Workspace Save / Backup ──────────────────────────

  saveAll: async () => {
    const { eventId, guests, tables, isDirty, eventName } = get();
    if (!eventId || !isDirty) return;
    set({ isSaving: true });
    try {
      await api.put(`/events/${eventId}/workspace-state`, {
        eventName,
        tables: tables.map((t) => ({
          id: t.id,
          name: t.name,
          capacity: t.capacity,
          positionX: t.positionX,
          positionY: t.positionY,
          color: t.color ?? null,
          note: t.note ?? null,
        })),
        assignments: guests
          .filter((g) => g.rsvpStatus === 'confirmed')
          .map((g) => ({
            guestId: g.id,
            tableId: g.assignedTableId,
            seatIndex: g.seatIndex,
          })),
      });
      set({ isDirty: false, isSaving: false, lastSavedAt: Date.now() });
      try { localStorage.removeItem(`seatern-backup-${eventId}`); } catch { /* ok */ }
      // 更新 event cache，讓下次載入用最新狀態
      const s = get();
      saveEventCache({
        ts: Date.now(),
        eventId,
        eventName: s.eventName,
        eventCategories: s.eventCategories,
        guests: s.guests,
        tables: s.tables,
        subcategories: s.subcategories,
        avoidPairs: s.avoidPairs,
        snapshots: s.snapshots,
        tableLimit: s.tableLimit,
        planStatus: s.planStatus,
        planExpiresAt: s.planExpiresAt,
      });
    } catch (err) {
      console.error('Save failed:', err);
      set({ isSaving: false });
    }
  },

  restoreFromBackup: () => {
    const { backupData, guests, avoidPairs, eventId } = get();
    if (!backupData) return;

    // 還原 tables
    const restoredTables = backupData.tables;

    // 還原 guest assignments
    const restoredGuests = guests.map((g) => {
      const backup = backupData.guestAssignments.find((ba) => ba.id === g.id);
      return backup ? { ...g, assignedTableId: backup.assignedTableId, seatIndex: backup.seatIndex } : g;
    });

    const result = recalculateAll(restoredGuests, restoredTables, avoidPairs);
    const finalGuests = restoredGuests.map((g) => {
      const s = result.guests.find((gs) => gs.id === g.id);
      return s ? { ...g, satisfactionScore: s.satisfactionScore } : g;
    });
    const finalTables = restoredTables.map((t) => {
      const s = result.tables.find((ts) => ts.id === t.id);
      return s ? { ...t, averageSatisfaction: s.averageSatisfaction } : t;
    });

    set({
      eventName: backupData.eventName,
      guests: finalGuests,
      tables: finalTables,
      isDirty: true,
      showRecoveryPrompt: false,
      backupData: null,
    });

    if (eventId) scheduleBackup(eventId, get());
  },

  dismissBackup: () => {
    const { eventId } = get();
    set({ showRecoveryPrompt: false, backupData: null });
    if (eventId) {
      try { localStorage.removeItem(`seatern-backup-${eventId}`); } catch { /* ok */ }
    }
  },

  // Computed
  getTableGuests: (tableId) => {
    return get().guests.filter(
      (g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed',
    );
  },

  getUnassignedGuests: () => {
    return get().guests.filter(
      (g) => g.assignedTableId === null && g.rsvpStatus === 'confirmed',
    );
  },

  getTableSeatCount: (tableId) => {
    return get()
      .guests.filter((g) => g.assignedTableId === tableId && g.rsvpStatus === 'confirmed')
      .reduce((sum, g) => sum + g.seatCount, 0);
  },

  getTotalAssignedSeats: () => {
    return get()
      .guests.filter((g) => g.assignedTableId !== null && g.rsvpStatus === 'confirmed')
      .reduce((sum, g) => sum + g.seatCount, 0);
  },

  getTotalConfirmedSeats: () => {
    return get()
      .guests.filter((g) => g.rsvpStatus === 'confirmed')
      .reduce((sum, g) => sum + g.seatCount, 0);
  },
}));
