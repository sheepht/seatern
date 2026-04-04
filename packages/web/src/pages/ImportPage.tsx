import { useState, useCallback, useEffect } from 'react'
import { authFetch } from '@/lib/api'
import { useNavigate } from 'react-router-dom'
import { useSeatingStore } from '@/stores/seating'
import type { ParseResult } from '@/lib/csv-parser'
import { parseCSV } from '@/lib/csv-parser'
import type { RawGuest } from '@/lib/column-detector'
import type { PreferenceMatch as PrefMatch } from '@/lib/preference-matcher'
import { matchAllPreferences } from '@/lib/preference-matcher'
import { diffGuests, type DiffResult } from '@/lib/guest-diff'
import { CsvUpload } from '@/components/import/CsvUpload'
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
  const eventId = useSeatingStore((s) => s.eventId)
  const storeGuests = useSeatingStore((s) => s.guests)

  const [step, setStep] = useState<Step>('input')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [guests, setGuests] = useState<RawGuest[]>([])
  const [matches, setMatches] = useState<PrefMatch[]>([])
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Google Sheet URL 匯入
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheetLoading, setSheetLoading] = useState(false)

  // 重新匯入：從 store 讀取現有賓客名單
  const existingGuests: ExistingGuest[] = storeGuests.map((g) => ({ id: g.id, name: g.name, aliases: g.aliases || [] }))
  const existingLoading = false
  const [diff, setDiff] = useState<DiffResult | null>(null)

  const handleParsed = useCallback((result: ParseResult) => {
    setParseResult(result)
    setStep('preview')
    setError(null)
    setDiff(null)
  }, [])

  // Google Sheet URL → CSV export → parse
  const handleSheetImport = useCallback(async () => {
    const url = sheetUrl.trim()
    if (!url) return

    // 從 URL 中提取 spreadsheet ID
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
    if (!match) {
      setError('無法辨識 Google Sheet 網址，請確認格式正確')
      return
    }
    const sheetId = match[1]
    setSheetLoading(true)
    setError(null)

    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`
      const res = await fetch(csvUrl)
      if (!res.ok) throw new Error('無法存取此 Google Sheet，請確認已設為「任何人都可以檢視」')
      const text = await res.text()
      const result = parseCSV(text)
      if (result.rows.length === 0) {
        setError('Sheet 內容為空')
        return
      }
      handleParsed(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯入 Google Sheet 失敗')
    } finally {
      setSheetLoading(false)
    }
  }, [sheetUrl, handleParsed])

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
      const guestRes = await authFetch(`/api/events/${eventId}/guests/batch`, {
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
          const prefRes = await authFetch(`/api/events/${eventId}/preferences/batch`, {
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
        await authFetch(`/api/events/${eventId}/subcategories/batch`, {
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
        await authFetch(`/api/events/${eventId}/avoid-pairs/batch`, {
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
        const eventRes = await authFetch(`/api/events/${eventId}`, { credentials: 'include' })
        const eventData = await eventRes.json()
        const existingTableCount = eventData.tables?.length || 0
        for (let i = 0; i < newTableCount; i++) {
          const tableNum = existingTableCount + i + 1
          const totalTables = existingTableCount + newTableCount
          const cols = Math.ceil(Math.sqrt(totalTables))
          const idx = existingTableCount + i
          const row = Math.floor(idx / cols)
          const col = idx % cols
          await authFetch(`/api/events/${eventId}/tables`, {
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

      // 重新載入 store 再導頁，避免畫布/名單頁看不到新資料
      await useSeatingStore.getState().loadEvent()
      navigate('/workspace')
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯入失敗')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* input 步驟：居中卡片 */}
      {step === 'input' && (
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
      <div className="w-full max-w-3xl p-8" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
        {(
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                {existingGuests.length > 0 ? '追加賓客' : '匯入賓客名單'}
              </h1>
              <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
                {existingGuests.length > 0
                  ? `已有 ${existingGuests.length} 位賓客，系統會自動跳過已存在的人`
                  : '選擇匯入方式'
                }
              </p>
            </div>

            {existingLoading ? (
              <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>載入中...</div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {/* 左卡：Google Sheet 網址匯入 */}
                <div className="p-5 flex flex-col" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)' }}>
                  <div className="text-base font-medium mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                    Google Sheet
                  </div>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                    貼上公開的 Google Sheet 網址
                  </p>

                  <input
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSheetImport() }}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="text-sm mb-3"
                    style={{
                      width: '100%', padding: '8px 10px',
                      border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface)', color: 'var(--text-primary)',
                      fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                  />

                  <button
                    onClick={handleSheetImport}
                    disabled={!sheetUrl.trim() || sheetLoading}
                    className="text-sm font-medium mb-4 hover:opacity-80 disabled:opacity-40"
                    style={{
                      padding: '8px 0', width: '100%',
                      background: 'var(--accent)', color: '#fff',
                      border: 'none', borderRadius: 'var(--radius-sm)',
                      cursor: !sheetUrl.trim() || sheetLoading ? 'default' : 'pointer',
                    }}
                  >
                    {sheetLoading ? '匯入中...' : '匯入'}
                  </button>

                  <div className="mt-auto text-sm" style={{ color: 'var(--text-muted)' }}>
                    還沒有 Sheet？{' '}
                    <a
                      href="https://docs.google.com/spreadsheets/d/1GkBJ7pmVsIDWQjJvelQRISrWEhMv8CERN8Vy9ZfpctQ/copy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      複製我們的範本 →
                    </a>
                  </div>
                </div>

                {/* 右卡：本機上傳 */}
                <div className="p-5 flex flex-col" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)' }}>
                  <div className="text-base font-medium mb-1" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                    本機上傳
                  </div>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                    上傳 CSV 或 Excel 檔案
                  </p>

                  <div className="flex-1 mb-4">
                    <CsvUpload onParsed={handleParsed} />
                  </div>

                  <div className="mt-auto text-sm" style={{ color: 'var(--text-muted)' }}>
                    還沒有檔案？{' '}
                    <a
                      href="/seatern-template.csv"
                      download="seatern-template.csv"
                      className="hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      下載 CSV 範本 →
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="mt-4 p-3 text-sm" style={{ background: '#FEF2F2', color: 'var(--error)', borderRadius: 'var(--radius-sm)' }}>{error}</div>
        )}
      </div>
      </div>
      )}

      {/* preview 步驟：全版面 */}
      {step === 'preview' && parseResult && (
        <div className="p-6 flex-1 flex flex-col min-h-0" style={{ maxWidth: 1440, margin: '0 auto', width: '100%' }}>
          <ImportPreview
            data={parseResult}
            onConfirm={handlePreviewConfirm}
            onBack={() => setStep('input')}
            existingGuests={existingGuests.length > 0 ? existingGuests : undefined}
          />
          {error && (
            <div className="mt-4 p-3 text-sm" style={{ background: '#FEF2F2', color: 'var(--error)', borderRadius: 'var(--radius-sm)' }}>{error}</div>
          )}
        </div>
      )}

      {/* preferences 步驟：居中卡片 */}
      {step === 'preferences' && (
        <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        <div className="w-full max-w-3xl p-8" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
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
        </div>
      )}

      {importing && (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>匯入中...</div>
      )}
    </div>
  )
}
