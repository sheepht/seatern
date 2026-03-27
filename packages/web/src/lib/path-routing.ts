/**
 * 智慧推薦虛線 — 避障曲線路徑
 *
 * 用 pathfinding (A*) 在網格上找出避開桌子的路徑，
 * 再用 Catmull-Rom → cubic-bezier 平滑成 SVG <path> d 屬性。
 */
// @ts-expect-error -- pathfinding 沒有 TS 型別
import PF from 'pathfinding'

/** 畫布上的圓形障礙（桌子） */
interface CircleObstacle {
  cx: number
  cy: number
  r: number
}

/** 路徑終端點 */
interface Point {
  x: number
  y: number
}

// 網格解析度：越小越精緻但越慢。20px 對 1200×800 畫布 = 60×40 格，夠用了。
const CELL = 20
// 桌子四周額外留白，讓曲線不會擦邊
const OBSTACLE_PADDING = 12

interface PathResult {
  d: string
  midpoint: Point
}

/**
 * 計算從 source 到 target 的避障 SVG 路徑。
 * sourceTable 是賓客所在的桌子，路徑會先從桌外出發再轉向目標。
 * 回傳 path d 字串 + 路徑中點座標（用於放 badge）。
 */
export function computeAvoidancePath(
  source: Point,
  target: Point,
  obstacles: CircleObstacle[],
  sourceTable: CircleObstacle | null,
  canvasW: number,
  canvasH: number,
): PathResult {
  // 計算「出桌點」：從桌心穿過賓客位置，延伸到桌子外圍 + padding
  let launchPt = source
  if (sourceTable) {
    const dx = source.x - sourceTable.cx
    const dy = source.y - sourceTable.cy
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const ux = dx / dist
    const uy = dy / dist
    launchPt = {
      x: sourceTable.cx + ux * (sourceTable.r + OBSTACLE_PADDING + CELL),
      y: sourceTable.cy + uy * (sourceTable.r + OBSTACLE_PADDING + CELL),
    }
  }

  const cols = Math.ceil(canvasW / CELL)
  const rows = Math.ceil(canvasH / CELL)
  const grid = new PF.Grid(cols, rows)

  // 標記障礙格（含來源桌）
  for (const obs of obstacles) {
    const padded = obs.r + OBSTACLE_PADDING
    const minCol = Math.max(0, Math.floor((obs.cx - padded) / CELL))
    const maxCol = Math.min(cols - 1, Math.ceil((obs.cx + padded) / CELL))
    const minRow = Math.max(0, Math.floor((obs.cy - padded) / CELL))
    const maxRow = Math.min(rows - 1, Math.ceil((obs.cy + padded) / CELL))
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cellCx = c * CELL + CELL / 2
        const cellCy = r * CELL + CELL / 2
        const ddx = cellCx - obs.cx
        const ddy = cellCy - obs.cy
        if (ddx * ddx + ddy * ddy <= padded * padded) {
          grid.setWalkableAt(c, r, false)
        }
      }
    }
  }

  // 出桌點和終點必須可走
  const sc = clamp(Math.round(launchPt.x / CELL), 0, cols - 1)
  const sr = clamp(Math.round(launchPt.y / CELL), 0, rows - 1)
  const tc = clamp(Math.round(target.x / CELL), 0, cols - 1)
  const tr = clamp(Math.round(target.y / CELL), 0, rows - 1)
  grid.setWalkableAt(sc, sr, true)
  grid.setWalkableAt(tc, tr, true)

  const finder = new PF.AStarFinder({ allowDiagonal: true, dontCrossCorners: true })
  let path: number[][] = finder.findPath(sc, sr, tc, tr, grid)

  // A* 找不到路 → fallback 弧線（source → target）
  if (path.length < 2) {
    return makeArc(source, target)
  }

  // 路徑簡化
  path = smoothenPath(grid, path)

  // 轉成真實座標
  const pts: Point[] = path.map(([c, r]) => ({
    x: c * CELL + CELL / 2,
    y: r * CELL + CELL / 2,
  }))

  // 出桌點和終點用精確座標
  pts[0] = launchPt
  pts[pts.length - 1] = target

  // 在最前面插入賓客真實位置 → 出桌點成為第二個點
  pts.unshift(source)

  // 如果只有 2 點（source + target，沒有中間轉折），加自然弧度
  if (pts.length === 2) {
    return makeArc(source, target)
  }

  // Catmull-Rom → cubic bezier 平滑
  const d = catmullRomToSvgPath(pts)
  // badge 放在箭頭前 ~100px，從終點往回找
  const badgePt = findPointBackFromEnd(pts, 100)
  return { d, midpoint: badgePt }
}

/**
 * 將一組點用 Catmull-Rom 樣條轉成 SVG cubic-bezier 路徑。
 * 使用 centripetal 參數化（alpha = 0.5）讓曲線不過衝。
 */
