import { describe, it, expect } from 'vitest'
import { computeViewBox, snapToGrid, calculateFitAll, centerOnPoint, calculateGridLayout } from '../viewport'

// ─── computeViewBox ──────────────────────────────────

describe('computeViewBox', () => {
  it('returns default viewBox at 100% zoom, no pan', () => {
    expect(computeViewBox(1, 0, 0, 1200, 800)).toBe('0 0 1200 800')
  })

  it('zooms in: smaller viewBox at 200%', () => {
    expect(computeViewBox(2, 0, 0, 1200, 800)).toBe('0 0 600 400')
  })

  it('zooms out: larger viewBox at 50%', () => {
    expect(computeViewBox(0.5, 0, 0, 1200, 800)).toBe('0 0 2400 1600')
  })

  it('pans right: viewBox origin moves left', () => {
    expect(computeViewBox(1, 100, 50, 1200, 800)).toBe('-100 -50 1200 800')
  })

  it('combines zoom and pan', () => {
    // panX=200, panY=100, zoom=2 → viewBox origin = -200/2, -100/2 = -100, -50
    expect(computeViewBox(2, 200, 100, 1200, 800)).toBe('-100 -50 600 400')
  })

  it('returns fallback when container is 0', () => {
    expect(computeViewBox(1, 0, 0, 0, 0)).toBe('0 0 1200 800')
  })

  it('returns fallback when container height is 0', () => {
    expect(computeViewBox(1, 0, 0, 800, 0)).toBe('0 0 1200 800')
  })

  it('handles zoom at min boundary (25%)', () => {
    const result = computeViewBox(0.25, 0, 0, 1200, 800)
    expect(result).toBe('0 0 4800 3200')
  })

  it('handles zoom at max boundary (100%)', () => {
    const result = computeViewBox(1, 0, 0, 1200, 800)
    expect(result).toBe('0 0 1200 800')
  })
})

// ─── snapToGrid ──────────────────────────────────────

describe('snapToGrid', () => {
  it('snaps to nearest 50', () => {
    expect(snapToGrid(123, 467)).toEqual({ x: 100, y: 450 })
  })

  it('rounds up at midpoint', () => {
    expect(snapToGrid(125, 475)).toEqual({ x: 150, y: 500 })
  })

  it('handles zero', () => {
    expect(snapToGrid(0, 0)).toEqual({ x: 0, y: 0 })
  })

  it('handles negative values', () => {
    expect(snapToGrid(-30, -70)).toEqual({ x: -50, y: -50 })
  })

  it('handles already-snapped values', () => {
    expect(snapToGrid(200, 300)).toEqual({ x: 200, y: 300 })
  })

  it('supports custom grid size', () => {
    expect(snapToGrid(33, 66, 25)).toEqual({ x: 25, y: 75 })
  })
})

// ─── calculateFitAll ─────────────────────────────────

const makeTable = (id: string, x: number, y: number, capacity = 10) => ({
  id,
  eventId: 'e1',
  name: `Table ${id}`,
  capacity,
  positionX: x,
  positionY: y,
  averageSatisfaction: 0,
  color: null,
  note: null,
})

describe('calculateFitAll', () => {
  it('returns default for empty tables', () => {
    const result = calculateFitAll([], 1200, 800)
    expect(result).toEqual({ zoom: 1, panX: 0, panY: 0 })
  })

  it('centers a single table', () => {
    const result = calculateFitAll([makeTable('1', 500, 300)], 1200, 800)
    // Should center the table in the viewport
    expect(result.zoom).toBeGreaterThan(0)
    expect(result.zoom).toBeLessThanOrEqual(3)
    // panX/panY should position the table center at viewport center
    const viewportCenterX = result.panX / result.zoom + 1200 / (2 * result.zoom)
    // The table should be roughly centered
    expect(Math.abs((-result.panX / result.zoom + 1200 / result.zoom / 2) - 500)).toBeLessThan(1)
  })

  it('fits multiple tables with correct zoom', () => {
    const tables = [makeTable('1', 100, 100), makeTable('2', 900, 600)]
    const result = calculateFitAll(tables, 1200, 800)
    // All tables should be visible: viewBox should contain both
    const vx = -result.panX / result.zoom
    const vy = -result.panY / result.zoom
    const vw = 1200 / result.zoom
    const vh = 800 / result.zoom
    // Both tables should be within viewBox (with some tolerance for padding)
    expect(vx).toBeLessThan(100)
    expect(vy).toBeLessThan(100)
    expect(vx + vw).toBeGreaterThan(900)
    expect(vy + vh).toBeGreaterThan(600)
  })

  it('returns default when container is 0', () => {
    const result = calculateFitAll([makeTable('1', 100, 100)], 0, 0)
    expect(result).toEqual({ zoom: 1, panX: 0, panY: 0 })
  })

  it('clamps zoom to range [0.25, 1]', () => {
    // Tables very far apart → zoom should be >= 0.25
    const tables = [makeTable('1', 0, 0), makeTable('2', 10000, 8000)]
    const result = calculateFitAll(tables, 800, 600)
    expect(result.zoom).toBeGreaterThanOrEqual(0.25)
    expect(result.zoom).toBeLessThanOrEqual(1)
  })
})

// ─── centerOnPoint ───────────────────────────────────

describe('centerOnPoint', () => {
  it('centers a point at viewport center', () => {
    const result = centerOnPoint(500, 300, 1, 1200, 800)
    // panX = containerW/2 - logicalX * zoom = 600 - 500 = 100
    expect(result.panX).toBe(100)
    // panY = containerH/2 - logicalY * zoom = 400 - 300 = 100
    expect(result.panY).toBe(100)
  })

  it('accounts for zoom', () => {
    const result = centerOnPoint(500, 300, 2, 1200, 800)
    // panX = 600 - 500*2 = -400
    expect(result.panX).toBe(-400)
    expect(result.panY).toBe(-200)
  })

  it('handles origin point', () => {
    const result = centerOnPoint(0, 0, 1, 1200, 800)
    expect(result.panX).toBe(600)
    expect(result.panY).toBe(400)
  })
})

// ─── calculateGridLayout ─────────────────────────────

describe('calculateGridLayout', () => {
  it('returns empty for no tables', () => {
    expect(calculateGridLayout([])).toEqual([])
  })

  it('places single table at start offset', () => {
    const tables = [makeTable('1', 0, 0)]
    const result = calculateGridLayout(tables)
    expect(result).toEqual([{ tableId: '1', x: 200, y: 200 }])
  })

  it('places 4 tables in a 2x2 grid', () => {
    const tables = [makeTable('1', 0, 0), makeTable('2', 0, 0), makeTable('3', 0, 0), makeTable('4', 0, 0)]
    const result = calculateGridLayout(tables)
    expect(result).toEqual([
      { tableId: '1', x: 200, y: 200 },
      { tableId: '2', x: 450, y: 200 },
      { tableId: '3', x: 200, y: 450 },
      { tableId: '4', x: 450, y: 450 },
    ])
  })

  it('places 10 tables in a grid', () => {
    const tables = Array.from({ length: 10 }, (_, i) => makeTable(`${i + 1}`, 0, 0))
    const result = calculateGridLayout(tables)
    // 10 tables → ceil(sqrt(10)) = 4 cols
    expect(result).toHaveLength(10)
    expect(result[0]).toEqual({ tableId: '1', x: 200, y: 200 })
    // Last table: index 9, col = 9%4=1, row = floor(9/4)=2
    expect(result[9]).toEqual({ tableId: '10', x: 450, y: 700 })
  })
})
