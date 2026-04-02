import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ParseResult } from '@/lib/csv-parser'
import type { RawGuest } from '@/lib/column-detector'
import type { PreferenceMatch as PrefMatch } from '@/lib/preference-matcher'
import { matchAllPreferences } from '@/lib/preference-matcher'
import { diffGuests, type DiffResult } from '@/lib/guest-diff'
import { CsvUpload } from '@/components/import/CsvUpload'
import { PasteArea } from '@/components/import/PasteArea'
import { ImportPreview } from '@/components/import/ImportPreview'
import { PreferenceMatch } from '@/components/import/PreferenceMatch'

type Step = 'input' | 'preview' | 'preferences'

interface ExistingGuest {
  id: string
  name: string
  aliases: string[]
}

export default function ImportPage() {
  const navigate = useNavigate()
  const { eventId } = useParams<{ eventId: string }>()

  const [step, setStep] = useState<Step>('input')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [guests, setGuests] = useState<RawGuest[]>([])
  const [matches, setMatches] = useState<PrefMatch[]>([])
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 重新匯入：載入現有賓客名單
  const [existingGuests, setExistingGuests] = useState<ExistingGuest[]>([])
  const [existingLoading, setExistingLoading] = useState(false)
  const [diff, setDiff] = useState<DiffResult | null>(null)

  useEffect(() => {
    if (!eventId) return
    setExistingLoading(true)
    fetch(`/api/events/${eventId}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('載入活動失敗')
        return res.json()
      })
      .then((data) => {
        setExistingGuests(
          data.guests.map((g: any) => ({ id: g.id, name: g.name, aliases: g.aliases || [] }))
        )
      })
      .catch((err) => setError(err.message))
      .finally(() => setExistingLoading(false))
  }, [eventId])

  const handleParsed = useCallback((result: ParseResult) => {
    setParseResult(result)
    setStep('preview')
    setError(null)
    setDiff(null) // reset diff when new data is parsed
  }, [])

  const handlePreviewConfirm = useCallback((confirmedGuests: RawGuest[]) => {
    const hasExisting = existingGuests.length > 0
    let guestsToImport = confirmedGuests

    if (hasExisting) {
      const result = diffGuests(confirmedGuests, existingGuests)
      setDiff(result)
      guestsToImport = result.newGuests
    }

    if (guestsToImport.length === 0) {
      setError('沒有新賓客需要匯入')
      return
    }

    setGuests(guestsToImport)

    // 有已存在賓客時，用全部賓客作為搜尋範圍，讓新賓客能配對到已存在的人
    const hasPreferences = guestsToImport.some((g) => g.rawPreferences.length > 0)
    if (hasPreferences) {
      const prefMatches = matchAllPreferences(guestsToImport, hasExisting ? confirmedGuests : undefined)
      setMatches(prefMatches)
      setStep('preferences')
    } else {
      doImport(guestsToImport, [])
    }
  }, [existingGuests])

  const handlePreferencesConfirm = useCallback((resolved: PrefMatch[]) => {
    doImport(guests, resolved)
  }, [guests])

  const handleSkipAll = useCallback(() => {
    doImport(guests, [])
  }, [guests])

  const doImport = async (guestList: RawGuest[], prefMatches: PrefMatch[]) => {
    setImporting(true)
    setError(null)

    try {
      if (!eventId) throw new Error('缺少活動 ID')

      // 批次匯入賓客
      const guestRes = await fetch(`/api/events/${eventId}/guests/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          guests: guestList.map((g) => ({
            name: g.name,
            aliases: g.aliases,
            category: g.category || undefined,
            rsvpStatus: g.rsvpStatus,
            companionCount: g.companionCount,
            dietaryNote: g.dietaryNote || undefined,
            specialNote: g.specialNote || undefined,
          })),
        }),
      })
      if (!guestRes.ok) throw new Error('匯入賓客失敗')
      const { guests: createdGuests } = await guestRes.json()

      // 建立座位偏好（如果有配對結果）
      // fromIndex 永遠指向 guestList（新賓客），selectedIndex 可能指向 searchPool（全部賓客）
      const validPrefs = prefMatches.filter(
        (m) => m.selectedIndex !== null && m.selectedIndex >= 0,
      )
      if (validPrefs.length > 0) {
        // 建立名字 → DB ID 的 lookup（新建的 + 已存在的）
        const nameToId = new Map<string, string>()
        createdGuests.forEach((g: any) => nameToId.set(g.name.trim().toLowerCase(), g.id))
        existingGuests.forEach((g) => nameToId.set(g.name.trim().toLowerCase(), g.id))

        const preferences = validPrefs
          .map((m) => {
            const fromId = createdGuests[m.fromIndex]?.id
            // selectedIndex 指向 searchPool，用候選人的 name 查找 DB ID
            const preferredName = m.candidates.find((c) => c.guestIndex === m.selectedIndex)?.name
            const preferredId = preferredName ? nameToId.get(preferredName.trim().toLowerCase()) : undefined
            if (!fromId || !preferredId) return null
            return { guestId: fromId, preferredGuestId: preferredId, rank: m.rank }
          })
          .filter((p): p is NonNullable<typeof p> => p !== null)

        if (preferences.length > 0) {
          const prefRes = await fetch(`/api/events/${eventId}/preferences/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ preferences }),
          })
          if (!prefRes.ok) throw new Error('建立座位偏好失敗')
        }
      }

      // 建立子分類（如果有）
      const subcatAssignments: Array<{ guestId: string; subcategoryName: string; category: string }> = []
      guestList.forEach((g, i) => {
        if (!g.rawSubcategory || !g.category) return
        const guestId = createdGuests[i]?.id
        if (!guestId) return
        subcatAssignments.push({
          guestId,
          subcategoryName: g.rawSubcategory,
          category: g.category || '',
        })
      })
      if (subcatAssignments.length > 0) {
        await fetch(`/api/events/${eventId}/subcategories/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ assignments: subcatAssignments }),
        })
      }

      // 建立避免同桌（如果有）
      const avoidPairs: Array<{ guestAId: string; guestBId: string }> = []
      const seenAvoidPairs = new Set<string>()
      guestList.forEach((g, i) => {
        if (g.rawAvoids.length === 0) return
        const guestAId = createdGuests[i]?.id
        if (!guestAId) return
        for (const avoidName of g.rawAvoids) {
          const targetIdx = guestList.findIndex((t) => t.name === avoidName)
          if (targetIdx < 0) continue
          const guestBId = createdGuests[targetIdx]?.id
          if (!guestBId) continue
          const key = [guestAId, guestBId].sort().join('-')
          if (seenAvoidPairs.has(key)) continue
          seenAvoidPairs.add(key)
          avoidPairs.push({ guestAId, guestBId })
        }
      })
      if (avoidPairs.length > 0) {
        await fetch(`/api/events/${eventId}/avoid-pairs/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ pairs: avoidPairs }),
        })
      }

      // 自動補桌次（根據新增的確認出席席位數）
      const newConfirmedSeats = guestList
        .filter((g) => g.rsvpStatus === 'confirmed')
        .reduce((sum, g) => sum + g.companionCount + 1, 0)

      if (newConfirmedSeats > 0) {
        const newTableCount = Math.ceil(newConfirmedSeats / 10)
        // 取得現有桌次數量來決定新桌的名稱和位置
        const eventRes = await fetch(`/api/events/${eventId}`, { credentials: 'include' })
        const eventData = await eventRes.json()
        const existingTableCount = eventData.tables?.length || 0
        for (let i = 0; i < newTableCount; i++) {
          const tableNum = existingTableCount + i + 1
          const totalTables = existingTableCount + newTableCount
          const cols = Math.ceil(Math.sqrt(totalTables))
          const idx = existingTableCount + i
          const row = Math.floor(idx / cols)
          const col = idx % cols
          await fetch(`/api/events/${eventId}/tables`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              name: `第${tableNum}桌`,
              capacity: 10,
              positionX: 200 + col * 350,
              positionY: 200 + row * 350,
            }),
          })
        }
      }

      navigate(`/workspace/${eventId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯入失敗')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-2xl p-8" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
        {step === 'input' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                {existingGuests.length > 0 ? '追加賓客' : '匯入賓客名單'}
              </h1>
              <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
                {existingGuests.length > 0
                  ? `已有 ${existingGuests.length} 位賓客，系統會自動跳過已存在的人`
                  : '上傳 CSV、Excel 或直接貼上表格資料'
                }
              </p>
            </div>

            {existingLoading ? (
              <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>載入中...</div>
            ) : (
              <>
                <CsvUpload onParsed={handleParsed} />

                <div className="flex items-center gap-3">
                  <div className="flex-1" style={{ borderTop: '1px solid var(--border)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>或者直接貼上表格資料</span>
                  <div className="flex-1" style={{ borderTop: '1px solid var(--border)' }} />
                </div>

                <PasteArea onParsed={handleParsed} />

                <div className="p-4 text-sm" style={{ background: 'var(--accent-light)', borderRadius: 'var(--radius-md)' }}>
                  <p className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>還沒有賓客名單？</p>
                  <p className="mb-3" style={{ color: 'var(--text-secondary)' }}>
                    下載我們的範本，填入你的賓客資料後再匯入。欄位已預先設定好，系統會自動對應。
                  </p>
                  <div className="flex gap-3">
                    <a
                      href="/seatern-template.csv"
                      download="seatern-template.csv"
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium hover:opacity-80"
                      style={{ background: 'var(--accent)', color: '#fff', borderRadius: 'var(--radius-sm)' }}
                    >
                      下載 CSV 範本
                    </a>
                    <a
                      href="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/copy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium hover:opacity-80"
                      style={{ border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 'var(--radius-sm)' }}
                    >
                      複製 Google Sheet 範本
                    </a>
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/workspace/${eventId}/guests`)}
                  className="text-sm hover:underline"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ← 返回賓客名單
                </button>
              </>
            )}
          </div>
        )}

        {step === 'preview' && parseResult && (
          <div>
            <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>確認匯入資料</h1>
            <ImportPreview
              data={parseResult}
              onConfirm={handlePreviewConfirm}
              onBack={() => setStep('input')}
              existingGuests={existingGuests.length > 0 ? existingGuests : undefined}
            />
          </div>
        )}

        {step === 'preferences' && (
          <div>
            <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>確認「想同桌」配對</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              系統已自動比對賓客填寫的「想同桌人選」，以下需要你確認
            </p>
            <PreferenceMatch
              matches={matches}
              onConfirm={handlePreferencesConfirm}
              onSkipAll={handleSkipAll}
              onBack={() => setStep('preview')}
            />
          </div>
        )}

        {importing && (
          <div className="mt-4 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>匯入中...</div>
        )}
        {error && (
          <div className="mt-4 p-3 text-sm" style={{ background: '#FEF2F2', color: 'var(--error)', borderRadius: 'var(--radius-sm)' }}>{error}</div>
        )}
      </div>
    </div>
  )
}
