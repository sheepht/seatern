import type { RawGuest } from './column-detector'

export interface MatchCandidate {
  guestIndex: number
  name: string
  score: number // 0-1, higher = better match
}

export interface PreferenceMatch {
  /** 填寫偏好的賓客 index */
  fromIndex: number
  fromName: string
  /** 原始填寫文字 */
  rawText: string
  /** 優先順序 1-3 */
  rank: number
  /** 配對狀態 */
  status: 'exact' | 'fuzzy' | 'unmatched'
  /** 候選清單（fuzzy 時有多個，exact 時只有一個） */
  candidates: MatchCandidate[]
  /** 用戶選定的配對對象 index（null = 未選） */
  selectedIndex: number | null
}

/**
 * 對所有賓客的「想同桌」偏好進行配對
 */
export function matchAllPreferences(guests: RawGuest[]): PreferenceMatch[] {
  const results: PreferenceMatch[] = []

  // 建立名字索引：name + aliases → guestIndex
  const nameIndex: Array<{ text: string; guestIndex: number; isAlias: boolean }> = []
  guests.forEach((g, i) => {
    if (g.rsvpStatus === 'declined') return
    nameIndex.push({ text: g.name, guestIndex: i, isAlias: false })
    g.aliases.forEach((a) => {
      nameIndex.push({ text: a, guestIndex: i, isAlias: true })
    })
  })

  for (let fromIdx = 0; fromIdx < guests.length; fromIdx++) {
    const guest = guests[fromIdx]
    if (guest.rsvpStatus === 'declined') continue

    for (let rank = 0; rank < guest.rawPreferences.length; rank++) {
      const rawText = guest.rawPreferences[rank]
      if (!rawText) continue

      const match = findMatch(rawText, fromIdx, nameIndex, guests)
      results.push({
        fromIndex: fromIdx,
        fromName: guest.name,
        rawText,
        rank: rank + 1,
        ...match,
      })
    }
  }

  return results
}

function findMatch(
  rawText: string,
  fromIndex: number,
  nameIndex: Array<{ text: string; guestIndex: number; isAlias: boolean }>,
  guests: RawGuest[],
): { status: 'exact' | 'fuzzy' | 'unmatched'; candidates: MatchCandidate[]; selectedIndex: number | null } {
  const query = rawText.trim().toLowerCase()

  // 1. 完全匹配
  const exactMatches = nameIndex.filter(
    (n) => n.text.toLowerCase() === query && n.guestIndex !== fromIndex,
  )
  if (exactMatches.length === 1) {
    return {
      status: 'exact',
      candidates: [{ guestIndex: exactMatches[0].guestIndex, name: guests[exactMatches[0].guestIndex].name, score: 1 }],
      selectedIndex: exactMatches[0].guestIndex,
    }
  }

  // 2. 模糊匹配：子字串包含
  const fuzzyMatches: MatchCandidate[] = []
  const seen = new Set<number>()

  for (const entry of nameIndex) {
    if (entry.guestIndex === fromIndex) continue
    if (seen.has(entry.guestIndex)) continue

    const entryLower = entry.text.toLowerCase()
    let score = 0

    if (entryLower.includes(query) || query.includes(entryLower)) {
      // 子字串匹配
      const longer = Math.max(entryLower.length, query.length)
      const shorter = Math.min(entryLower.length, query.length)
      score = shorter / longer // 越接近完全匹配，分數越高
    }

    if (score > 0) {
      seen.add(entry.guestIndex)
      fuzzyMatches.push({
        guestIndex: entry.guestIndex,
        name: guests[entry.guestIndex].name,
        score,
      })
    }
  }

  // 如果完全匹配有多個（同名），也當 fuzzy 處理
  if (exactMatches.length > 1) {
    const candidates = exactMatches.map((m) => ({
      guestIndex: m.guestIndex,
      name: guests[m.guestIndex].name,
      score: 1,
    }))
    return { status: 'fuzzy', candidates: candidates.slice(0, 5), selectedIndex: null }
  }

  if (fuzzyMatches.length > 0) {
    fuzzyMatches.sort((a, b) => b.score - a.score)
    return {
      status: 'fuzzy',
      candidates: fuzzyMatches.slice(0, 5),
      selectedIndex: null,
    }
  }

  // 3. 無匹配
  return { status: 'unmatched', candidates: [], selectedIndex: null }
}

/**
 * 統計配對結果
 */
export function summarizeMatches(matches: PreferenceMatch[]) {
  const exact = matches.filter((m) => m.status === 'exact').length
  const fuzzy = matches.filter((m) => m.status === 'fuzzy').length
  const unmatched = matches.filter((m) => m.status === 'unmatched').length
  return { exact, fuzzy, unmatched, total: matches.length }
}
