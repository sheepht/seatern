import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useEvent } from '@/hooks/use-events'
import GuestList from '@/components/GuestList'
import TagManager from '@/components/TagManager'
import CategoryManager from '@/components/CategoryManager'

const TYPE_LABELS: Record<string, string> = {
  WEDDING: '婚禮',
  BANQUET: '尾牙',
  CORPORATE: '企業活動',
  OTHER: '其他',
}

const TABS = ['賓客', '分類', '標籤', '桌次'] as const
type Tab = (typeof TABS)[number]

export default function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const { data: event, isLoading } = useEvent(eventId!)
  const [tab, setTab] = useState<Tab>('賓客')

  if (isLoading) return <div className="p-8 text-gray-500">載入中...</div>
  if (!event) return <div className="p-8 text-gray-500">找不到活動</div>

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <button onClick={() => navigate('/events')} className="text-sm text-blue-600 hover:underline mb-4 inline-block">
        &larr; 返回活動列表
      </button>
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <span className="text-xs px-2 py-1 rounded bg-gray-100">{TYPE_LABELS[event.type] ?? event.type}</span>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        {new Date(event.date).toLocaleDateString('zh-TW')} &middot; {event._count?.guests ?? 0} 位賓客 &middot; {event._count?.tables ?? 0} 桌
      </p>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === '賓客' && <GuestList eventId={eventId!} categories={event.categories ?? []} />}
      {tab === '分類' && <CategoryManager eventId={eventId!} categories={event.categories ?? []} />}
      {tab === '標籤' && <TagManager eventId={eventId!} categories={event.categories ?? []} />}
      {tab === '桌次' && <p className="text-gray-500">桌次管理（Phase 6 實作）</p>}
    </div>
  )
}
