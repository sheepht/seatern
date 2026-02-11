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

export function randomRsvpStatus(): 'CONFIRMED' | 'PENDING' | 'DECLINED' {
  const r = faker.number.float({ min: 0, max: 1 })
  if (r < 0.70) return 'CONFIRMED'
  if (r < 0.85) return 'PENDING'
  return 'DECLINED'
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

/** 根據 RSVP 狀態產生合理的賓客表單資料 */
export function rsvpGuestData(rsvp: 'CONFIRMED' | 'PENDING' | 'DECLINED', opts?: {
  attendeeWeights?: Array<{ value: number; weight: number }>
  infantRate?: number
}) {
  const attendeeWeights = opts?.attendeeWeights ?? [{ value: 1, weight: 60 }, { value: 2, weight: 40 }]
  const infantRate = opts?.infantRate ?? 0.05

  if (rsvp === 'CONFIRMED') {
    return {
      attendeeCount: faker.helpers.weightedArrayElement(attendeeWeights),
      infantCount: faker.number.float({ min: 0, max: 1 }) < infantRate ? 1 : 0,
      dietaryNote: randomDietaryNote(),
      specialNote: randomSpecialNote(),
    }
  }
  // PENDING: 沒填過表單，全部預設值
  // DECLINED: 婉拒，人數 0，無需求
  return {
    attendeeCount: rsvp === 'PENDING' ? 1 : 0,
    infantCount: 0,
    dietaryNote: undefined,
    specialNote: undefined,
  }
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

// ─── 待審核 seed ───

interface PendingSubmissionSeedOpts {
  /** PENDING guests 中有多少比例會有 pendingSubmission (0-1) */
  pendingRate?: number
  /** CONFIRMED guests 中有多少比例會有 pendingSubmission (0-1) */
  modifiedRate?: number
}

/**
 * 為部分賓客加入 pendingSubmission，模擬「表單已提交但主辦人尚未審核」的狀態。
 * - PENDING guests：首次提交等待審核
 * - CONFIRMED guests：修改後等待審核（原資料不動）
 */
export async function addPendingSubmissions(
  prisma: import('@prisma/client').PrismaClient,
  eventId: string,
  opts?: PendingSubmissionSeedOpts,
): Promise<number> {
  const pendingRate = opts?.pendingRate ?? 0.07
  const modifiedRate = opts?.modifiedRate ?? 0.04

  const guests = await prisma.guest.findMany({
    where: { eventId },
    include: {
      contact: { select: { name: true } },
      preferencesFrom: {
        include: { preferred: { include: { contact: { select: { name: true } } } } },
        orderBy: { rank: 'asc' },
      },
    },
  })

  // 同場所有 guestIds，用來隨機選 seatPreference 對象
  const allGuestIds = guests.map(g => g.id)

  const updates: Array<{ id: string; data: object }> = []

  for (const guest of guests) {
    const shouldPend =
      (guest.rsvpStatus === 'PENDING' && faker.number.float({ min: 0, max: 1 }) < pendingRate) ||
      (guest.rsvpStatus === 'CONFIRMED' && faker.number.float({ min: 0, max: 1 }) < modifiedRate)

    if (!shouldPend) continue

    // 生成 seatPreferences（1-3 人，含 preferredName 快照）
    const prefCount = faker.number.int({ min: 0, max: 3 })
    const candidates = allGuestIds.filter(id => id !== guest.id)
    const selectedPrefs = faker.helpers.arrayElements(candidates, Math.min(prefCount, candidates.length))

    // 查 preferredName
    const seatPreferences: Array<{ preferredId: string; preferredName: string; rank: number }> = []
    for (let i = 0; i < selectedPrefs.length; i++) {
      const prefGuest = guests.find(g => g.id === selectedPrefs[i])
      seatPreferences.push({
        preferredId: selectedPrefs[i],
        preferredName: prefGuest?.contact.name ?? '(未知)',
        rank: i + 1,
      })
    }

    const isConfirmed = faker.number.float({ min: 0, max: 1 }) < 0.85
    const rsvpStatus = isConfirmed ? 'confirmed' : 'declined'

    const pendingSubmission = {
      rsvpStatus,
      attendeeCount: isConfirmed ? faker.helpers.arrayElement([1, 2]) : 1,
      infantCount: isConfirmed && faker.number.float({ min: 0, max: 1 }) < 0.08 ? 1 : 0,
      dietaryNote: isConfirmed ? randomDietaryNote() : undefined,
      specialNote: isConfirmed ? randomSpecialNote() : undefined,
      seatPreferences: isConfirmed ? seatPreferences : [],
      addTagIds: [] as string[],
      removeTagIds: [] as string[],
    }

    updates.push({
      id: guest.id,
      data: {
        pendingSubmission,
        pendingSubmittedAt: faker.date.recent({ days: 3 }),
      },
    })
  }

  // Batch update
  for (const batch of chunk(updates, 50)) {
    await prisma.$transaction(
      batch.map(u => prisma.guest.update({ where: { id: u.id }, data: u.data })),
    )
  }

  return updates.length
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
