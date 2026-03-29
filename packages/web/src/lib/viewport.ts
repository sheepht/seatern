/**
 * 畫布 viewport 工具函式
 *
 * 提供 zoom/pan 相關的計算：viewBox 計算、fit-all、center-on-point、
 * grid snap、auto-arrange grid layout。
 */

import type { Table } from '@/stores/seating'

// ─── ViewBox 計算 ────────────────────────────────────

export function computeViewBox(
  zoom: number,
  panX: number,
  panY: number,
  containerW: number,
  containerH: number,
): string {
  if (containerW <= 0 || containerH <= 0) return '0 0 1200 800'
  const vx = -panX / zoom
  const vy = -panY / zoom
  const vw = containerW / zoom
  const vh = containerH / zoom
  return `${vx} ${vy} ${vw} ${vh}`
}

// ─── Grid Snap ───────────────────────────────────────

export function snapToGrid(x: number, y: number, gridSize = 50): { x: number; y: number } {
  return {
    x: Math.round(x / gridSize) * gridSize,
    y: Math.round(y / gridSize) * gridSize,
  }
}

// ─── Fit-all 計算 ────────────────────────────────────
// 計算要把所有桌子放進視窗需要的 zoom 和 pan

const TABLE_RADIUS_FOR_BOUNDS = 80 // 桌子圓的約略 radius + padding

export interface FitAllResult {
  zoom: number
  panX: number
  panY: number
}

export function calculateFitAll(
  tables: Table[],
  containerW: number,
  containerH: number,
  padding = 80,
): FitAllResult {
  if (containerW <= 0 || containerH <= 0) return { zoom: 1, panX: 0, panY: 0 }
  if (tables.length === 0) return { zoom: 1, panX: 0, panY: 0 }

  // 計算桌子的 bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const t of tables) {
    minX = Math.min(minX, t.positionX - TABLE_RADIUS_FOR_BOUNDS)
    minY = Math.min(minY, t.positionY - TABLE_RADIUS_FOR_BOUNDS)
    maxX = Math.max(maxX, t.positionX + TABLE_RADIUS_FOR_BOUNDS)
    maxY = Math.max(maxY, t.positionY + TABLE_RADIUS_FOR_BOUNDS)
  }

  const contentW = maxX - minX + padding * 2
  const contentH = maxY - minY + padding * 2

  // zoom 使內容剛好 fit 進容器
  const zoom = Math.max(0.25, Math.min(1, Math.min(containerW / contentW, containerH / contentH)))

  // pan 使內容居中
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const panX = Math.round(containerW / 2 - centerX * zoom)
  const panY = Math.round(containerH / 2 - centerY * zoom)

  return { zoom, panX, panY }
}

// ─── Center-on-point（雙擊 zoom / minimap navigate）───

export function centerOnPoint(
  logicalX: number,
  logicalY: number,
  targetZoom: number,
  containerW: number,
  containerH: number,
): { panX: number; panY: number } {
  return {
    panX: Math.round(containerW / 2 - logicalX * targetZoom),
    panY: Math.round(containerH / 2 - logicalY * targetZoom),
  }
}

// ─── 找不重疊的空位 ─────────────────────────────────

const MIN_TABLE_DISTANCE = 220 // 兩桌中心最小距離（含間距）

export function findFreePosition(
  existingTables: Table[],
  spacing = 300,
): { x: number; y: number } {
  if (existingTables.length === 0) return { x: 200, y: 200 }

  // 以現有桌子群的中心為基準
  const centerX = existingTables.reduce((s, t) => s + t.positionX, 0) / existingTables.length
  const centerY = existingTables.reduce((s, t) => s + t.positionY, 0) / existingTables.length

  // snap 中心到最近的 grid 點
  const gridCenterX = Math.round(centerX / spacing) * spacing
  const gridCenterY = Math.round(centerY / spacing) * spacing

  // 產生候選位置：從中心向外擴展的螺旋掃描
  const candidates: Array<{ x: number; y: number; dist: number }> = []
  const range = 15 // 掃描半徑
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const x = gridCenterX + dx * spacing
      const y = gridCenterY + dy * spacing
      if (x < 50 || y < 50) continue // 不要放到太左上角
      const distSq = dx * dx + dy * dy
      candidates.push({ x, y, dist: distSq })
    }
  }

  // 按離中心的距離排序（由近到遠）→ 優先填內圍空隙
  candidates.sort((a, b) => a.dist - b.dist)

  for (const c of candidates) {
    const collides = existingTables.some((t) => {
      const ddx = Math.abs(t.positionX - c.x)
      const ddy = Math.abs(t.positionY - c.y)
      return ddx < MIN_TABLE_DISTANCE && ddy < MIN_TABLE_DISTANCE
    })
    if (!collides) return { x: c.x, y: c.y }
  }

  // fallback
  const maxX = Math.max(...existingTables.map((t) => t.positionX))
  return { x: maxX + spacing, y: gridCenterY }
}

// ─── Auto-arrange grid layout ────────────────────────

export interface GridPosition {
  tableId: string
  x: number
  y: number
}

export function calculateGridLayout(
  tables: Table[],
  spacing = 250,
  startOffset = 200,
): GridPosition[] {
  if (tables.length === 0) return []
  const cols = Math.ceil(Math.sqrt(tables.length))
  return tables.map((t, i) => ({
    tableId: t.id,
    x: startOffset + (i % cols) * spacing,
    y: startOffset + Math.floor(i / cols) * spacing,
  }))
}
