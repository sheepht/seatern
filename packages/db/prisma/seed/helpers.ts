import { fakerZH_TW as faker } from '@faker-js/faker'
import { SURNAMES, GIVEN_NAME_CHARS, ALIAS_PREFIXES, DIETARY_OPTIONS, SPECIAL_NEEDS_OPTIONS } from './constants.js'

// 固定 seed 確保可重現
faker.seed(42)

export { faker }

// ─── 姓名產生 ───

const usedNames = new Set<string>()

export function resetUsedNames() {
  usedNames.clear()
}

export function generateChineseName(): { name: string; aliases: string[] } {
  let fullName: string
  let attempts = 0

  do {
    const surname = SURNAMES[faker.number.int({ min: 0, max: SURNAMES.length - 1 })]
    const charCount = faker.number.int({ min: 1, max: 2 })
    let given = ''
    for (let i = 0; i < charCount; i++) {
      given += GIVEN_NAME_CHARS[faker.number.int({ min: 0, max: GIVEN_NAME_CHARS.length - 1 })]
    }
    fullName = surname + given
    attempts++
    if (attempts > 100) {
      // 極端情況：加數字後綴
      fullName = fullName + faker.number.int({ min: 1, max: 99 })
    }
  } while (usedNames.has(fullName))

  usedNames.add(fullName)

  // 產生 0-2 個別名
  const aliases: string[] = []
  const given = fullName.slice(1) // 去掉姓
  const aliasCount = faker.number.int({ min: 0, max: 2 })

  if (aliasCount >= 1 && given.length > 0) {
    const prefix = ALIAS_PREFIXES[faker.number.int({ min: 0, max: ALIAS_PREFIXES.length - 1 })]
    aliases.push(prefix + given.charAt(given.length - 1))
  }
  if (aliasCount >= 2 && given.length >= 2) {
    aliases.push(given) // 直接叫名不叫姓
  }

  return { name: fullName, aliases }
}

// ─── 桌位座標 ───

export function generateTablePositions(count: number, cols: number): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = []
  const spacing = 150
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols
    positions.push({ x: col * spacing + 100, y: row * spacing + 100 })
  }
  return positions
}

// ─── RSVP 狀態 ───

export function randomRsvpStatus(): 'CONFIRMED' | 'PENDING' | 'DECLINED' | 'MODIFIED' {
  const r = faker.number.float({ min: 0, max: 1 })
  if (r < 0.75) return 'CONFIRMED'
  if (r < 0.85) return 'PENDING'
  if (r < 0.95) return 'DECLINED'
  return 'MODIFIED'
}

// ─── 飲食/特殊需求備註 ───

export function randomDietaryNote(): string | undefined {
  if (faker.number.float({ min: 0, max: 1 }) > 0.15) return undefined
  return faker.helpers.arrayElement(DIETARY_OPTIONS)
}

export function randomSpecialNote(): string | undefined {
  if (faker.number.float({ min: 0, max: 1 }) > 0.08) return undefined
  return faker.helpers.arrayElement(SPECIAL_NEEDS_OPTIONS)
}

// ─── 滿意度計算（依 PRD 公式）───

export interface SatisfactionInput {
  /** 同桌同 tag 的比例 (0-1) */
  sameTagRatio: number
  /** 偏好配對成功數 (0-3) */
  preferenceMatches: number
  /** 總偏好數 (0-3) */
  totalPreferences: number
  /** 偏好在鄰桌 */
  preferenceNearby: boolean
}

export function computeSatisfaction(input: SatisfactionInput): number {
  let score = 50 // 基礎分

  // 群組分 (0-20)
  if (input.sameTagRatio >= 0.5) score += 20
  else if (input.sameTagRatio >= 0.3) score += 15
  else if (input.sameTagRatio >= 0.1) score += 10
  else if (input.sameTagRatio > 0) score += 5

  // 偏好分 (0-25)
  if (input.totalPreferences > 0) {
    if (input.preferenceMatches >= 3) score += 25
    else if (input.preferenceMatches === 2) score += 18
    else if (input.preferenceMatches === 1) score += 10
    else if (input.preferenceNearby) score += 5
  }

  // 需求分：一律 +5
  score += 5

  return score
}

// ─── 工具函式 ───

/** 從陣列中加權隨機選擇 category */
export function weightedCategory(distribution: Record<string, number>): string {
  const r = faker.number.float({ min: 0, max: 1 })
  let cumulative = 0
  for (const [category, weight] of Object.entries(distribution)) {
    cumulative += weight
    if (r <= cumulative) return category
  }
  // fallback: 回傳最後一個
  const keys = Object.keys(distribution)
  return keys[keys.length - 1]
}

/** 批次分組（每批 batchSize 筆）*/
export function chunk<T>(arr: T[], batchSize: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += batchSize) {
    result.push(arr.slice(i, i + batchSize))
  }
  return result
}
