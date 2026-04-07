import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { Guest, Table, AvoidPair, Subcategory, RsvpStatus } from '@/lib/types';
import type { CategoryColor } from '@/lib/category-colors';
import { getCategoryColor } from '@/lib/category-colors';

// ─── Types ────────────────────────────────────────

export interface GuestFormData {
  name: string
  aliases: string[]
  category: string
  subcategoryName?: string
  rsvpStatus: RsvpStatus
  companionCount: number
  assignedTableId: string | null
  dietaryNote: string
  specialNote: string
  preferredGuestIds: string[]
  avoidGuestIds: string[]
}

interface GuestFormModalProps {
  mode: 'add' | 'edit'
  guest?: Guest
  categories: string[]
  subcategories: Subcategory[]
  tables: Table[]
  guests: Guest[]
  avoidPairs: AvoidPair[]
  categoryColors: Record<string, CategoryColor>
  onSubmit: (data: GuestFormData) => Promise<void>
  onDelete?: (guestId: string) => void
  onClose: () => void
}

// ─── Helpers ───────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 15, color: 'var(--text-secondary)',
  width: 80, flexShrink: 0, paddingTop: 6,
};

const mobileLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--text-secondary)',
  fontWeight: 500, paddingBottom: 2,
};

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '5px 0',
};

const mobileRowStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 0',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12, fontFamily: 'var(--font-ui)', fontWeight: 600,
  color: 'var(--text-muted)', textTransform: 'uppercase' as const,
  letterSpacing: 0.5, padding: '0 0 6px', marginBottom: 4,
  borderBottom: '1px solid var(--border)',
};

const inputStyle: React.CSSProperties = {
  border: 'none', borderBottom: '1px dashed var(--border)',
  background: 'rgba(0,0,0,0.02)', fontSize: 15, fontFamily: 'var(--font-body)',
  color: 'var(--text-primary)', outline: 'none', padding: '4px 6px',
  width: '100%', borderRadius: 2,
};

const inputFocusStyle: React.CSSProperties = {
  ...inputStyle,
  borderBottom: '2px solid var(--accent)',
  background: 'var(--accent-light)',
};

// ─── Small Editable Input ──────────────────────────

function FieldInput({ value, onChange, placeholder, maxLength = 100 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    setFocused(false);
    onChange(draft.trim());
  };

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value.slice(0, maxLength))}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setFocused(false); inputRef.current?.blur(); } }}
      placeholder={placeholder}
      style={focused ? inputFocusStyle : inputStyle}
    />
  );
}

// ─── Guest Search Dropdown ─────────────────────────

export const CATEGORY_ORDER = ['男方', '女方', '共同'];

// ─── Add Picker Button (+新增 → floating chip picker) ──

