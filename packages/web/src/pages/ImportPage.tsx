import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ParseResult } from '@/lib/csv-parser'
import type { RawGuest } from '@/lib/column-detector'
import type { PreferenceMatch as PrefMatch } from '@/lib/preference-matcher'
import { matchAllPreferences } from '@/lib/preference-matcher'
import { CsvUpload } from '@/components/import/CsvUpload'
import { PasteArea } from '@/components/import/PasteArea'
import { ImportPreview } from '@/components/import/ImportPreview'
import { PreferenceMatch } from '@/components/import/PreferenceMatch'

type Step = 'input' | 'preview' | 'preferences'

export default function ImportPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('input')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [guests, setGuests] = useState<RawGuest[]>([])
  const [matches, setMatches] = useState<PrefMatch[]>([])
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleParsed = useCallback((result: ParseResult) => {
    setParseResult(result)
    setStep('preview')
    setError(null)
  }, [])

  const handlePreviewConfirm = useCallback((confirmedGuests: RawGuest[]) => {
    setGuests(confirmedGuests)

    // 檢查是否有偏好需要配對
    const hasPreferences = confirmedGuests.some((g) => g.rawPreferences.length > 0)
    if (hasPreferences) {
      const prefMatches = matchAllPreferences(confirmedGuests)
      setMatches(prefMatches)
      setStep('preferences')
    } else {
      // 沒有偏好，直接匯入
      doImport(confirmedGuests, [])
    }
  }, [])

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
      // 1. 建立活動
      const eventRes = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: '我的婚禮', type: 'wedding' }),
      })
      if (!eventRes.ok) throw new Error('建立活動失敗')
      const event = await eventRes.json()

      // 2. 批次匯入賓客
      const guestRes = await fetch(`/api/events/${event.id}/guests/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          guests: guestList.map((g) => ({
            name: g.name,
            aliases: g.aliases,
            category: g.category || undefined,
            relationScore: 2,
            rsvpStatus: g.rsvpStatus,
            attendeeCount: g.attendeeCount,
            dietaryNote: g.dietaryNote || undefined,
            specialNote: g.specialNote || undefined,
          })),
        }),
      })
      if (!guestRes.ok) throw new Error('匯入賓客失敗')
      const { guests: createdGuests } = await guestRes.json()

      // 3. 建立座位偏好（如果有配對結果）
      const validPrefs = prefMatches.filter(
        (m) => m.selectedIndex !== null && m.selectedIndex >= 0,
      )
      if (validPrefs.length > 0) {
        const prefRes = await fetch(`/api/events/${event.id}/preferences/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            preferences: validPrefs.map((m) => ({
              guestId: createdGuests[m.fromIndex].id,
              preferredGuestId: createdGuests[m.selectedIndex!].id,
              rank: m.rank,
            })),
          }),
        })
        if (!prefRes.ok) throw new Error('建立座位偏好失敗')
      }

      // 4. 自動產生桌次（根據確認出席的席位數）
      const confirmedSeats = guestList
        .filter((g) => g.rsvpStatus === 'confirmed')
        .reduce((sum, g) => sum + g.attendeeCount, 0)
      const tableCount = Math.max(1, Math.ceil(confirmedSeats / 10))

      for (let i = 0; i < tableCount; i++) {
        // 排成網格佈局
        const cols = Math.ceil(Math.sqrt(tableCount))
        const row = Math.floor(i / cols)
        const col = i % cols
        const spacingX = 250
        const spacingY = 250
        const startX = 200
        const startY = 200

        await fetch(`/api/events/${event.id}/tables`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: `第${i + 1}桌`,
            capacity: 10,
            positionX: startX + col * spacingX,
            positionY: startY + row * spacingY,
          }),
        })
      }

      // 5. 導向工作區
      navigate(`/workspace/${event.id}`)
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
              <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>開始安排座位</h1>
              <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>匯入你的賓客名單</p>
            </div>

            <CsvUpload onParsed={handleParsed} />

            <div className="flex items-center gap-3">
              <div className="flex-1" style={{ borderTop: '1px solid var(--border)' }} />
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>或者直接貼上表格資料</span>
              <div className="flex-1" style={{ borderTop: '1px solid var(--border)' }} />
            </div>

            <PasteArea onParsed={handleParsed} />

            <details className="text-sm">
              <summary className="cursor-pointer hover:opacity-80" style={{ color: 'var(--text-secondary)' }}>
                進階：貼上 Google Sheet 網址
              </summary>
              <div className="mt-3 p-3 text-xs" style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
                此功能在 Phase 2 加入。目前請使用 CSV 上傳或複製貼上。
              </div>
            </details>

            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              沒有 Google Sheet？{' '}
              <span className="cursor-pointer hover:underline" style={{ color: 'var(--accent)' }}>
                使用我們的範本 →
              </span>
            </div>
          </div>
        )}

        {step === 'preview' && parseResult && (
          <div>
            <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>確認匯入資料</h1>
            <ImportPreview
              data={parseResult}
              onConfirm={handlePreviewConfirm}
              onBack={() => setStep('input')}
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
