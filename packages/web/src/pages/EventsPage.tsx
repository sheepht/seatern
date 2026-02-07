import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEvents, useCreateEvent, useDeleteEvent } from '@/hooks/use-events'

const TYPE_LABELS: Record<string, string> = {
  WEDDING: '婚禮',
  BANQUET: '尾牙',
  CORPORATE: '企業活動',
  OTHER: '其他',
}

const DEFAULT_CATEGORIES: Record<string, string[]> = {
  wedding: ['男方', '女方', '共同'],
  banquet: [],
  corporate: ['部門A', '部門B'],
  other: [],
}

export default function EventsPage() {
  const navigate = useNavigate()
  const { data: events, isLoading } = useEvents()
  const createEvent = useCreateEvent()
  const deleteEvent = useDeleteEvent()

  const createRef = useRef<HTMLDialogElement>(null)
  const deleteRef = useRef<HTMLDialogElement>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [form, setForm] = useState({ name: '', date: '', type: 'wedding' })

  function openCreate() {
    setForm({ name: '', date: '', type: 'wedding' })
    createRef.current?.showModal()
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    createEvent.mutate(
      {
        name: form.name,
        date: new Date(form.date).toISOString(),
        type: form.type,
        categories: DEFAULT_CATEGORIES[form.type] ?? [],
      },
      { onSuccess: () => createRef.current?.close() },
    )
  }

  function confirmDelete(id: string) {
    setDeleteId(id)
    deleteRef.current?.showModal()
  }

  function handleDelete() {
    if (!deleteId) return
    deleteEvent.mutate(deleteId, {
      onSuccess: () => {
        deleteRef.current?.close()
        setDeleteId(null)
      },
    })
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">我的活動</h1>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          新增活動
        </button>
      </div>

      {isLoading && <p className="text-gray-500">載入中...</p>}

      {events && events.length === 0 && (
        <p className="text-gray-500">尚無活動，點擊「新增活動」開始。</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {events?.map((ev: any) => (
          <div
            key={ev.id}
            className="border rounded-lg p-4 cursor-pointer hover:border-blue-400 transition-colors"
            onClick={() => navigate(`/events/${ev.id}`)}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-lg">{ev.name}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {new Date(ev.date).toLocaleDateString('zh-TW')}
                </p>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-gray-100">
                {TYPE_LABELS[ev.type] ?? ev.type}
              </span>
            </div>
            <div className="mt-3 flex gap-4 text-sm text-gray-600">
              <span>{ev._count?.guests ?? '?'} 位賓客</span>
              <span>{ev._count?.tables ?? '?'} 桌</span>
            </div>
            <button
              className="mt-3 text-sm text-red-500 hover:underline"
              onClick={(e) => {
                e.stopPropagation()
                confirmDelete(ev.id)
              }}
            >
              刪除
            </button>
          </div>
        ))}
      </div>

      {/* Create dialog */}
      <dialog ref={createRef} className="rounded-lg p-6 w-full max-w-md backdrop:bg-black/30">
        <h2 className="text-lg font-semibold mb-4">新增活動</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">活動名稱</label>
            <input
              required
              className="w-full border rounded px-3 py-2"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">日期</label>
            <input
              required
              type="date"
              className="w-full border rounded px-3 py-2"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">類型</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="wedding">婚禮</option>
              <option value="banquet">尾牙</option>
              <option value="corporate">企業活動</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => createRef.current?.close()} className="px-4 py-2 border rounded">
              取消
            </button>
            <button type="submit" disabled={createEvent.isPending} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {createEvent.isPending ? '建立中...' : '建立'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Delete confirm dialog */}
      <dialog ref={deleteRef} className="rounded-lg p-6 w-full max-w-sm backdrop:bg-black/30">
        <h2 className="text-lg font-semibold mb-2">確認刪除</h2>
        <p className="text-gray-600 mb-4">刪除後無法復原，確定要刪除此活動嗎？</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => deleteRef.current?.close()} className="px-4 py-2 border rounded">
            取消
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteEvent.isPending}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
          >
            {deleteEvent.isPending ? '刪除中...' : '確定刪除'}
          </button>
        </div>
      </dialog>
    </div>
  )
}
