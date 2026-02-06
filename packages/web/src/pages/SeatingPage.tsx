import { useParams } from 'react-router-dom'

export default function SeatingPage() {
  const { eventId } = useParams()

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">排位工作區</h1>
      <p className="text-gray-500">Event ID: {eventId}</p>
      <p className="text-gray-500">拖曳排位畫布（Phase 6 實作）</p>
    </div>
  )
}
