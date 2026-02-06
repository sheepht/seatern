import { useParams } from 'react-router-dom'

export default function EventDetailPage() {
  const { eventId } = useParams()

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">活動詳情</h1>
      <p className="text-gray-500">Event ID: {eventId}</p>
      <p className="text-gray-500">賓客 / 標籤 / 桌次 Tabs（Phase 4 實作）</p>
    </div>
  )
}
