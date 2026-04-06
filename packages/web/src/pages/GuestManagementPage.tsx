import { useEffect, useState, useRef, useCallback } from 'react';
import { authFetch } from '@/lib/api';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Search, X, Palette } from 'lucide-react';
import { useSeatingStore } from '@/stores/seating';
import { useIsMobile } from '@/hooks/useIsMobile';
import { getSatisfactionColor } from '@/lib/satisfaction';
import { loadCategoryColors, saveCategoryColors, getCategoryColor, COLOR_PRESETS, PALETTE_HUES, PALETTE_SATS, type CategoryColor } from '@/lib/category-colors';
import GuestFormModal from '@/components/GuestFormModal';
import { AvoidPairModal } from '@/components/workspace/AvoidPairModal';
import type { Guest } from '@/lib/types';

// ─── Types ──────────────────────────────────────────

type SortField = 'name' | 'category' | 'rsvpStatus' | 'satisfactionScore' | 'assignedTableId' | 'companionCount' | 'prefCount' | 'avoidCount' | 'dietaryNote' | 'specialNote'
type SortDir = 'asc' | 'desc'
type CategoryFilter = '全部' | '未排座' | string

// ─── Helpers ────────────────────────────────────────

const RSVP_LABELS: Record<string, string> = {
  confirmed: '確認',
  declined: '婉拒',
};

const RSVP_CYCLE: string[] = ['confirmed', 'declined'];

function rsvpIcon(status: string) {
  return status === 'confirmed' ? '✓' : '✗';
}

function rsvpColor(status: string) {
  return status === 'confirmed' ? 'var(--success)' : 'var(--error)';
}

// ─── Category Color Picker ──────────────────────────

