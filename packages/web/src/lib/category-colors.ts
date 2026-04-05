// ─── Category Color System ──────────────────────────
// Shared across guest management page and workspace canvas.
// Colors are persisted to localStorage per event.

export interface CategoryColor {
  background: string
  border: string
  color: string
}

// 8 hues × 5 saturations + 5 grays = 45 presets
export const PALETTE_HUES = [0, 30, 55, 140, 195, 220, 275, 330];
export const PALETTE_SATS = [90, 72, 55, 40, 25];

export function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s / 100 * Math.min(l / 100, 1 - l / 100);
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function makeColor(h: number, s: number): CategoryColor {
  return {
    background: hslToHex(h, s, 88),
    border: hslToHex(h, s, 75),
    color: hslToHex(h, s, 28),
  };
}

export const COLOR_PRESETS: CategoryColor[][] = [
  ...PALETTE_HUES.map((h) => PALETTE_SATS.map((s) => makeColor(h, s))),
  PALETTE_SATS.map((_, i) => {
    const lights = [92, 86, 78, 70, 60];
    const l = lights[i];
    return { background: hslToHex(220, 8, l), border: hslToHex(220, 8, l - 10), color: hslToHex(220, 10, 22) };
  }),
];

export const DEFAULT_CATEGORY_COLORS: Record<string, CategoryColor> = {
  '男方': COLOR_PRESETS[5][0],  // 藍 (hue 220)
  '女方': COLOR_PRESETS[0][0],  // 紅 (hue 0)
  '共同': COLOR_PRESETS[8][0],  // 灰
};

export const FALLBACK_COLOR: CategoryColor = { background: '#E5E7EB', border: '#D1D5DB', color: '#374151' };

export function loadCategoryColors(eventId: string): Record<string, CategoryColor> {
  try {
    const raw = localStorage.getItem(`seatern:categoryColors:${eventId}`);
    return raw ? { ...DEFAULT_CATEGORY_COLORS, ...JSON.parse(raw) } : { ...DEFAULT_CATEGORY_COLORS };
  } catch { return { ...DEFAULT_CATEGORY_COLORS }; }
}

export function saveCategoryColors(eventId: string, colors: Record<string, CategoryColor>) {
  localStorage.setItem(`seatern:categoryColors:${eventId}`, JSON.stringify(colors));
}

export function getCategoryColor(category: string | undefined, colors: Record<string, CategoryColor>): CategoryColor {
  if (!category) return FALLBACK_COLOR;
  return colors[category] || FALLBACK_COLOR;
}
