import { useState, useDeferredValue, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useFormData, useFormSubmit, useFormGuestSearch } from '@/hooks/use-form'

interface SeatPref {
  preferredId: string
  preferredName: string
  rank: number
}

const DIETARY_OPTIONS = ['素食', '不吃牛', '海鮮過敏']
const SPECIAL_OPTIONS = ['輪椅', '兒童椅', '靠近出口']

function parseDietaryNote(note?: string | null): { checks: string[]; other: string } {
  if (!note) return { checks: [], other: '' }
  const checks: string[] = []
  let rest = note
  for (const opt of DIETARY_OPTIONS) {
    if (rest.includes(opt)) {
      checks.push(opt)
      rest = rest.replace(opt, '')
    }
  }
  rest = rest.replace(/^[、,\s]+|[、,\s]+$/g, '').replace(/[、,]{2,}/g, '、')
  return { checks, other: rest }
}

function parseSpecialNote(note?: string | null): { checks: string[]; other: string } {
  if (!note) return { checks: [], other: '' }
  const checks: string[] = []
  let rest = note
  for (const opt of SPECIAL_OPTIONS) {
    if (rest.includes(opt)) {
      checks.push(opt)
      rest = rest.replace(opt, '')
    }
  }
  rest = rest.replace(/^[、,\s]+|[、,\s]+$/g, '').replace(/[、,]{2,}/g, '、')
  return { checks, other: rest }
}

function combineNote(checks: string[], other: string): string | undefined {
  const parts = [...checks]
  if (other.trim()) parts.push(other.trim())
  return parts.length > 0 ? parts.join('、') : undefined
}

