import { useState, useDeferredValue, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useEventInfo, useEventGuestSearch, useFormData } from '@/hooks/use-form'
import GuestFormPage from './GuestFormPage'

type Stage = 'loading' | 'error' | 'returning' | 'search' | 'confirm' | 'form'

interface SelectedGuest {
  guestId: string
  name: string
  aliases: string[]
  formToken: string
  isSubmitted: boolean
}

function lsKey(eventId: string) {
  return `seatern-form-token:${eventId}`
}

export default function EventFormEntryPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { data: eventInfo, isLoading: eventLoading, isError: eventError } = useEventInfo(eventId ?? '')

  const [stage, setStage] = useState<Stage>('loading')
  const [savedToken, setSavedToken] = useState<string | null>(null)
  const [selected, setSelected] = useState<SelectedGuest | null>(null)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const { data: searchResults } = useEventGuestSearch(eventId ?? '', deferredSearch)

  // For returning user: load their name via token
  const { data: returningData, isLoading: returningLoading } = useFormData(savedToken ?? '')

  // On mount: check localStorage
  useEffect(() => {
    if (!eventId) return
    const token = localStorage.getItem(lsKey(eventId))
    if (token) {
      setSavedToken(token)
    }
  }, [eventId])

  // Determine stage based on loading states
  useEffect(() => {
    if (eventLoading) {
      setStage('loading')
      return
    }
    if (eventError || !eventInfo) {
      setStage('error')
      return
    }
    // If we already picked a guest (CONFIRM/FORM), don't revert
    if (stage === 'confirm' || stage === 'form') return
    // If returning user
    if (savedToken) {
      if (returningLoading) {
        setStage('loading')
      } else if (returningData) {
        setStage('returning')
      } else {
        // Token invalid, clear it
        if (eventId) localStorage.removeItem(lsKey(eventId))
        setSavedToken(null)
        setStage('search')
      }
      return
    }
    setStage('search')
  }, [eventLoading, eventError, eventInfo, savedToken, returningLoading, returningData, stage, eventId])

  function handleSelectGuest(guest: SelectedGuest) {
    setSelected(guest)
    setSearch('')
    setStage('confirm')
  }

  function handleConfirmIdentity() {
    if (!selected || !eventId) return
    localStorage.setItem(lsKey(eventId), selected.formToken)
    setSavedToken(selected.formToken)
    setStage('form')
  }

  function handleSwitchUser() {
    if (eventId) localStorage.removeItem(lsKey(eventId))
    setSavedToken(null)
    setSelected(null)
    setSearch('')
    setStage('search')
  }

  function handleContinueAsReturning() {
    setStage('form')
  }

  // --- LOADING ---
  if (stage === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">載入中...</p>
      </div>
    )
  }

  // --- ERROR ---
  if (stage === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-8">
        <h1 className="text-2xl font-bold mb-2">找不到此活動</h1>
        <p className="text-gray-500">連結可能無效或已過期。</p>
      </div>
    )
  }

  const eventDate = eventInfo?.eventDate
    ? new Date(eventInfo.eventDate).toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : ''

  // --- RETURNING ---
  if (stage === 'returning') {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-lg mx-auto text-center">
          <h1 className="text-2xl font-bold mb-2">{eventInfo?.eventName}</h1>
          <p className="text-gray-500 mb-6">{eventDate}</p>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-lg mb-4">{returningData?.guestName}，您好！</p>
            <button
              onClick={handleContinueAsReturning}
              className="w-full py-2.5 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium mb-3"
            >
              繼續填寫
            </button>
            <button
              onClick={handleSwitchUser}
              className="text-sm text-gray-500 hover:underline"
            >
              不是我，換人填寫
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- SEARCH ---
  if (stage === 'search') {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold">{eventInfo?.eventName}</h1>
            <p className="text-gray-500 mt-1">{eventDate}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <label className="block text-sm font-medium mb-2">請輸入您的姓名</label>
            <input
              className="w-full border rounded px-3 py-2 mb-3"
              placeholder="搜尋姓名..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {search && searchResults && searchResults.length > 0 && (
              <ul className="border rounded divide-y max-h-60 overflow-y-auto">
                {searchResults.map((g: any) => (
                  <li
                    key={g.guestId}
                    className="px-4 py-3 hover:bg-blue-50 cursor-pointer flex items-center gap-2"
                    onClick={() => handleSelectGuest(g)}
                  >
                    <span className="font-medium">{g.name}</span>
                    {g.aliases?.length > 0 && (
                      <span className="text-gray-400 text-sm">({g.aliases.join(', ')})</span>
                    )}
                    {g.isSubmitted && (
                      <span className="ml-auto text-xs bg-gray-100 text-gray-500 rounded px-2 py-0.5">已填寫</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {search && searchResults && searchResults.length === 0 && (
              <p className="text-sm text-gray-500">找不到符合的賓客，請確認姓名是否正確。</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // --- CONFIRM ---
  if (stage === 'confirm' && selected) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-lg mx-auto text-center">
          <h1 className="text-2xl font-bold mb-2">{eventInfo?.eventName}</h1>
          <p className="text-gray-500 mb-6">{eventDate}</p>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500 mb-3">請確認您的身份</p>
            <p className="text-2xl font-bold mb-2">{selected.name}</p>
            {selected.aliases.length > 0 && (
              <p className="text-gray-400 mb-4">別名：{selected.aliases.join('、')}</p>
            )}
            <button
              onClick={handleConfirmIdentity}
              className="w-full py-2.5 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium mb-3"
            >
              是的，這是我
            </button>
            <button
              onClick={() => { setSelected(null); setStage('search') }}
              className="text-sm text-gray-500 hover:underline"
            >
              不是，返回搜尋
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- FORM ---
  if (stage === 'form') {
    const activeToken = selected?.formToken ?? savedToken ?? ''
    const activeName = selected?.name ?? returningData?.guestName ?? ''
    return (
      <div>
        {/* Identity banner */}
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center justify-between text-sm">
          <span>
            您正在以 <strong>{activeName}</strong> 的身份填寫
          </span>
          <button onClick={handleSwitchUser} className="text-blue-600 hover:underline">
            不是我，換人填寫
          </button>
        </div>
        <GuestFormPage tokenProp={activeToken} />
      </div>
    )
  }

  return null
}