function catmullRomToSvgPath(pts: Point[]): string {
  if (pts.length < 2) return ''
  if (pts.length === 2) {
    return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`
  }

  // 加上虛擬首尾點讓 Catmull-Rom 能涵蓋所有線段
  const extended = [
    mirror(pts[0], pts[1]),
    ...pts,
    mirror(pts[pts.length - 1], pts[pts.length - 2]),
  ]

  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`

  for (let i = 0; i < extended.length - 3; i++) {
    const p0 = extended[i]
    const p1 = extended[i + 1]
    const p2 = extended[i + 2]
    const p3 = extended[i + 3]

    // 用 1/3 比例近似 Catmull-Rom → cubic bezier 控制點
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }

  return d
}

/**
 * 無障礙時的自然弧線：用 quadratic bezier，控制點偏移到垂直方向。
 * 偏移量為兩點距離的 15%，方向固定往「左側」彎，讓視覺一致。
 */
function makeArc(a: Point, b: Point): PathResult {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  // 垂直方向偏移（固定往一邊彎）
  const offset = dist * 0.15
  const cx = mx - (dy / dist) * offset
  const cy = my + (dx / dist) * offset
  // 從終點往回退 100px 放 badge
  const totalDist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2) || 1
  const t = Math.max(0.3, 1 - 100 / totalDist)
  const midpoint: Point = {
    x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * b.x,
    y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * b.y,
  }
  const d = `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`
  return { d, midpoint }
}

/** 鏡像點：a 相對 b 的鏡射 */
function mirror(a: Point, b: Point): Point {
  return { x: 2 * a.x - b.x, y: 2 * a.y - b.y }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

/** 從路徑終點往回走 targetDist px，回傳那個位置。路徑太短就取中點。 */
function findPointBackFromEnd(pts: Point[], targetDist: number): Point {
  // 從後往前累加線段長度
  let remaining = targetDist
  for (let i = pts.length - 1; i > 0; i--) {
    const dx = pts[i].x - pts[i - 1].x
    const dy = pts[i].y - pts[i - 1].y
    const segLen = Math.sqrt(dx * dx + dy * dy)
    if (remaining <= segLen) {
      // 在這段線段上插值
      const ratio = remaining / segLen
      return {
        x: pts[i].x - dx * ratio,
        y: pts[i].y - dy * ratio,
      }
    }
    remaining -= segLen
  }
  // 路徑比 targetDist 還短，取中點
  const mid = Math.floor(pts.length / 2)
  return pts[mid]
}

/**
 * Bresenham 直線插值：回傳 (x0,y0) 到 (x1,y1) 之間的所有格座標。
 */
function interpolate(x0: number, y0: number, x1: number, y1: number): number[][] {
  const result: number[][] = []
  let dx = Math.abs(x1 - x0)
  let dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let cx = x0, cy = y0
  for (;;) {
    result.push([cx, cy])
    if (cx === x1 && cy === y1) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; cx += sx }
    if (e2 < dx) { err += dx; cy += sy }
  }
  return result
}

/**
 * 路徑簡化：嘗試跳過中間點，只保留不能直線通過的轉折點。
 * （替代 PF.Util.smoothenPath，因為它在 strict mode 下有 bug）
 */
function smoothenPath(grid: InstanceType<typeof PF.Grid>, path: number[][]): number[][] {
  if (path.length <= 2) return path
  const newPath: number[][] = [path[0]]
  let sx = path[0][0], sy = path[0][1]
  for (let i = 2; i < path.length; i++) {
    const ex = path[i][0], ey = path[i][1]
    const line = interpolate(sx, sy, ex, ey)
    let blocked = false
    for (let j = 1; j < line.length; j++) {
      if (!grid.isWalkableAt(line[j][0], line[j][1])) { blocked = true; break }
    }
    if (blocked) {
      const prev = path[i - 1]
      newPath.push(prev)
      sx = prev[0]
      sy = prev[1]
    }
  }
  newPath.push(path[path.length - 1])
  return newPath
}

/**
 * 取得 SVG path 上最後一段的方向向量（用於箭頭角度）。
 * 從終點往回看，取得最後兩個有意義的點。
 */
export function getPathEndDirection(pathD: string): { ux: number; uy: number } {
  // 從 d 字串中擷取所有座標點
  const nums = pathD.match(/-?\d+\.?\d*/g)
  if (!nums || nums.length < 4) return { ux: 1, uy: 0 }

  const allPts: Point[] = []
  for (let i = 0; i < nums.length - 1; i += 2) {
    allPts.push({ x: parseFloat(nums[i]), y: parseFloat(nums[i + 1]) })
  }

  // 取倒數第二個和最後一個點
  const end = allPts[allPts.length - 1]
  // 往回找一個距離夠遠的點來算方向（避免控制點太近導致方向跳動）
  let prev = allPts[allPts.length - 2]
  for (let i = allPts.length - 3; i >= 0; i--) {
    const dx = end.x - allPts[i].x
    const dy = end.y - allPts[i].y
    if (dx * dx + dy * dy > 100) { // 至少 10px 距離
      prev = allPts[i]
      break
    }
  }

  const dx = end.x - prev.x
  const dy = end.y - prev.y
  const dist = Math.sqrt(dx * dx + dy * dy) || 1
  return { ux: dx / dist, uy: dy / dist }
}
