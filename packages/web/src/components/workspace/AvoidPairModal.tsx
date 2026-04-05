import { useState, useMemo, useRef, useEffect } from 'react';
import { useSeatingStore, type Guest } from '@/stores/seating';
import { getCategoryColor, loadCategoryColors, type CategoryColor } from '@/lib/category-colors';

interface Props {
  onClose: () => void
}

const CATEGORY_ORDER = ['男方', '女方', '共同'];

// --- Inline guest search picker ---

function GuestPicker({ guests, excludeIds, value, onChange, categoryColors, placeholder }: {
  guests: Guest[]; excludeIds: Set<string>; value: string | null
  onChange: (guestId: string | null) => void; categoryColors: Record<string, CategoryColor>
  placeholder: string
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const confirmed = useMemo(() =>
    guests.filter((g) => g.rsvpStatus === 'confirmed' && !excludeIds.has(g.id)),
    [guests, excludeIds],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return confirmed;
    return confirmed.filter((g) =>
      g.name.toLowerCase().includes(q) ||
      g.aliases.some((a) => a.toLowerCase().includes(q)),
    );
  }, [confirmed, search]);

  const grouped = useMemo(() => {
    const allCats = Array.from(new Set(filtered.map((g) => g.category ?? '其他')));
    const sorted = [...CATEGORY_ORDER.filter((c) => allCats.includes(c)), ...allCats.filter((c) => !CATEGORY_ORDER.includes(c))];
    return sorted.map((cat) => {
      const catGuests = filtered.filter((g) => (g.category ?? '其他') === cat);
      const subcatNames = Array.from(new Set(catGuests.map((g) => g.subcategory?.name).filter(Boolean))) as string[];
      const subGroups = [
        ...subcatNames.map((sn) => ({ tagName: sn, guests: catGuests.filter((g) => g.subcategory?.name === sn) })),
        { tagName: null as string | null, guests: catGuests.filter((g) => !g.subcategory) },
      ].filter((sg) => sg.guests.length > 0);
      return { category: cat, subGroups };
    }).filter((g) => g.subGroups.some((sg) => sg.guests.length > 0));
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectedGuest = value ? guests.find((g) => g.id === value) : null;

  if (selectedGuest) {
    const cc = getCategoryColor(selectedGuest.category, categoryColors);
    const display = selectedGuest.aliases.length > 0 ? selectedGuest.aliases[0] : selectedGuest.name;
    return (
      <span
        onClick={() => onChange(null)}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-sm,4px)] text-[13px] font-[family-name:var(--font-ui)] font-medium cursor-pointer"
        style={{
          background: cc.background, border: `1px solid ${cc.border}`,
          color: cc.color,
        }}
      >
        {display}
        <span className="text-[10px] opacity-60">✕</span>
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        ref={inputRef}
        value={search}
        onChange={(e) => { setSearch(e.target.value); if (!open) setOpen(true); }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; setOpen(true); }}
        placeholder={placeholder}
        className="w-full px-2.5 py-[5px] text-[13px] font-[family-name:var(--font-ui)] border border-[var(--border)] rounded-[var(--radius-sm,4px)] outline-none bg-[var(--bg-surface)] text-[var(--text-primary)]"
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
      />
      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full mt-1 w-full max-h-[200px] overflow-y-auto z-10 bg-[var(--bg-surface)] border border-[var(--border)] rounded-[var(--radius-sm,4px)] shadow-[0_8px_24px_rgba(0,0,0,0.12)] p-1"
        >
          {grouped.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)] p-1.5">
              {search.trim() ? `找不到「${search}」` : '沒有可選的賓客'}
            </div>
          ) : (
            grouped.map(({ category, subGroups }) => {
              const cc = getCategoryColor(category, categoryColors);
              return (
                <div key={category} className="mb-1.5">
                  <div
                    className="text-[11px] font-semibold px-1.5 py-0.5 mb-0.5 opacity-70"
                    style={{ color: cc.color }}
                  >{category}</div>
                  <div className="pl-1.5" style={{ borderLeft: `2px solid ${cc.border}` }}>
                    {subGroups.map(({ tagName, guests: sgGuests }) => (
                      <div key={tagName ?? '__no_subcat__'} className="mb-1">
                        {tagName && (
                          <div className="text-[11px] text-[var(--text-muted)] mb-0.5">{tagName}</div>
                        )}
                        <div className="flex flex-wrap gap-0.5">
                          {sgGuests.map((g) => (
                            <button
                              key={g.id}
                              onMouseDown={(e) => { e.preventDefault(); onChange(g.id); setOpen(false); setSearch(''); }}
                              className="px-2 py-0.5 text-xs font-[family-name:var(--font-body)] rounded-[var(--radius-sm,4px)] cursor-pointer whitespace-nowrap"
                              style={{
                                border: `1px solid ${cc.border}`, background: cc.background,
                                color: cc.color,
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-light)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = cc.background; e.currentTarget.style.borderColor = cc.border; }}
                            >
                              {g.aliases.length > 0 ? g.aliases[0] : g.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// --- Main Modal ---

export function AvoidPairModal({ onClose }: Props) {
  const guests = useSeatingStore((s) => s.guests);
  const tables = useSeatingStore((s) => s.tables);
  const avoidPairs = useSeatingStore((s) => s.avoidPairs);
  const addAvoidPair = useSeatingStore((s) => s.addAvoidPair);
  const removeAvoidPair = useSeatingStore((s) => s.removeAvoidPair);
  const eventId = useSeatingStore((s) => s.eventId);
  const categoryColors = useMemo(() => loadCategoryColors(eventId || ''), [eventId]);

  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const getGuest = (id: string) => guests.find((g) => g.id === id);

  // Duplicate check
  const existingPairSet = useMemo(() => {
    const s = new Set<string>();
    for (const ap of avoidPairs) {
      s.add(`${ap.guestAId}-${ap.guestBId}`);
      s.add(`${ap.guestBId}-${ap.guestAId}`);
    }
    return s;
  }, [avoidPairs]);
  const isDuplicate = selectedA && selectedB && existingPairSet.has(`${selectedA}-${selectedB}`);

  // Exclude already-selected from the other picker
  const excludeA = useMemo(() => {
    const s = new Set<string>();
    if (selectedB) s.add(selectedB);
    return s;
  }, [selectedB]);
  const excludeB = useMemo(() => {
    const s = new Set<string>();
    if (selectedA) s.add(selectedA);
    return s;
  }, [selectedA]);

  // Check same-table violations
  const getSameTableName = (aId: string, bId: string): string | null => {
    const a = getGuest(aId);
    const b = getGuest(bId);
    if (!a?.assignedTableId || !b?.assignedTableId) return null;
    if (a.assignedTableId !== b.assignedTableId) return null;
    return tables.find((t) => t.id === a.assignedTableId)?.name || null;
  };

  const violationCount = avoidPairs.filter((ap) => getSameTableName(ap.guestAId, ap.guestBId) !== null).length;

  const handleAdd = async () => {
    if (!selectedA || !selectedB || selectedA === selectedB || isDuplicate) return;
    setAdding(true);
    await addAvoidPair(selectedA, selectedB);
    setSelectedA(null);
    setSelectedB(null);
    setAdding(false);
  };

  const canAdd = selectedA && selectedB && selectedA !== selectedB && !isDuplicate && !adding;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="w-full p-5 bg-[var(--bg-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] max-w-[560px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold font-[family-name:var(--font-display)] text-[var(--text-primary)]">避免同桌管理</h2>
            {avoidPairs.length > 0 && (
              <span className="text-xs font-data text-[var(--text-muted)]">{avoidPairs.length} 組</span>
            )}
          </div>
          <button onClick={onClose} className="hover:opacity-70 text-[var(--text-muted)] text-lg">✕</button>
        </div>

        {/* Add new pair */}
        <div className="mb-3 p-3 bg-[var(--bg-primary)] rounded-[var(--radius-sm)] border border-[var(--border)]">
          <div className="flex items-center gap-2">
            <GuestPicker
              guests={guests} excludeIds={excludeA} value={selectedA}
              onChange={setSelectedA} categoryColors={categoryColors} placeholder="賓客 A..."
            />
            <span className="text-xs font-semibold shrink-0 text-[var(--text-muted)]">vs</span>
            <GuestPicker
              guests={guests} excludeIds={excludeB} value={selectedB}
              onChange={setSelectedB} categoryColors={categoryColors} placeholder="賓客 B..."
            />
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className="py-[5px] px-4 text-[13px] font-[family-name:var(--font-ui)] font-medium border-none rounded-[var(--radius-sm,4px)] shrink-0"
              style={{
                background: canAdd ? 'var(--error)' : 'var(--border)',
                color: canAdd ? '#fff' : 'var(--text-muted)',
                cursor: canAdd ? 'pointer' : 'default',
              }}
            >
              新增
            </button>
          </div>
          {isDuplicate && (
            <div className="text-[11px] text-[#DC2626] mt-1">此配對已存在</div>
          )}
        </div>

        {/* Violation warning */}
        {violationCount > 0 && (
          <div className="mb-3 px-3 py-2 text-xs rounded-[var(--radius-sm)] bg-[#FEF2F2] text-[#DC2626] font-medium">
            ⚠ {violationCount} 組避桌關係的賓客目前被排在同一桌
          </div>
        )}

        {/* Inline pair chips */}
        <div className="flex-1 overflow-y-auto">
          {avoidPairs.length === 0 ? (
            <div className="text-sm py-6 text-center text-[var(--text-muted)]">
              尚未設定避桌關係
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {avoidPairs.map((ap) => {
                const a = getGuest(ap.guestAId);
                const b = getGuest(ap.guestBId);
                if (!a || !b) return null;
                const nameA = a.aliases.length > 0 ? a.aliases[0] : a.name;
                const nameB = b.aliases.length > 0 ? b.aliases[0] : b.name;
                const ccA = getCategoryColor(a.category, categoryColors);
                const ccB = getCategoryColor(b.category, categoryColors);
                const tagA = a.subcategory?.name ?? (a.category ?? '共同');
                const tagB = b.subcategory?.name ?? (b.category ?? '共同');
                const sameTable = getSameTableName(ap.guestAId, ap.guestBId);
                return (
                  <span
                    key={ap.id}
                    className="inline-flex items-center gap-1 py-[5px] px-2.5 rounded-[var(--radius-sm,4px)] text-[15px] font-[family-name:var(--font-ui)]"
                    style={{
                      background: sameTable ? '#FEF2F2' : 'var(--bg-primary)',
                      border: `1px solid ${sameTable ? '#FECACA' : 'var(--border)'}`,
                    }}
                    title={sameTable ? `⚠ 同在${sameTable}` : undefined}
                  >
                    {/* [tag]名字 */}
                    <span
                      className="text-xs font-semibold px-[5px] py-px rounded-[3px]"
                      style={{
                        background: ccA.background, color: ccA.color, border: `1px solid ${ccA.border}`,
                      }}
                    >{tagA}</span>
                    <span className="font-medium" style={{ color: sameTable ? '#DC2626' : 'var(--text-primary)' }}>{nameA}</span>

                    <span className="text-xs font-semibold text-[var(--text-muted)]">vs</span>

                    {/* 名字[tag] */}
                    <span className="font-medium" style={{ color: sameTable ? '#DC2626' : 'var(--text-primary)' }}>{nameB}</span>
                    <span
                      className="text-xs font-semibold px-[5px] py-px rounded-[3px]"
                      style={{
                        background: ccB.background, color: ccB.color, border: `1px solid ${ccB.border}`,
                      }}
                    >{tagB}</span>

                    {sameTable && <span className="text-xs text-[#DC2626]">⚠</span>}
                    <button
                      onClick={() => removeAvoidPair(ap.id)}
                      className="bg-none border-none cursor-pointer p-0 text-[10px] leading-none opacity-60 ml-px"
                      style={{
                        color: sameTable ? '#DC2626' : 'var(--text-muted)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