export function AddPickerButton({ guests, excludeIds, onSelect, categoryColors, placeholder }: {
  guests: Guest[]; excludeIds: Set<string>; onSelect: (guestId: string) => void
  categoryColors: Record<string, CategoryColor>; placeholder?: string
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const confirmed = useMemo(() => guests.filter((g) => g.rsvpStatus === 'confirmed' && !excludeIds.has(g.id)), [guests, excludeIds]);

  const grouped = useMemo(() => {
    const allCats = Array.from(new Set(confirmed.map((g) => g.category ?? '其他')));
    const sorted = [...CATEGORY_ORDER.filter((c) => allCats.includes(c)), ...allCats.filter((c) => !CATEGORY_ORDER.includes(c))];
    const q = search.trim().toLowerCase();
    return sorted.map((cat) => {
      let catGuests = confirmed.filter((g) => (g.category ?? '其他') === cat);
      if (q) catGuests = catGuests.filter((g) => g.name.toLowerCase().includes(q) || g.aliases.some((a) => a.toLowerCase().includes(q)));
      const subcatNames = Array.from(new Set(catGuests.map((g) => g.subcategory?.name).filter(Boolean))) as string[];
      const subGroups = [
        ...subcatNames.map((sn) => ({ tagName: sn, guests: catGuests.filter((g) => g.subcategory?.name === sn) })),
        { tagName: null as string | null, guests: catGuests.filter((g) => !g.subcategory) },
      ].filter((sg) => sg.guests.length > 0);
      return { category: cat, subGroups };
    }).filter((g) => g.subGroups.some((sg) => sg.guests.length > 0));
  }, [confirmed, search]);

  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 4 });
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-[var(--radius-sm,4px)] border border-dashed border-[var(--border)] bg-none text-[13px] font-[family-name:var(--font-ui)] text-[var(--accent)] cursor-pointer whitespace-nowrap"
      >
        + 新增
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed w-[320px] z-[10000] border border-[var(--border)] rounded-[var(--radius-md,8px)] p-2 bg-[var(--bg-surface)] shadow-[0_12px_32px_rgba(0,0,0,0.15)]"
          style={{ left: pos.left, top: pos.top }}
        >
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder || '搜尋賓客...'}
            className="w-full px-2 py-1 border border-[var(--border)] rounded-[var(--radius-sm,4px)] text-sm font-[family-name:var(--font-ui)] outline-none bg-[var(--bg-surface)] text-[var(--text-primary)] box-border mb-1.5"
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          />
          <div className="max-h-60 overflow-y-auto">
            {grouped.length === 0 ? (
              <div className="text-[13px] text-[var(--text-muted)] p-1">
                {search.trim() ? `找不到「${search}」` : '沒有可選的賓客'}
              </div>
            ) : (
              grouped.map(({ category, subGroups }) => {
                const catColor = getCategoryColor(category, categoryColors);
                return (
                  <div key={category} className="mb-2">
                    <div className="flex items-center gap-1 mb-1">
                      <span
                        className="text-xs font-semibold px-1.5 py-px rounded-[3px]"
                        style={{
                          background: catColor.background, color: catColor.color, border: `1px solid ${catColor.border}`,
                        }}
                      >{category}</span>
                    </div>
                    {subGroups.map(({ tagName, guests: sgGuests }) => (
                      <div key={tagName ?? '__no_tag__'} className="pl-2 mb-1" style={{ borderLeft: `2px solid ${catColor.border}` }}>
                        {tagName && <div className="text-[11px] text-[var(--text-muted)] mb-0.5">{tagName}</div>}
                        <div className="flex flex-wrap gap-[3px]">
                          {sgGuests.map((g) => (
                            <button
                              key={g.id}
                              onClick={() => { onSelect(g.id); }}
                              className="px-2 py-0.5 text-[13px] font-[family-name:var(--font-body)] rounded-[var(--radius-sm,4px)] cursor-pointer whitespace-nowrap"
                              style={{
                                border: `1px solid ${catColor.border}`, background: catColor.background,
                                color: catColor.color,
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-light)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = catColor.background; e.currentTarget.style.borderColor = catColor.border; }}
                            >
                              {g.aliases.length > 0 ? g.aliases[0] : g.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Fixed Dropdown (portal) ───────────────────────

export function FixedDropdown({ anchorRef, children, onClose, style: extraStyle }: {
  anchorRef: React.RefObject<HTMLElement | null>; children: React.ReactNode; onClose: () => void; style?: React.CSSProperties
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useEffect(() => {
    if (anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 4 });
    }
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  return createPortal(
    <div ref={popRef} className="fixed z-[10000] bg-[var(--bg-surface)] border border-[var(--border)] rounded-[var(--radius-md,8px)] shadow-[0_8px_24px_rgba(0,0,0,0.12)] p-1 min-w-[120px]" style={{
      left: pos.left, top: pos.top, ...extraStyle,
    }}>
      {children}
    </div>,
    document.body,
  );
}

// ─── Main Modal ────────────────────────────────────

export default function GuestFormModal({
  mode, guest, categories, subcategories, tables, guests, avoidPairs, categoryColors,
  onSubmit, onDelete, onClose,
}: GuestFormModalProps) {
  const isMobile = useIsMobile();
  const _row = isMobile ? mobileRowStyle : rowStyle;
  const _label = isMobile ? mobileLabelStyle : labelStyle;

  // ─── Internal draft state ──────────────────────────
  const [name, setName] = useState(mode === 'edit' && guest ? guest.name : '');
  const [alias, setAlias] = useState(mode === 'edit' && guest ? (guest.aliases[0] || '') : '');
  const [category, setCategory] = useState(mode === 'edit' && guest ? (guest.category || categories[0] || '男方') : (categories[0] || '男方'));
  const [subcatName, setSubcatName] = useState(mode === 'edit' && guest ? (guest.subcategory?.name || '') : '');
  const [newSubcat, setNewSubcat] = useState('');
  const [rsvp, setRsvp] = useState<'confirmed' | 'declined'>(mode === 'edit' && guest ? guest.rsvpStatus : 'confirmed');
  const [companion, setCompanion] = useState(mode === 'edit' && guest ? guest.companionCount : 0);
  const [tableId, setTableId] = useState<string | null>(mode === 'edit' && guest ? (guest.assignedTableId || null) : null);
  const [prefIds, setPrefIds] = useState<string[]>(
    mode === 'edit' && guest
      ? guest.seatPreferences.slice().sort((a, b) => a.rank - b.rank).map((p) => p.preferredGuestId)
      : []
  );
  const [avoidIds, setAvoidIds] = useState<string[]>(
    mode === 'edit' && guest
      ? avoidPairs
          .filter((ap) => ap.guestAId === guest.id || ap.guestBId === guest.id)
          .map((ap) => ap.guestAId === guest.id ? ap.guestBId : ap.guestAId)
      : []
  );
  const [dietary, setDietary] = useState(mode === 'edit' && guest ? (guest.dietaryNote || '') : '');
  const [special, setSpecial] = useState(mode === 'edit' && guest ? (guest.specialNote || '') : '');
  const [tableOpen, setTableOpen] = useState(false);
  const [subcatOpen, setSubcatOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const tableAnchorRef = useRef<HTMLSpanElement>(null);
  const subcatAnchorRef = useRef<HTMLSpanElement>(null);
  const newSubcatInputRef = useRef<HTMLInputElement>(null);

  // Reset subcatName when category changes
  const prevCatRef = useRef(category);
  useEffect(() => {
    if (prevCatRef.current !== category) {
      setSubcatName('');
      setNewSubcat('');
      prevCatRef.current = category;
    }
  }, [category]);

  // Focus new subcat input when entering new-subcat mode
  useEffect(() => {
    if (subcatName === '__new__') {
      setTimeout(() => newSubcatInputRef.current?.focus(), 50);
    }
  }, [subcatName]);

  // ─── Table info ─────────────────────────────────────
  const seatCount = companion + 1;
  const tableInfo = tables.map((t) => {
    const used = guests.filter((g) => g.assignedTableId === t.id && g.rsvpStatus === 'confirmed').reduce((s, g) => s + g.seatCount, 0);
    return { ...t, used, remaining: t.capacity - used };
  });
  const currentTable = tableId ? tables.find((t) => t.id === tableId) : null;

  // ─── Exclude sets ───────────────────────────────────
  const selfId = mode === 'edit' && guest ? guest.id : undefined;
  const prefExcludeIds = useMemo(() => {
    const ids = new Set(prefIds);
    if (selfId) ids.add(selfId);
    return ids;
  }, [prefIds, selfId]);
  const avoidExcludeIds = useMemo(() => {
    const ids = new Set(avoidIds);
    if (selfId) ids.add(selfId);
    return ids;
  }, [avoidIds, selfId]);

  // ─── Filtered subcategories ─────────────────────────
  const filteredSubcats = subcategories.filter((sc) => sc.category === category);

  // ─── Submit handler ─────────────────────────────────
  const handleSubmit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        aliases: alias.trim() ? [alias.trim()] : [],
        category,
        subcategoryName: (newSubcat.trim() || (subcatName && subcatName !== '__new__' ? subcatName : undefined)) || undefined,
        rsvpStatus: rsvp,
        companionCount: companion,
        assignedTableId: tableId,
        dietaryNote: dietary.trim(),
        specialNote: special.trim(),
        preferredGuestIds: prefIds,
        avoidGuestIds: avoidIds,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ─────────────────────────────────────────
  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={isMobile
          ? 'bg-[var(--bg-surface)] w-full h-full overflow-auto p-4'
          : 'bg-[var(--bg-surface)] rounded-[var(--radius-lg,12px)] p-6 max-w-[820px] w-[90%] max-h-[90vh] overflow-auto shadow-[0_8px_30px_rgba(0,0,0,0.12)]'
        }
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-primary)] m-0">
            {mode === 'add' ? '新增賓客' : `${guest!.name}的詳細資訊`}
          </h3>
          <button
            onClick={onClose}
            className="bg-none border-none cursor-pointer p-1 text-[var(--text-muted)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form — two columns on desktop, single column on mobile */}
        <div className={isMobile ? 'flex flex-col gap-4' : 'flex gap-6'}>

          {/* Left column: basic info */}
          <div className="flex-1 flex flex-col">

            <div style={sectionTitleStyle}>基本資料</div>

            {/* 1. 姓名 + 暱稱 */}
            <div style={_row}>
              <span style={_label}>
                姓名{mode === 'add' && <span className="text-[var(--error)]"> *</span>}
              </span>
              <div className="flex-1">
                <FieldInput value={name} onChange={setName} maxLength={50} />
              </div>
              <span style={{ ..._label, width: 'auto', paddingLeft: 8 }}>暱稱</span>
              <div className="flex-1">
                <FieldInput
                  value={alias}
                  onChange={setAlias}
                  placeholder="暱稱..."
                  maxLength={20}
                />
              </div>
            </div>

            {/* 2. 分類 */}
            <div style={_row}>
              <span style={_label}>分類</span>
              <div className="flex-1 flex gap-1.5 pt-0.5">
                {categories.map((cat) => {
                  const cc = getCategoryColor(cat, categoryColors);
                  const selected = category === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className="px-3 py-[3px] rounded-[var(--radius-sm,4px)] text-sm font-[family-name:var(--font-ui)] font-medium cursor-pointer"
                      style={{
                        border: selected ? `2px solid ${cc.color}` : `1px solid ${cc.border}`,
                        background: selected ? cc.background : 'var(--bg-surface)',
                        color: selected ? cc.color : 'var(--text-secondary)',
                      }}
                    >{cat}</button>
                  );
                })}
              </div>
            </div>

            {/* 3. 子分類 */}
            <div style={_row}>
              <span style={_label}>子分類</span>
              <div className="flex-1 pt-1 relative">
                <span
                  ref={subcatAnchorRef}
                  onClick={() => setSubcatOpen(!subcatOpen)}
                  className="text-[15px] cursor-pointer inline-flex items-center gap-0.5"
                  style={{
                    color: subcatName && subcatName !== '__new__' ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  {subcatName && subcatName !== '__new__' ? subcatName : '未指定'}
                  <ChevronDown size={10} className="text-[var(--text-muted)]" />
                </span>
                {subcatOpen && (
                  <FixedDropdown anchorRef={subcatAnchorRef} onClose={() => setSubcatOpen(false)} style={{ minWidth: 180, maxHeight: 240, overflow: 'auto' }}>
                    <div
                      onClick={() => { setSubcatName(''); setNewSubcat(''); setSubcatOpen(false); }}
                      className="px-2 py-1 rounded-[var(--radius-sm,4px)] cursor-pointer text-sm font-[family-name:var(--font-ui)] text-[var(--text-muted)]"
                      style={{
                        background: !subcatName ? 'var(--accent-light)' : 'transparent',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--accent-light)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = !subcatName ? 'var(--accent-light)' : 'transparent'; }}
                    >
                      （未指定）
                    </div>
                    {filteredSubcats.map((sc) => (
                      <div
                        key={sc.id}
                        onClick={() => { setSubcatName(sc.name); setNewSubcat(''); setSubcatOpen(false); }}
                        className="px-2 py-1 rounded-[var(--radius-sm,4px)] cursor-pointer text-sm font-[family-name:var(--font-ui)] text-[var(--text-primary)]"
                        style={{
                          background: subcatName === sc.name ? 'var(--accent-light)' : 'transparent',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--accent-light)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = subcatName === sc.name ? 'var(--accent-light)' : 'transparent'; }}
                      >
                        {sc.name}
                      </div>
                    ))}
                    <div
                      onClick={() => { setSubcatName('__new__'); setSubcatOpen(false); }}
                      className="px-2 py-1 rounded-[var(--radius-sm,4px)] cursor-pointer text-sm font-[family-name:var(--font-ui)] text-[var(--accent)] border-t border-[var(--border)] mt-1 pt-1.5"
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--accent-light)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                    >
                      ＋ 新增子分類
                    </div>
                  </FixedDropdown>
                )}
                {subcatName === '__new__' && (
                  <div className="mt-1.5">
                    <input
                      ref={newSubcatInputRef}
                      value={newSubcat}
                      onChange={(e) => setNewSubcat(e.target.value.slice(0, 50))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newSubcat.trim()) {
                          setSubcatName(newSubcat.trim());
                        }
                        if (e.key === 'Escape') {
                          setSubcatName('');
                          setNewSubcat('');
                        }
                      }}
                      onBlur={() => {
                        if (newSubcat.trim()) {
                          setSubcatName(newSubcat.trim());
                        } else {
                          setSubcatName('');
                          setNewSubcat('');
                        }
                      }}
                      placeholder="輸入子分類名稱..."
                      style={{
                        ...inputStyle,
                        width: 180,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            <div style={{ ...sectionTitleStyle, marginTop: 12 }}>出席狀態</div>

            {/* 4. 出席 */}
            <div style={_row}>
              <span style={_label}>出席</span>
              <div className="flex-1 flex gap-2 pt-1">
                <button
                  onClick={() => setRsvp('confirmed')}
                  className="px-3.5 py-1 rounded-[var(--radius-sm,4px)] cursor-pointer text-[15px] font-[family-name:var(--font-ui)] font-semibold"
                  style={{
                    border: rsvp === 'confirmed' ? '2px solid var(--success)' : '1px solid var(--border)',
                    background: rsvp === 'confirmed' ? 'rgba(34,197,94,0.08)' : 'var(--bg-surface)',
                    color: rsvp === 'confirmed' ? 'var(--success)' : 'var(--text-muted)',
                  }}
                >
                  ✓ 確認
                </button>
                <button
                  onClick={() => setRsvp('declined')}
                  className="px-3.5 py-1 rounded-[var(--radius-sm,4px)] cursor-pointer text-[15px] font-[family-name:var(--font-ui)] font-semibold"
                  style={{
                    border: rsvp === 'declined' ? '2px solid var(--error)' : '1px solid var(--border)',
                    background: rsvp === 'declined' ? 'rgba(239,68,68,0.08)' : 'var(--bg-surface)',
                    color: rsvp === 'declined' ? 'var(--error)' : 'var(--text-muted)',
                  }}
                >
                  ✗ 婉拒
                </button>
              </div>
            </div>

          </div>

          {/* Right column: seating & notes */}
          <div className="flex-1 flex flex-col">

            <div style={sectionTitleStyle}>排位</div>

            {/* 1. 桌次 + 攜眷 */}
            <div style={_row}>
              <span style={_label}>桌次</span>
              <div className="flex-1 pt-1 relative">
                <span
                  ref={tableAnchorRef}
                  onClick={() => setTableOpen(!tableOpen)}
                  className="text-[15px] cursor-pointer inline-flex items-center gap-0.5"
                  style={{
                    color: tableId ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  {currentTable ? currentTable.name : '未排座'}
                  <ChevronDown size={10} className="text-[var(--text-muted)]" />
                </span>
                {tableOpen && (
                  <FixedDropdown anchorRef={tableAnchorRef} onClose={() => setTableOpen(false)} style={{ minWidth: 180, maxHeight: 240, overflow: 'auto' }}>
                    <div
                      onClick={() => { setTableId(null); setTableOpen(false); }}
                      className="px-2 py-1 rounded-[var(--radius-sm,4px)] cursor-pointer text-sm font-[family-name:var(--font-ui)] text-[var(--text-muted)]"
                      style={{
                        background: !tableId ? 'var(--accent-light)' : 'transparent',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--accent-light)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = !tableId ? 'var(--accent-light)' : 'transparent'; }}
                    >
                      未排座
                    </div>
                    {tableInfo.map((t) => {
                      const isCurrent = t.id === tableId;
                      const full = isCurrent ? false : t.remaining < seatCount;
                      return (
                        <div
                          key={t.id}
                          onClick={() => { if (!full || isCurrent) { setTableId(t.id); setTableOpen(false); } }}
                          className="px-2 py-1 rounded-[var(--radius-sm,4px)] text-sm font-[family-name:var(--font-ui)] flex justify-between gap-2"
                          style={{
                            cursor: full && !isCurrent ? 'default' : 'pointer',
                            color: full && !isCurrent ? 'var(--text-muted)' : 'var(--text-primary)',
                            opacity: full && !isCurrent ? 0.5 : 1,
                            background: isCurrent ? 'var(--accent-light)' : 'transparent',
                          }}
                          onMouseEnter={(e) => { if (!full || isCurrent) (e.currentTarget as HTMLDivElement).style.background = 'var(--accent-light)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isCurrent ? 'var(--accent-light)' : 'transparent'; }}
                        >
                          <span>{t.name}</span>
                          <span className="text-[var(--text-muted)]">({t.used}/{t.capacity})</span>
                        </div>
                      );
                    })}
                  </FixedDropdown>
                )}
              </div>
              <span style={{ ..._label, width: 'auto', paddingLeft: 8 }}>攜眷</span>
              <div className="flex items-center gap-1 pt-1">
                <button
                  onClick={() => companion > 0 && setCompanion(companion - 1)}
                  disabled={companion <= 0}
                  className="w-7 h-7 rounded-[var(--radius-sm,4px)] border border-[var(--border)] flex items-center justify-center text-base"
                  style={{
                    background: companion <= 0 ? 'transparent' : 'var(--bg-surface)',
                    cursor: companion <= 0 ? 'default' : 'pointer',
                    color: companion <= 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
                  }}
                >−</button>
                <span className="font-[family-name:var(--font-data)] tabular-nums min-w-6 text-center text-[15px]">{companion}</span>
                <button
                  onClick={() => companion < 4 && setCompanion(companion + 1)}
                  disabled={companion >= 4}
                  className="w-7 h-7 rounded-[var(--radius-sm,4px)] border border-[var(--border)] flex items-center justify-center text-base"
                  style={{
                    background: companion >= 4 ? 'transparent' : 'var(--bg-surface)',
                    cursor: companion >= 4 ? 'default' : 'pointer',
                    color: companion >= 4 ? 'var(--text-muted)' : 'var(--text-secondary)',
                  }}
                >+</button>
              </div>
            </div>

            {/* 2. 想同桌 */}
            <div style={_row}>
              <span style={_label}>想同桌</span>
              <div className="flex-1 pt-1">
                <div className="flex gap-1 flex-wrap items-center">
                  {prefIds.map((pid) => {
                    const g = guests.find((x) => x.id === pid);
                    const display = g ? (g.aliases.length > 0 ? g.aliases[0] : g.name) : '?';
                    const cc = g ? getCategoryColor(g.category, categoryColors) : null;
                    return (
                      <span key={pid} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-[var(--radius-sm,4px)] text-sm font-[family-name:var(--font-ui)]" style={{
                        background: cc?.background || 'var(--accent-light)',
                        border: `1px solid ${cc?.border || 'var(--border)'}`,
                        color: cc?.color || 'var(--text-primary)',
                      }}>
                        {display}
                        <button
                          onClick={() => setPrefIds(prefIds.filter((id) => id !== pid))}
                          className="bg-none border-none cursor-pointer p-0 text-[10px] leading-none opacity-60"
                          style={{ color: cc?.color || 'var(--text-muted)' }}
                        >
                          <X size={14} />
                        </button>
                      </span>
                    );
                  })}
                  {prefIds.length < 3 && (
                    <AddPickerButton
                      guests={guests}
                      excludeIds={prefExcludeIds}
                      onSelect={(gid) => setPrefIds([...prefIds, gid])}
                      categoryColors={categoryColors}
                      placeholder="搜尋賓客（最多 3 位）..."
                    />
                  )}
                </div>
              </div>
            </div>

            {/* 3. 要避桌 */}
            <div style={_row}>
              <span style={_label}>要避桌</span>
              <div className="flex-1 pt-1">
                <div className="flex gap-1 flex-wrap items-center">
                  {avoidIds.map((aid) => {
                    const g = guests.find((x) => x.id === aid);
                    const display = g ? (g.aliases.length > 0 ? g.aliases[0] : g.name) : '?';
                    const cc = g ? getCategoryColor(g.category, categoryColors) : null;
                    return (
                      <span key={aid} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-[var(--radius-sm,4px)] text-sm font-[family-name:var(--font-ui)]" style={{
                        background: cc?.background || 'rgba(239,68,68,0.08)',
                        border: `1px solid ${cc?.border || 'var(--error)'}`,
                        color: cc?.color || 'var(--error)',
                      }}>
                        {display}
                        <button
                          onClick={() => setAvoidIds(avoidIds.filter((id) => id !== aid))}
                          className="bg-none border-none cursor-pointer p-0 text-[10px] leading-none opacity-60"
                          style={{ color: cc?.color || 'var(--error)' }}
                        >
                          <X size={14} />
                        </button>
                      </span>
                    );
                  })}
                  <AddPickerButton
                    guests={guests}
                    excludeIds={avoidExcludeIds}
                    onSelect={(gid) => setAvoidIds([...avoidIds, gid])}
                    categoryColors={categoryColors}
                    placeholder="搜尋要避桌的賓客..."
                  />
                </div>
              </div>
            </div>

            <div style={{ ...sectionTitleStyle, marginTop: 12 }}>備註</div>

            {/* 4. 飲食 */}
            <div style={_row}>
              <span style={_label}>飲食</span>
              <div className="flex-1">
                <FieldInput value={dietary} onChange={setDietary} placeholder="素食、過敏等..." />
              </div>
            </div>

            {/* 5. 特殊需求 */}
            <div style={_row}>
              <span style={_label}>特殊需求</span>
              <div className="flex-1">
                <FieldInput value={special} onChange={setSpecial} placeholder="輪椅、兒童椅等..." />
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex justify-between mt-5 pt-4 border-t border-[var(--border)]">
          <div>
            {mode === 'edit' && onDelete && guest && (
              <button
                onClick={() => onDelete(guest.id)}
                className="px-4 py-1.5 rounded-[var(--radius-sm,4px)] border border-[var(--error)] bg-none text-[var(--error)] cursor-pointer text-[15px] font-[family-name:var(--font-ui)] font-medium"
              >
                刪除賓客
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-5 py-1.5 rounded-[var(--radius-sm,4px)] border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] cursor-pointer text-[15px] font-[family-name:var(--font-ui)] font-medium"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!name.trim() || submitting}
              className="px-5 py-1.5 rounded-[var(--radius-sm,4px)] border-none text-white text-[15px] font-[family-name:var(--font-ui)] font-medium"
              style={{
                background: !name.trim() || submitting ? 'var(--text-muted)' : 'var(--accent)',
                cursor: !name.trim() || submitting ? 'default' : 'pointer',
                opacity: !name.trim() || submitting ? 0.5 : 1,
              }}
            >
              {mode === 'add' ? '新增賓客' : '儲存變更'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