function CategoryColorPicker({ current, onPick, onPreview, rect, onEnter, onClose }: {
  current: CategoryColor; onPick: (c: CategoryColor) => void; onPreview: (c: CategoryColor | null) => void
  rect: { left: number; bottom: number }; onEnter: () => void; onClose: () => void
}) {
  const cols = PALETTE_HUES.length + 1; // hues + gray column
  const rows = PALETTE_SATS.length;

  return createPortal(
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onClose}
      className="fixed bg-[var(--bg-surface)] border border-[var(--border)] rounded-[var(--radius-md,8px)] p-2 shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-[9999]"
      style={{ left: rect.left, top: rect.bottom + 4 }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 20px)`, gap: 3 }}>
        {Array.from({ length: rows }, (_, si) =>
          COLOR_PRESETS.map((hueRow, hi) => (
            <div
              key={`${hi}-${si}`}
              onClick={() => onPick(hueRow[si])}
              onMouseEnter={() => onPreview(hueRow[si])}
              onMouseLeave={() => onPreview(null)}
              className="w-5 h-5 rounded-[3px] cursor-pointer"
              style={{
                background: hueRow[si].background,
                outline: hueRow[si].color === current.color ? `2px solid ${hueRow[si].color}` : 'none',
                outlineOffset: -1,
              }}
            />
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}

// ─── Toast ──────────────────────────────────────────

function Toast({ message, onUndo, onClose }: { message: string; onUndo?: () => void; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[var(--text-primary)] text-[var(--bg-surface)] px-5 py-2.5 rounded-[var(--radius-md,8px)] text-sm font-[family-name:var(--font-body)] flex items-center gap-3 z-[9999] shadow-[0_8px_30px_rgba(0,0,0,0.2)]"
    >
      <span>{message}</span>
      {onUndo && (
        <button onClick={onUndo} className="text-[var(--accent-light)] font-semibold cursor-pointer bg-transparent border-none text-sm">
          復原
        </button>
      )}
    </div>
  );
}

function NumberStepper({ value, min, max, onSave, maxTooltip }: { value: number; min: number; max: number; onSave: (v: number) => void; maxTooltip?: string }) {
  const atMax = value >= max;
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const popoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnRef = useRef<HTMLSpanElement>(null);

  const handleMaxHover = () => {
    if (!atMax || !maxTooltip) return;
    popoverTimer.current = setTimeout(() => {
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        setPopoverPos({ x: r.right, y: r.top - 6 });
      }
    }, 300);
  };
  const handleMaxLeave = () => {
    if (popoverTimer.current) clearTimeout(popoverTimer.current);
    setPopoverPos(null);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => value > min && onSave(value - 1)}
        disabled={value <= min}
        className="w-6 h-6 rounded-[var(--radius-sm,4px)] border border-[var(--border)] flex items-center justify-center text-sm"
        style={{
          background: value <= min ? 'transparent' : 'var(--bg-surface)',
          cursor: value <= min ? 'default' : 'pointer',
          color: value <= min ? 'var(--text-muted)' : 'var(--text-secondary)',
        }}
      >−</button>
      <span className="font-[family-name:var(--font-data)] tabular-nums min-w-[18px] text-center">{value}</span>
      <span ref={btnRef} onMouseEnter={handleMaxHover} onMouseLeave={handleMaxLeave} className="inline-flex">
        <button
          onClick={() => !atMax && onSave(value + 1)}
          disabled={atMax}
          className="w-6 h-6 rounded-[var(--radius-sm,4px)] border border-[var(--border)] flex items-center justify-center text-sm"
          style={{
            background: atMax ? 'transparent' : 'var(--bg-surface)',
            cursor: atMax ? 'default' : 'pointer',
            color: atMax ? 'var(--text-muted)' : 'var(--text-secondary)',
          }}
        >+</button>
      </span>
      {popoverPos && maxTooltip && createPortal(
        <div
          className="fixed -translate-x-full -translate-y-full bg-[var(--text-primary)] text-[var(--bg-surface)] px-2.5 py-1 rounded-[var(--radius-sm,4px)] text-xs font-[family-name:var(--font-ui)] whitespace-nowrap shadow-[0_4px_12px_rgba(0,0,0,0.15)] pointer-events-none z-[9999]"
          style={{ left: popoverPos.x, top: popoverPos.y }}
        >
          {maxTooltip}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Delete Confirm Modal ───────────────────────────

function DeleteConfirmModal({ guestName, tableName, onConfirm, onCancel }: {
  guestName: string; tableName: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
      <div className="bg-[var(--bg-surface)] rounded-[var(--radius-lg,12px)] p-6 max-w-[400px] w-[90%] shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
        <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-primary)] mb-2">確定要刪除？</h3>
        <p className="font-[family-name:var(--font-body)] text-sm text-[var(--text-secondary)] mb-5">
          {guestName} 目前在{tableName}，刪除後該座位會空出。
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded-[var(--radius-sm,4px)] border border-[var(--border)] bg-[var(--bg-surface)] cursor-pointer text-sm font-[family-name:var(--font-ui)] text-[var(--text-secondary)]"
          >取消</button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-[var(--radius-sm,4px)] border-none bg-[var(--error)] text-white cursor-pointer text-sm font-[family-name:var(--font-ui)] font-medium"
          >刪除</button>
        </div>
      </div>
    </div>
  );
}

// ─── Stats Bar ──────────────────────────────────────

function StatsBar({
  guests, onFilterClick,
}: { guests: Guest[]; onFilterClick: (status: string) => void }) {
  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed').length;
  const declined = guests.filter((g) => g.rsvpStatus === 'declined').length;
  const totalSeats = guests.filter((g) => g.rsvpStatus === 'confirmed').reduce((s, g) => s + g.seatCount, 0);
  const assigned = guests.filter((g) => g.assignedTableId && g.rsvpStatus === 'confirmed');
  const avgSat = assigned.length > 0 ? assigned.reduce((s, g) => s + g.satisfactionScore, 0) / assigned.length : 0;

  const statClass = "flex items-baseline gap-1 cursor-pointer px-2 py-1 rounded-[var(--radius-sm,4px)]";
  const numClass = "font-[family-name:var(--font-data)] font-bold text-xl tabular-nums";

  return (
    <>
      <div className={statClass} onClick={() => onFilterClick('confirmed')}>
        <span className={`${numClass} text-[var(--success)]`}>{confirmed}</span>
        <span>確認</span>
      </div>
      <div className={statClass} onClick={() => onFilterClick('declined')}>
        <span className={`${numClass} text-[var(--error)]`}>{declined}</span>
        <span>婉拒</span>
      </div>
      <div className="w-px h-5 bg-[var(--border)]" />
      <div className="flex items-baseline gap-1">
        <span className={`${numClass} text-[var(--text-primary)]`}>{totalSeats}</span>
        <span>席位</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={numClass} style={{ color: avgSat > 0 ? getSatisfactionColor(avgSat) : 'var(--text-muted)' }}>
          {avgSat > 0 ? avgSat.toFixed(1) : '—'}
        </span>
        <span>平均滿意度</span>
      </div>
    </>
  );
}

// ─── Main Page ──────────────────────────────────────

export default function GuestManagementPage() {
  const navigate = useNavigate();
  const eventId = useSeatingStore((s) => s.eventId);
  const guests = useSeatingStore((s) => s.guests);
  const tables = useSeatingStore((s) => s.tables);
  const avoidPairs = useSeatingStore((s) => s.avoidPairs);
  const updateGuest = useSeatingStore((s) => s.updateGuest);
  const addGuest = useSeatingStore((s) => s.addGuest);
  const moveGuest = useSeatingStore((s) => s.moveGuest);
  const updateGuestPreferences = useSeatingStore((s) => s.updateGuestPreferences);
  const setGuestSubcategory = useSeatingStore((s) => s.setGuestSubcategory);
  const subcategories = useSeatingStore((s) => s.subcategories);
  const addAvoidPair = useSeatingStore((s) => s.addAvoidPair);
  const removeAvoidPair = useSeatingStore((s) => s.removeAvoidPair);

  const isMobile = useIsMobile();

  // Category colors (localStorage-backed)
  const [categoryColors, setCategoryColors] = useState<Record<string, CategoryColor>>(() => loadCategoryColors(eventId || ''));
  const handleColorChange = useCallback((cat: string, c: CategoryColor) => {
    setCategoryColors((prev) => {
      const next = { ...prev, [cat]: c };
      saveCategoryColors(eventId || '', next);
      return next;
    });
  }, [eventId]);

  // Color picker state
  const [pickerCat, setPickerCat] = useState<{ cat: string; rect: { left: number; bottom: number } } | null>(null);
  const [previewColor, setPreviewColor] = useState<{ cat: string; color: CategoryColor } | null>(null);
  const [holdingCat, setHoldingCat] = useState<string | null>(null); // which button shows progress bar
  const pickerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PICKER_DELAY = 800;
  const cancelPickerClose = useCallback(() => {
    if (pickerCloseTimer.current) { clearTimeout(pickerCloseTimer.current); pickerCloseTimer.current = null; }
  }, []);
  const schedulePickerClose = useCallback(() => {
    cancelPickerClose();
    pickerCloseTimer.current = setTimeout(() => setPickerCat(null), 150);
  }, [cancelPickerClose]);

  // UI state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('全部');
  const [rsvpFilter, setRsvpFilter] = useState<string | null>(null);
  const [showDeclined, setShowDeclined] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ guestId: string; guestName: string; tableName: string } | null>(null);
  const deleteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [showAvoidModal, setShowAvoidModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [mobileColorCat, setMobileColorCat] = useState<string | null>(null);

  // Cleanup delete timers on unmount / navigate away
  useEffect(() => {
    return () => {
      deleteTimers.current.forEach((timer, guestId) => {
        clearTimeout(timer);
        // Fire pending deletes immediately
        const { eventId } = useSeatingStore.getState();
        if (eventId) {
          authFetch(`/api/events/${eventId}/guests/${guestId}`, { method: 'DELETE', credentials: 'include' });
        }
      });
      deleteTimers.current.clear();
    };
  }, []);

  // Get unique categories from event
  const eventCategories = useSeatingStore((s) => s.eventCategories);
  const categories = eventCategories.length > 0 ? eventCategories : ['男方', '女方', '共同'];

  // Merge preview color into effective colors
  const effectiveColors = previewColor
    ? { ...categoryColors, [previewColor.cat]: previewColor.color }
    : categoryColors;

  // Lookup maps
  const tableNameMap = new Map(tables.map((t) => [t.id, t.name]));

  // Filter + sort
  const filtered = guests.filter((g) => {
    if (categoryFilter === '未排座' || categoryFilter === '未排') {
      if (g.assignedTableId) return false;
    } else if (categoryFilter !== '全部' && g.category !== categoryFilter) return false;
    if (rsvpFilter && g.rsvpStatus !== rsvpFilter) return false;
    if (!showDeclined && !search && g.rsvpStatus === 'declined') return false;
    if (search) {
      const q = search.toLowerCase();
      const nameMatch = g.name.toLowerCase().includes(q);
      const aliasMatch = g.aliases.some((a) => a.toLowerCase().includes(q));
      if (!nameMatch && !aliasMatch) return false;
    }
    return true;
  }).sort((a, b) => {
    let cmp = 0;
    const avoidCount = (g: Guest) => avoidPairs.filter((ap) => ap.guestAId === g.id || ap.guestBId === g.id).length;
    switch (sortField) {
      case 'name': cmp = a.name.localeCompare(b.name, 'zh-Hant'); break;
      case 'category': cmp = (a.category || '').localeCompare(b.category || '', 'zh-Hant'); break;
      case 'rsvpStatus': cmp = a.rsvpStatus.localeCompare(b.rsvpStatus); break;
      case 'satisfactionScore': {
        // 未排桌的賓客視為 -1 分，確保排序能區分已排/未排
        const aScore = a.assignedTableId ? a.satisfactionScore : -1;
        const bScore = b.assignedTableId ? b.satisfactionScore : -1;
        cmp = aScore - bScore;
        break;
      }
      case 'assignedTableId': cmp = (a.assignedTableId || '').localeCompare(b.assignedTableId || ''); break;
      case 'companionCount': cmp = a.companionCount - b.companionCount; break;
      case 'prefCount': cmp = a.seatPreferences.length - b.seatPreferences.length; break;
      case 'avoidCount': cmp = avoidCount(a) - avoidCount(b); break;
      case 'dietaryNote': cmp = (a.dietaryNote || '').localeCompare(b.dietaryNote || '', 'zh-Hant'); break;
      case 'specialNote': cmp = (a.specialNote || '').localeCompare(b.specialNote || '', 'zh-Hant'); break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // Handlers
  const handleSave = useCallback(async (guestId: string, patch: Partial<Guest>) => {
    const ok = await updateGuest(guestId, patch);
    if (!ok) setToast({ message: '儲存失敗，已還原' });
  }, [updateGuest]);

  const handleDelete = useCallback((guest: Guest) => {
    if (guest.assignedTableId) {
      const tableName = tableNameMap.get(guest.assignedTableId) || '未知桌';
      setDeleteConfirm({ guestId: guest.id, guestName: guest.name, tableName });
    } else {
      // Soft delete: 先從 local state 移除，延遲刪 DB。Undo 時恢復 state 並取消 API call。
      const state = useSeatingStore.getState();
      const prevGuests = state.guests;
      const prevAvoidPairs = state.avoidPairs;

      // 從 local state 移除（不呼叫 deleteGuest，避免立即刪 DB）
      const nextGuests = prevGuests.filter((g) => g.id !== guest.id);
      const nextAvoidPairs = prevAvoidPairs.filter(
        (ap) => ap.guestAId !== guest.id && ap.guestBId !== guest.id,
      );
      useSeatingStore.setState({ guests: nextGuests, avoidPairs: nextAvoidPairs });

      const timer = setTimeout(async () => {
        deleteTimers.current.delete(guest.id);
        setToast(null);
        // Timer 到了才真正刪 DB
        try {
          await authFetch(`/api/events/${eventId}/guests/${guest.id}`, {
            method: 'DELETE',
            credentials: 'include',
          });
        } catch { /* ignore */ }
      }, 5000);
      deleteTimers.current.set(guest.id, timer);

      setToast({
        message: `已刪除 ${guest.name}`,
        onUndo: () => {
          clearTimeout(timer);
          deleteTimers.current.delete(guest.id);
          // 恢復 local state（DB 還沒刪，不需要重建）
          useSeatingStore.setState({ guests: prevGuests, avoidPairs: prevAvoidPairs });
          setToast(null);
        },
      });
    }
  }, [eventId, tableNameMap]);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteConfirm) return;
    const { guestId, guestName } = deleteConfirm;
    setDeleteConfirm(null);

    // Soft delete：同未入座邏輯，先移 local state，延遲刪 DB
    const state = useSeatingStore.getState();
    const prevGuests = state.guests;
    const prevAvoidPairs = state.avoidPairs;

    const nextGuests = prevGuests.filter((g) => g.id !== guestId);
    const nextAvoidPairs = prevAvoidPairs.filter(
      (ap) => ap.guestAId !== guestId && ap.guestBId !== guestId,
    );
    useSeatingStore.setState({ guests: nextGuests, avoidPairs: nextAvoidPairs });

    const timer = setTimeout(async () => {
      deleteTimers.current.delete(guestId);
      setToast(null);
      try {
        await authFetch(`/api/events/${eventId}/guests/${guestId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      } catch { /* ignore */ }
    }, 5000);
    deleteTimers.current.set(guestId, timer);

    setToast({
      message: `已刪除 ${guestName}`,
      onUndo: () => {
        clearTimeout(timer);
        deleteTimers.current.delete(guestId);
        useSeatingStore.setState({ guests: prevGuests, avoidPairs: prevAvoidPairs });
        setToast(null);
      },
    });
  }, [deleteConfirm, eventId]);

  const handleRsvpToggle = useCallback((guest: Guest) => {
    const idx = RSVP_CYCLE.indexOf(guest.rsvpStatus);
    const next = RSVP_CYCLE[(idx + 1) % RSVP_CYCLE.length];
    handleSave(guest.id, { rsvpStatus: next as any });
  }, [handleSave]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sortArrow = (field: SortField) => sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const handleRsvpFilterClick = (status: string) => {
    setRsvpFilter((prev) => prev === status ? null : status);
    if (status === 'declined') setShowDeclined(true);
  };

  // ─── Main view ────────────────────────────────
  return (
    <div className={`flex-1 bg-[var(--bg-primary)] flex flex-col ${isMobile ? 'h-full' : 'overflow-hidden'}`}>
      <div className={`mx-auto w-full flex flex-col flex-1 min-h-0 ${isMobile ? 'px-4 pt-3 overflow-hidden' : 'max-w-[1440px] px-6 pt-6'}`}>

        {/* Mobile: Stats bar */}
        {isMobile && (
          <div className="flex items-center gap-3 py-2 font-[family-name:var(--font-body)] text-sm text-[var(--text-secondary)] shrink-0">
            <StatsBar guests={guests} onFilterClick={handleRsvpFilterClick} />
          </div>
        )}

        {/* Search */}
        <div className={`font-[family-name:var(--font-body)] text-sm text-[var(--text-secondary)] shrink-0 ${isMobile ? 'py-2' : 'flex flex-wrap items-center gap-3 py-3 border-b border-[var(--border)]'}`}>
          <div className={`relative ${isMobile ? 'w-full mb-2' : 'flex-[0_1_240px]'}`}>
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋姓名/暱稱..."
              className="w-full py-1.5 pl-[30px] pr-2.5 rounded-[var(--radius-sm,4px)] border border-[var(--border)] bg-[var(--bg-surface)] text-sm font-[family-name:var(--font-body)] text-[var(--text-primary)] outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-[var(--text-muted)] p-0">
                <X size={14} />
              </button>
            )}
          </div>

          <div className={`flex border border-[var(--border)] rounded-[var(--radius-sm,4px)] ${isMobile ? 'overflow-x-auto shrink-0' : 'overflow-hidden'}`}>
            {isMobile && (
              <button
                onClick={() => setMobileColorCat(mobileColorCat ? null : categories[0])}
                className="px-2.5 py-[5px] border-none text-[13px] cursor-pointer shrink-0"
                style={{
                  background: mobileColorCat ? 'var(--accent-light)' : 'var(--bg-surface)',
                  color: mobileColorCat ? 'var(--accent)' : 'var(--text-muted)',
                  borderRight: '1px solid var(--border)',
                }}
              >
                <Palette size={14} />
              </button>
            )}
            {(() => {
              const visible = !showDeclined ? guests.filter((g) => g.rsvpStatus !== 'declined') : guests;
              const cats = isMobile ? ['全部', ...categories, '未排'] : ['全部', ...categories];
              return cats.map((cat) => {
              const count = cat === '全部' ? visible.length : (cat === '未排座' || cat === '未排') ? visible.filter((g) => !g.assignedTableId).length : visible.filter((g) => g.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => { setCategoryFilter(cat as CategoryFilter); setRsvpFilter(null); }}
                  onMouseEnter={(e) => {
                    if (isMobile || cat === '全部' || cat === '未排座') return;
                    if (pickerTimer.current) clearTimeout(pickerTimer.current);
                    setHoldingCat(cat);
                    const r = e.currentTarget.getBoundingClientRect();
                    pickerTimer.current = setTimeout(() => { setHoldingCat(null); setPickerCat({ cat, rect: { left: r.left, bottom: r.bottom } }); }, PICKER_DELAY);
                  }}
                  onMouseLeave={() => {
                    if (isMobile) return;
                    if (pickerTimer.current) clearTimeout(pickerTimer.current);
                    setHoldingCat(null);
                    schedulePickerClose();
                  }}
                  className="relative overflow-hidden px-3 py-[5px] border-none text-[13px] font-[family-name:var(--font-ui)] font-medium cursor-pointer whitespace-nowrap"
                  style={{
                    ...(() => {
                      if (cat === '全部' || cat === '未排座' || cat === '未排') {
                        return categoryFilter === cat
                          ? { background: (cat === '未排座' || cat === '未排') ? 'var(--warning)' : 'var(--accent)', color: '#fff' }
                          : { background: 'var(--bg-surface)', color: 'var(--text-secondary)' };
                      }
                      const badge = getCategoryColor(cat, effectiveColors);
                      return categoryFilter === cat
                        ? { background: badge.color, color: '#fff' }
                        : { background: badge.background, color: badge.color };
                    })(),
                  }}
                >
                  {cat} {count}
                  {holdingCat === cat && (
                    <div
                      className="absolute left-0 bottom-0 h-0.5 w-full opacity-60"
                      style={{
                        background: getCategoryColor(cat, effectiveColors).color,
                        animation: `pickerProgress ${PICKER_DELAY}ms linear forwards`,
                      }}
                    />
                  )}
                </button>
              );
            });
            })()}
          </div>

          {/* Mobile: palette button — moved into the chip row below */}

          {/* Mobile: color picker panel */}
          {isMobile && mobileColorCat && (
            <div className="w-full flex flex-col gap-2 p-3 border border-[var(--border)] rounded-[var(--radius-md,8px)] bg-[var(--bg-surface)]">
              <div className="flex gap-1.5 mb-1">
                {categories.map((cat) => {
                  const cc = getCategoryColor(cat, effectiveColors);
                  return (
                    <button
                      key={cat}
                      onClick={() => setMobileColorCat(cat)}
                      className="px-2.5 py-1 rounded-[var(--radius-sm,4px)] text-xs font-[family-name:var(--font-ui)] font-medium cursor-pointer"
                      style={{
                        border: mobileColorCat === cat ? `2px solid ${cc.color}` : `1px solid ${cc.border}`,
                        background: cc.background,
                        color: cc.color,
                      }}
                    >{cat}</button>
                  );
                })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PALETTE_HUES.length + 1}, 28px)`, gap: 4 }}>
                {Array.from({ length: PALETTE_SATS.length }, (_, si) =>
                  COLOR_PRESETS.map((hueRow, hi) => {
                    const c = hueRow[si];
                    const current = getCategoryColor(mobileColorCat, effectiveColors);
                    return (
                      <div
                        key={`${hi}-${si}`}
                        onClick={() => { handleColorChange(mobileColorCat, c); }}
                        className="w-7 h-7 rounded-[4px] cursor-pointer"
                        style={{
                          background: c.background,
                          outline: c.color === current.color ? `2px solid ${c.color}` : 'none',
                          outlineOffset: -1,
                        }}
                      />
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Category color picker (desktop) */}
          {pickerCat && (
            <CategoryColorPicker
              current={getCategoryColor(pickerCat.cat, effectiveColors)}
              onPick={(c) => { setPreviewColor(null); handleColorChange(pickerCat.cat, c); setPickerCat(null); }}
              onPreview={(c) => setPreviewColor(c ? { cat: pickerCat.cat, color: c } : null)}
              rect={pickerCat.rect}
              onEnter={cancelPickerClose}
              onClose={() => { setPreviewColor(null); schedulePickerClose(); }}
            />
          )}

          {rsvpFilter && (
            <button
              onClick={() => setRsvpFilter(null)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm,4px)] border border-[var(--border)] bg-[var(--accent-light)] text-[13px] font-[family-name:var(--font-ui)] cursor-pointer text-[var(--text-primary)]"
            >
              {RSVP_LABELS[rsvpFilter] || rsvpFilter} <X size={12} />
            </button>
          )}

          {!isMobile && (
            <>
              <label className="flex items-center gap-1.5 text-[13px] font-[family-name:var(--font-ui)] text-[var(--text-secondary)] cursor-pointer select-none">
                <div
                  onClick={() => setShowDeclined((v) => !v)}
                  className="w-8 h-[18px] rounded-[9px] relative cursor-pointer shrink-0 transition-colors duration-200"
                  style={{ background: showDeclined ? 'var(--accent)' : 'var(--border)' }}
                >
                  <div
                    className="w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-[left] duration-200 shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
                    style={{ left: showDeclined ? 16 : 2 }}
                  />
                </div>
                顯示婉拒
              </label>

              {/* Avoid pairs overview */}
              <button
                onClick={() => setShowAvoidModal(true)}
                className="flex items-center gap-1 px-3 py-[5px] rounded-[var(--radius-sm,4px)] border border-[var(--border)] text-[13px] font-[family-name:var(--font-ui)] cursor-pointer"
                style={{
                  background: avoidPairs.length > 0 ? '#FEF2F2' : 'var(--bg-surface)',
                  color: avoidPairs.length > 0 ? '#DC2626' : 'var(--text-secondary)',
                }}
              >
                避桌 {avoidPairs.length > 0 && <span className="font-semibold">{avoidPairs.length}</span>}
              </button>

              {/* 清除所有賓客 */}
              <button
                onClick={() => setShowClearAllConfirm(true)}
                disabled={guests.length === 0}
                className="flex items-center gap-1 px-3 py-[5px] rounded-[var(--radius-sm,4px)] border border-[var(--border)] text-[13px] font-[family-name:var(--font-ui)] cursor-pointer disabled:opacity-40 disabled:cursor-default"
                style={{
                  background: guests.length > 0 ? '#FEF2F2' : 'var(--bg-surface)',
                  color: guests.length > 0 ? '#DC2626' : 'var(--text-secondary)',
                }}
              >
                <Trash2 size={14} /> 刪除所有賓客
              </button>

              {/* Right: Stats */}
              <div className="ml-auto flex items-center gap-3">
                <StatsBar guests={guests} onFilterClick={handleRsvpFilterClick} />
              </div>
            </>
          )}
        </div>

        {/* Mobile: Card list */}
        {isMobile && (
          <div className="overflow-auto mt-2 flex-1 min-h-0 space-y-2 pb-4">
            {filtered.map((guest) => {
              const tableName = guest.assignedTableId ? tableNameMap.get(guest.assignedTableId) || '—' : '未排座';
              const satColor = guest.assignedTableId ? getSatisfactionColor(guest.satisfactionScore) : 'var(--text-muted)';
              const subcatName = guest.subcategory?.name ?? '';
              const prefGuests = guest.seatPreferences
                .slice().sort((a, b) => a.rank - b.rank)
                .map((p) => guests.find((g) => g.id === p.preferredGuestId))
                .filter(Boolean) as Guest[];
              const avoidGuestsList = avoidPairs
                .filter((ap) => ap.guestAId === guest.id || ap.guestBId === guest.id)
                .map((ap) => {
                  const otherId = ap.guestAId === guest.id ? ap.guestBId : ap.guestAId;
                  return guests.find((g) => g.id === otherId);
                })
                .filter(Boolean) as Guest[];
              const catColor = getCategoryColor(guest.category, effectiveColors);

              return (
                <div
                  key={guest.id}
                  role="button"
                  aria-label={`${guest.name} ${guest.category || ''} ${guest.rsvpStatus === 'confirmed' ? '確認' : '婉拒'}`}
                  onClick={() => setEditingGuestId(guest.id)}
                  className="p-3 border border-[var(--border)] rounded-[var(--radius-md,8px)] bg-[var(--bg-surface)] active:bg-[var(--accent-light)]"
                >
                  {/* Row 1: name + companion + RSVP */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-[var(--text-primary)] truncate">
                        {guest.aliases.length > 0 ? <>{guest.aliases[0]}<span className="text-[var(--text-muted)] font-normal text-sm">({guest.name})</span></> : guest.name}
                      </span>
                      {guest.companionCount > 0 && (
                        <span className="shrink-0 text-xs text-[var(--text-muted)] font-[family-name:var(--font-data)]">+{guest.companionCount}</span>
                      )}
                      {guest.category && (
                        <span className="shrink-0 px-1.5 py-px rounded-[var(--radius-sm,4px)] text-xs font-[family-name:var(--font-ui)] font-medium" style={{ background: catColor.background, border: `1px solid ${catColor.border}`, color: catColor.color }}>
                          {guest.category}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-semibold" style={{ color: rsvpColor(guest.rsvpStatus) }}>
                      {rsvpIcon(guest.rsvpStatus)}
                    </span>
                  </div>

                  {/* Row 2: table + subcategory + satisfaction */}
                  <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                    <span style={{ color: guest.assignedTableId ? 'var(--text-primary)' : 'var(--text-muted)' }}>{tableName}</span>
                    {subcatName && <span>{subcatName}</span>}
                    {guest.assignedTableId && (
                      <span className="ml-auto font-[family-name:var(--font-data)] tabular-nums font-semibold" style={{ color: satColor }}>
                        {guest.satisfactionScore.toFixed(0)}
                      </span>
                    )}
                  </div>

                  {/* Row 3: preferences, avoids, dietary (if any) */}
                  {(prefGuests.length > 0 || avoidGuestsList.length > 0 || guest.dietaryNote || guest.specialNote) && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--text-muted)]">
                      {prefGuests.length > 0 && <span>想同桌：{prefGuests.map((g) => g.aliases[0] || g.name).join('、')}</span>}
                      {avoidGuestsList.length > 0 && <span style={{ color: 'var(--error)' }}>避桌：{avoidGuestsList.map((g) => g.aliases[0] || g.name).join('、')}</span>}
                      {guest.dietaryNote && <span>{guest.dietaryNote}</span>}
                      {guest.specialNote && <span>{guest.specialNote}</span>}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Empty states */}
            {filtered.length === 0 && guests.length > 0 && (
              <div className="text-center py-10 text-[var(--text-muted)]">沒有符合的賓客</div>
            )}
            {guests.length === 0 && (
              <div className="text-center py-16">
                <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-primary)] mb-2">尚無賓客</p>
                <p className="font-[family-name:var(--font-body)] text-sm text-[var(--text-secondary)] mb-5">匯入名單或手動新增</p>
                <div className="flex justify-center gap-3">
                  <button onClick={() => setShowAddModal(true)} className="px-5 py-3 rounded-[var(--radius-sm,4px)] border-none bg-[var(--accent)] text-white cursor-pointer text-sm font-[family-name:var(--font-ui)] font-medium">
                    <Plus size={14} className="mr-1 align-[-2px] inline" /> 新增賓客
                  </button>
                  <button onClick={() => navigate('/import')} className="px-5 py-3 rounded-[var(--radius-sm,4px)] border border-[var(--border)] bg-[var(--bg-surface)] cursor-pointer text-sm font-[family-name:var(--font-ui)] text-[var(--text-secondary)]">
                    匯入名單
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Desktop: Table */}
        {!isMobile && <div className="overflow-auto mt-2 flex-1 min-h-0">
          <table className="w-full border-collapse font-[family-name:var(--font-body)] text-[15px]">
            <thead className="sticky top-0 z-10 bg-[var(--bg-primary)]">
              <tr className="border-b-2 border-[var(--border)]">
                <th onClick={() => handleSort('name')} className={thClass}>姓名{sortArrow('name')}</th>
                <th onClick={() => handleSort('category')} className={thClass}>分類{sortArrow('category')}</th>
                <th className={thClass}>子分類</th>
                <th onClick={() => handleSort('assignedTableId')} className={thClass}>桌次{sortArrow('assignedTableId')}</th>
                <th onClick={() => handleSort('satisfactionScore')} className={`${thClass} text-right`}>滿意度{sortArrow('satisfactionScore')}</th>
                <th onClick={() => handleSort('rsvpStatus')} className={`${thClass} text-center`}>出席{sortArrow('rsvpStatus')}</th>
                <th onClick={() => handleSort('companionCount')} className={`${thClass} text-center`}>攜眷{sortArrow('companionCount')}</th>
                <th onClick={() => handleSort('prefCount')} className={thClass}>想同桌{sortArrow('prefCount')}</th>
                <th onClick={() => handleSort('avoidCount')} className={thClass}>要避桌{sortArrow('avoidCount')}</th>
                <th onClick={() => handleSort('dietaryNote')} className={thClass}>飲食{sortArrow('dietaryNote')}</th>
                <th onClick={() => handleSort('specialNote')} className={thClass}>特殊需求{sortArrow('specialNote')}</th>
                <th className="w-[60px]" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((guest) => {
                const tableName = guest.assignedTableId ? tableNameMap.get(guest.assignedTableId) || '—' : '未排座';
                const satColor = guest.assignedTableId ? getSatisfactionColor(guest.satisfactionScore) : 'var(--text-muted)';
                const subcatName = guest.subcategory?.name ?? '';

                // Compute dynamic max companionCount based on table capacity
                let maxCompanion = 4;
                let maxCompanionTooltip: string | undefined;
                if (guest.assignedTableId) {
                  const table = tables.find((t) => t.id === guest.assignedTableId);
                  if (table) {
                    const othersSeats = guests
                      .filter((g) => g.assignedTableId === table.id && g.id !== guest.id && g.rsvpStatus === 'confirmed')
                      .reduce((sum, g) => sum + g.seatCount, 0);
                    maxCompanion = Math.min(4, table.capacity - othersSeats - 1);
                    if (maxCompanion <= guest.companionCount) {
                      const used = othersSeats + guest.seatCount;
                      maxCompanionTooltip = `${table.name}已滿 (${used}/${table.capacity})`;
                    }
                  }
                }

                // Seat preference guests (sorted by rank)
                const prefGuests = guest.seatPreferences
                  .slice().sort((a, b) => a.rank - b.rank)
                  .map((p) => guests.find((g) => g.id === p.preferredGuestId))
                  .filter(Boolean) as Guest[];

                // Avoid pair guests for this guest
                const avoidGuests = avoidPairs
                  .filter((ap) => ap.guestAId === guest.id || ap.guestBId === guest.id)
                  .map((ap) => {
                    const otherId = ap.guestAId === guest.id ? ap.guestBId : ap.guestAId;
                    return guests.find((g) => g.id === otherId);
                  })
                  .filter(Boolean) as Guest[];

                return (
                  <GuestRow
                    key={guest.id}
                    guest={guest}
                    tableName={tableName}
                    satColor={satColor}
                    subcatName={subcatName}
                    maxCompanion={maxCompanion}
                    maxCompanionTooltip={maxCompanionTooltip}
                    prefGuests={prefGuests}
                    avoidGuests={avoidGuests}
                    categoryColors={effectiveColors}
                    catColor={getCategoryColor(guest.category, effectiveColors)}
                    onSave={(patch) => handleSave(guest.id, patch)}
                    onRsvpToggle={() => handleRsvpToggle(guest)}
                    onDelete={() => handleDelete(guest)}
                    onEdit={() => setEditingGuestId(guest.id)}
                  />
                );
              })}

              {/* Empty search result */}
              {filtered.length === 0 && guests.length > 0 && (
                <tr><td colSpan={12} className="text-center p-10 text-[var(--text-muted)] font-[family-name:var(--font-body)]">
                  沒有符合的賓客
                </td></tr>
              )}

              {/* No guests at all */}
              {guests.length === 0 && (
                <tr><td colSpan={12} className="text-center px-6 py-[60px]">
                  <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-primary)] mb-2">尚無賓客</p>
                  <p className="font-[family-name:var(--font-body)] text-sm text-[var(--text-secondary)] mb-5">點擊下方新增或匯入名單</p>
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="px-5 py-2 rounded-[var(--radius-sm,4px)] border-none bg-[var(--accent)] text-white cursor-pointer text-sm font-[family-name:var(--font-ui)] font-medium"
                    >
                      <Plus size={14} className="mr-1 align-[-2px] inline" /> 新增賓客
                    </button>
                    <button onClick={() => navigate('/import')} className="px-5 py-2 rounded-[var(--radius-sm,4px)] border border-[var(--border)] bg-[var(--bg-surface)] cursor-pointer text-sm font-[family-name:var(--font-ui)] text-[var(--text-secondary)]">
                      匯入名單
                    </button>
                  </div>
                </td></tr>
              )}

            </tbody>
          </table>
        </div>}

        {/* Floating add button */}
        <button
          onClick={() => setShowAddModal(true)}
          className={`fixed z-50 flex items-center gap-1.5 bg-[var(--accent)] text-white border-none rounded-[var(--radius-md,8px)] cursor-pointer text-sm font-[family-name:var(--font-ui)] font-semibold shadow-[0_4px_16px_rgba(0,0,0,0.15)] ${isMobile ? 'right-4 bottom-[72px] w-12 h-12 justify-center p-0' : 'right-8 bottom-8 px-5 py-3'}`}
        >
          <Plus size={isMobile ? 20 : 16} />
          {!isMobile && <span>新增賓客</span>}
        </button>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} onUndo={toast.onUndo} onClose={() => setToast(null)} />}

      {/* Clear all guests confirm modal */}
      {showClearAllConfirm && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/25" onClick={() => setShowClearAllConfirm(false)} />
          <div className="relative bg-[var(--bg-surface)] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-6 w-[360px] border border-[var(--border)]">
            <p className="text-base font-semibold text-[#DC2626] mb-2">刪除所有賓客</p>
            <p className="text-sm text-[var(--text-secondary)] mb-2">
              將刪除此活動的所有賓客（{guests.length} 位）和所有桌次（{tables.length} 桌）。
            </p>
            <p className="text-[13px] text-[#DC2626] mb-4 font-medium">
              此操作無法復原。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowClearAllConfirm(false)}
                className="px-4 py-2 rounded-md border border-[var(--border)] bg-[var(--bg-surface)] cursor-pointer text-sm text-[var(--text-secondary)]"
              >
                取消
              </button>
              <button
                disabled={clearingAll}
                onClick={async () => {
                  setClearingAll(true);
                  try {
                    await authFetch(`/api/events/${eventId}/reset`, { method: 'DELETE' });
                    const { loadEvent } = useSeatingStore.getState();
                    if (eventId) await loadEvent();
                  } finally {
                    setClearingAll(false);
                    setShowClearAllConfirm(false);
                  }
                }}
                className="px-4 py-2 rounded-md border-none bg-[#DC2626] text-white text-sm font-medium"
                style={{ cursor: clearingAll ? 'wait' : 'pointer', opacity: clearingAll ? 0.6 : 1 }}
              >
                {clearingAll ? '清除中...' : '確定清除'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <DeleteConfirmModal
          guestName={deleteConfirm.guestName}
          tableName={deleteConfirm.tableName}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Guest edit modal */}
      {editingGuestId && (() => {
        const editGuest = guests.find((g) => g.id === editingGuestId);
        if (!editGuest) return null;
        return (
          <GuestFormModal
            mode="edit"
            guest={editGuest}
            categories={categories}
            subcategories={subcategories}
            tables={tables}
            guests={guests}
            avoidPairs={avoidPairs}
            categoryColors={effectiveColors}
            onSubmit={async (data) => {
              // Update basic fields
              await updateGuest(editGuest.id, {
                name: data.name,
                aliases: data.aliases,
                category: data.category,
                rsvpStatus: data.rsvpStatus,
                companionCount: data.companionCount,
                dietaryNote: data.dietaryNote,
                specialNote: data.specialNote,
              });
              // Move table if changed
              if (data.assignedTableId !== (editGuest.assignedTableId || null)) {
                moveGuest(editGuest.id, data.assignedTableId);
              }
              // Update preferences
              const prefs = data.preferredGuestIds.map((gid, i) => ({ preferredGuestId: gid, rank: i + 1 }));
              await updateGuestPreferences(editGuest.id, prefs);
              // Handle avoid pairs: remove old ones not in new list, add new ones not in old list
              const oldAvoidIds = avoidPairs
                .filter((ap) => ap.guestAId === editGuest.id || ap.guestBId === editGuest.id)
                .map((ap) => ({ pairId: ap.id, otherId: ap.guestAId === editGuest.id ? ap.guestBId : ap.guestAId }));
              for (const old of oldAvoidIds) {
                if (!data.avoidGuestIds.includes(old.otherId)) {
                  await removeAvoidPair(old.pairId);
                }
              }
              for (const gid of data.avoidGuestIds) {
                if (!oldAvoidIds.some((o) => o.otherId === gid)) {
                  await addAvoidPair(editGuest.id, gid);
                }
              }
              // Handle subcategory
              if (data.subcategoryName) {
                try {
                  await authFetch(`/api/events/${eventId}/subcategories/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ assignments: [{ guestId: editGuest.id, subcategoryName: data.subcategoryName, category: data.category }] }),
                  });
                } catch { /* no-op */ }
              } else if (editGuest.subcategory) {
                await setGuestSubcategory(editGuest.id, null);
              }
              // Reload to get fresh data
              const { loadEvent } = useSeatingStore.getState();
              if (eventId) await loadEvent();
              setEditingGuestId(null);
            }}
            onDelete={(gid) => { setEditingGuestId(null); handleDelete(guests.find((g) => g.id === gid)!); }}
            onClose={() => setEditingGuestId(null)}
          />
        );
      })()}
      {showAvoidModal && <AvoidPairModal onClose={() => setShowAvoidModal(false)} />}

      {/* Add guest modal */}
      {showAddModal && (
        <GuestFormModal
          mode="add"
          categories={categories}
          subcategories={subcategories}
          tables={tables}
          guests={guests}
          avoidPairs={avoidPairs}
          categoryColors={effectiveColors}
          onSubmit={async (data) => {
            const { subcategoryName, assignedTableId, preferredGuestIds, avoidGuestIds, ...guestData } = data;
            const guest = await addGuest(guestData);
            if (guest) {
              if (assignedTableId) moveGuest(guest.id, assignedTableId);
              if (preferredGuestIds.length > 0) {
                const prefs = preferredGuestIds.map((gid, i) => ({ preferredGuestId: gid, rank: i + 1 }));
                await updateGuestPreferences(guest.id, prefs);
              }
              for (const gid of avoidGuestIds) {
                await addAvoidPair(guest.id, gid);
              }
              if (subcategoryName && data.category) {
                try {
                  await authFetch(`/api/events/${eventId}/subcategories/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ assignments: [{ guestId: guest.id, subcategoryName, category: data.category }] }),
                  });
                } catch { /* no-op */ }
              }
              const { loadEvent } = useSeatingStore.getState();
              if (eventId) await loadEvent();
              setShowAddModal(false);
              setToast({ message: `已新增 ${data.name}` });
            }
          }}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

// ─── Guest Row (read-only display + quick edits) ───

const GuestRow = ({ guest, tableName, satColor, subcatName, maxCompanion, maxCompanionTooltip, prefGuests, avoidGuests, catColor, categoryColors, onSave, onRsvpToggle, onDelete, onEdit }: {
  guest: Guest; tableName: string; satColor: string; subcatName: string
  maxCompanion: number; maxCompanionTooltip?: string
  prefGuests: Guest[]; avoidGuests: Guest[]
  catColor: CategoryColor; categoryColors: Record<string, CategoryColor>
  onSave: (patch: Partial<Guest>) => void; onRsvpToggle: () => void; onDelete: () => void
  onEdit: () => void
}) => {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onEdit}
      className={`border-b border-[var(--border)] transition-colors duration-[50ms] cursor-pointer ${hovered ? 'bg-[var(--accent-light)]' : 'bg-transparent'}`}
    >
      {/* Name + aliases */}
      <td className={tdClass}>
        <div className="flex items-baseline gap-1">
          {guest.aliases.length > 0 ? (
            <>
              <span className="text-[15px] font-[family-name:var(--font-body)] text-[var(--text-primary)]">{guest.aliases[0]}</span>
              <span className="text-[13px] text-[var(--text-muted)] font-[family-name:var(--font-ui)]">({guest.name})</span>
            </>
          ) : (
            <span className="text-[15px] font-[family-name:var(--font-body)] text-[var(--text-primary)]">{guest.name}</span>
          )}
        </div>
      </td>

      {/* Category (read-only badge) */}
      <td className={tdClass}>
        {guest.category && (
          <span className="px-2 py-px rounded-[var(--radius-sm,4px)] text-sm font-[family-name:var(--font-ui)] font-medium" style={{ background: catColor.background, border: `1px solid ${catColor.border}`, color: catColor.color }}>
            {guest.category}
          </span>
        )}
      </td>

      {/* Subcategory (read-only) */}
      <td className={tdClass}>
        {subcatName ? (
          <span className="px-1.5 py-px rounded-[var(--radius-sm,4px)] border border-[var(--border)] text-sm text-[var(--text-secondary)] font-[family-name:var(--font-ui)]">{subcatName}</span>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        )}
      </td>

      {/* Table (read-only) */}
      <td className={tdClass}>
        <span className="text-[15px]" style={{ color: guest.assignedTableId ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {tableName}
        </span>
      </td>

      {/* Satisfaction */}
      <td className={`${tdClass} text-right`}>
        {guest.assignedTableId ? (
          <div className="inline-flex items-center justify-center relative w-9 h-9">
            <svg width={36} height={36} className="absolute inset-0 -rotate-90">
              <circle cx={18} cy={18} r={15} fill="none" stroke="#E7E5E4" strokeWidth={2.5} />
              <circle cx={18} cy={18} r={15} fill="none" stroke={satColor} strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 15 * Math.min(guest.satisfactionScore / 100, 1)} ${2 * Math.PI * 15}`}
                className="transition-[stroke-dasharray,stroke] duration-[400ms] ease-out"
              />
            </svg>
            <span className="relative font-[family-name:var(--font-data)] font-semibold tabular-nums text-xs" style={{ color: satColor }}>
              {guest.satisfactionScore.toFixed(0)}
            </span>
          </div>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        )}
      </td>

      {/* RSVP toggle (quick edit) */}
      <td className={`${tdClass} text-center`} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onRsvpToggle}
          title={RSVP_LABELS[guest.rsvpStatus]}
          className="w-7 h-7 rounded-[var(--radius-sm,4px)] border border-[var(--border)] bg-[var(--bg-surface)] cursor-pointer text-sm font-semibold inline-flex items-center justify-center"
          style={{ color: rsvpColor(guest.rsvpStatus) }}
        >{rsvpIcon(guest.rsvpStatus)}</button>
      </td>

      {/* Attendee count stepper (quick edit) */}
      <td className={`${tdClass} text-center`} onClick={(e) => e.stopPropagation()}>
        <NumberStepper value={guest.companionCount} min={0} max={maxCompanion} onSave={(v) => onSave({ companionCount: v })} maxTooltip={maxCompanionTooltip} />
      </td>

      {/* Seat preferences (read-only) */}
      <td className={tdClass}>
        {prefGuests.length > 0 ? (
          <div className="flex gap-[3px] flex-wrap">
            {prefGuests.map((g) => {
              const cc = getCategoryColor(g.category, categoryColors);
              return (
                <span key={g.id} className="px-1.5 py-px rounded-[var(--radius-sm,4px)] text-sm font-[family-name:var(--font-ui)]" style={{
                  background: cc.background, border: `1px solid ${cc.border}`, color: cc.color,
                }}>{g.aliases.length > 0 ? g.aliases[0] : g.name}</span>
              );
            })}
          </div>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        )}
      </td>

      {/* Avoid pairs (read-only) */}
      <td className={tdClass}>
        {avoidGuests.length > 0 ? (
          <div className="flex gap-[3px] flex-wrap">
            {avoidGuests.map((g) => {
              const cc = getCategoryColor(g.category, categoryColors);
              return (
                <span key={g.id} className="px-1.5 py-px rounded-[var(--radius-sm,4px)] text-sm font-[family-name:var(--font-ui)]" style={{
                  background: cc.background, border: `1px solid ${cc.border}`, color: cc.color,
                }}>{g.aliases.length > 0 ? g.aliases[0] : g.name}</span>
              );
            })}
          </div>
        ) : (
          <span className="text-[var(--text-muted)]">—</span>
        )}
      </td>

      {/* Dietary note (read-only) */}
      <td className={tdClass}>
        <span className={`text-[15px] ${guest.dietaryNote ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}>
          {guest.dietaryNote || '—'}
        </span>
      </td>

      {/* Special note (read-only) */}
      <td className={tdClass}>
        <span className={`text-[15px] ${guest.specialNote ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}>
          {guest.specialNote || '—'}
        </span>
      </td>

      {/* Delete button */}
      <td className="w-9 px-1">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="bg-transparent border-none cursor-pointer p-1 rounded-[var(--radius-sm,4px)] transition-colors duration-100"
          style={{ color: hovered ? 'var(--error)' : 'transparent' }}
          title="刪除"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
};

// ─── Styles ─────────────────────────────────────────

const thClass = "px-3 py-2 text-left font-[family-name:var(--font-ui)] text-sm font-semibold text-[var(--text-muted)] uppercase cursor-pointer select-none whitespace-nowrap";

const tdClass = "px-3 py-2 align-middle";