function SeatPreferenceInput({
  token,
  preferences,
  onChange,
}: {
  token: string
  preferences: SeatPref[]
  onChange: (prefs: SeatPref[]) => void
}) {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const { data: results } = useFormGuestSearch(token, deferredSearch)

  function addPref(guestId: string, name: string) {
    if (preferences.length >= 3) return
    if (preferences.some((p) => p.preferredId === guestId)) return
    onChange([...preferences, { preferredId: guestId, preferredName: name, rank: preferences.length + 1 }])
    setSearch('')
  }

  function removePref(guestId: string) {
    const updated = preferences
      .filter((p) => p.preferredId !== guestId)
      .map((p, i) => ({ ...p, rank: i + 1 }))
    onChange(updated)
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-1">想同桌的人（最多 3 位）</label>
      {preferences.length > 0 && (
        <ul className="mb-2 space-y-1">
          {preferences.map((p) => (
            <li key={p.preferredId} className="flex items-center gap-2 text-sm bg-gray-50 rounded px-3 py-1.5">
              <span className="text-gray-400 text-xs">#{p.rank}</span>
              <span className="flex-1">{p.preferredName}</span>
              <button type="button" onClick={() => removePref(p.preferredId)} className="text-red-400 hover:text-red-600 text-xs">
                移除
              </button>
            </li>
          ))}
        </ul>
      )}
      {preferences.length < 3 && (
        <div className="relative">
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            placeholder="輸入姓名搜尋..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && results && results.length > 0 && (
            <ul className="absolute z-10 w-full bg-white border rounded mt-1 max-h-40 overflow-y-auto shadow">
              {results
                .filter((r: any) => !preferences.some((p) => p.preferredId === r.guestId))
                .map((r: any) => (
                  <li
                    key={r.guestId}
                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm"
                    onClick={() => addPref(r.guestId, r.name)}
                  >
                    {r.name}
                    {r.aliases?.length > 0 && <span className="text-gray-400 ml-1">({r.aliases.join(', ')})</span>}
                  </li>
                ))}
            </ul>
          )}
          {search && results && results.length === 0 && (
            <p className="absolute z-10 w-full bg-white border rounded mt-1 px-3 py-2 text-sm text-gray-500 shadow">
              找不到符合的賓客
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function GuestFormPage({ tokenProp }: { tokenProp?: string }) {
  const { token: paramToken } = useParams<{ token: string }>()
  const token = tokenProp ?? paramToken ?? ''
  const { data, isLoading, isError } = useFormData(token)
  const submit = useFormSubmit(token)

  const [rsvp, setRsvp] = useState<'confirmed' | 'declined' | ''>('')
  const [attendeeCount, setAttendeeCount] = useState(1)
  const [infantCount, setInfantCount] = useState(0)
  const [preferences, setPreferences] = useState<SeatPref[]>([])
  const [dietaryChecks, setDietaryChecks] = useState<string[]>([])
  const [dietaryOther, setDietaryOther] = useState('')
  const [specialChecks, setSpecialChecks] = useState<string[]>([])
  const [specialOther, setSpecialOther] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // Pre-fill from existing data
  useEffect(() => {
    if (!data) return
    if (data.isSubmitted) {
      const status = data.rsvpStatus as string
      if (status === 'confirmed' || status === 'modified') {
        setRsvp('confirmed')
      } else if (status === 'declined') {
        setRsvp('declined')
      }
      setAttendeeCount(data.attendeeCount)
      setInfantCount(data.infantCount)
      setPreferences(
        data.seatPreferences.map((p: any) => ({
          preferredId: p.preferredId,
          preferredName: p.preferredName,
          rank: p.rank,
        })),
      )
      const dietary = parseDietaryNote(data.dietaryNote)
      setDietaryChecks(dietary.checks)
      setDietaryOther(dietary.other)
      const special = parseSpecialNote(data.specialNote)
      setSpecialChecks(special.checks)
      setSpecialOther(special.other)
    }
  }, [data])

  function toggleDietaryCheck(opt: string) {
    setDietaryChecks((prev) => (prev.includes(opt) ? prev.filter((c) => c !== opt) : [...prev, opt]))
  }

  function toggleSpecialCheck(opt: string) {
    setSpecialChecks((prev) => (prev.includes(opt) ? prev.filter((c) => c !== opt) : [...prev, opt]))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!rsvp) return

    submit.mutate(
      {
        rsvpStatus: rsvp,
        attendeeCount: rsvp === 'confirmed' ? attendeeCount : 1,
        infantCount: rsvp === 'confirmed' ? infantCount : 0,
        seatPreferences:
          rsvp === 'confirmed'
            ? preferences.map((p) => ({ preferredId: p.preferredId, rank: p.rank }))
            : [],
        dietaryNote: rsvp === 'confirmed' ? combineNote(dietaryChecks, dietaryOther) : undefined,
        specialNote: rsvp === 'confirmed' ? combineNote(specialChecks, specialOther) : undefined,
        addTagIds: [],
        removeTagIds: [],
      },
      { onSuccess: () => setSubmitted(true) },
    )
  }

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">載入中...</p>
      </div>
    )
  }

  // Not found
  if (isError || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8">
        <h1 className="text-2xl font-bold mb-2">找不到此表單</h1>
        <p className="text-gray-500">連結可能無效或已過期。</p>
      </div>
    )
  }

  // Thank you
  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8">
        <h1 className="text-2xl font-bold mb-2">感謝您的回覆！</h1>
        <p className="text-gray-500">
          {rsvp === 'confirmed'
            ? `期待在「${data.eventName}」見到您！`
            : '已收到您的回覆，感謝通知。'}
        </p>
        <button
          onClick={() => setSubmitted(false)}
          className="mt-4 text-blue-600 hover:underline text-sm"
        >
          修改回覆
        </button>
      </div>
    )
  }

  const eventDate = new Date(data.eventDate).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">{data.eventName}</h1>
          <p className="text-gray-500 mt-1">{eventDate}</p>
          <p className="text-gray-600 mt-2">
            {data.guestName}，您好！請填寫以下表單。
          </p>
          {data.isSubmitted && (
            <p className="text-amber-600 text-sm mt-2 bg-amber-50 rounded px-3 py-1.5 inline-block">
              您已填寫過此表單，可修改後重新提交。
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-5">
          {/* RSVP */}
          <div>
            <label className="block text-sm font-medium mb-2">出席意願 *</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="rsvp"
                  value="confirmed"
                  checked={rsvp === 'confirmed'}
                  onChange={() => setRsvp('confirmed')}
                />
                <span>確認出席</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="rsvp"
                  value="declined"
                  checked={rsvp === 'declined'}
                  onChange={() => setRsvp('declined')}
                />
                <span>婉拒</span>
              </label>
            </div>
          </div>

          {/* Confirmed-only fields */}
          {rsvp === 'confirmed' && (
            <>
              {/* Attendee count */}
              <div>
                <label className="block text-sm font-medium mb-1">成人人數（含本人）</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={attendeeCount}
                  onChange={(e) => setAttendeeCount(Number(e.target.value))}
                >
                  <option value={1}>1 位</option>
                  <option value={2}>2 位（含 1 位伴侶）</option>
                </select>
              </div>

              {/* Infant count */}
              <div>
                <label className="block text-sm font-medium mb-1">嬰兒人數（需嬰兒椅）</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={infantCount}
                  onChange={(e) => setInfantCount(Number(e.target.value))}
                >
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              {/* Seat preferences */}
              <SeatPreferenceInput
                token={token ?? ''}
                preferences={preferences}
                onChange={setPreferences}
              />

              {/* Dietary note */}
              <div>
                <label className="block text-sm font-medium mb-1">飲食需求</label>
                <div className="flex flex-wrap gap-3 mb-2">
                  {DIETARY_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dietaryChecks.includes(opt)}
                        onChange={() => toggleDietaryCheck(opt)}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="其他飲食需求..."
                  value={dietaryOther}
                  onChange={(e) => setDietaryOther(e.target.value)}
                />
              </div>

              {/* Special note */}
              <div>
                <label className="block text-sm font-medium mb-1">特殊需求</label>
                <div className="flex flex-wrap gap-3 mb-2">
                  {SPECIAL_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={specialChecks.includes(opt)}
                        onChange={() => toggleSpecialCheck(opt)}
                      />
                      {opt}
                    </label>
                  ))}
                </div>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="其他特殊需求..."
                  value={specialOther}
                  onChange={(e) => setSpecialOther(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!rsvp || submit.isPending}
            className="w-full py-2.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {submit.isPending ? '提交中...' : data.isSubmitted ? '更新回覆' : '送出'}
          </button>
          {submit.isError && (
            <p className="text-red-600 text-sm text-center">提交失敗，請稍後再試。</p>
          )}
        </form>
      </div>
    </div>
  )
}
