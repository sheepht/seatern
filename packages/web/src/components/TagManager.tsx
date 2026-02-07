import { useState, useRef } from 'react'
import { useTags, useCreateTag, useUpdateTag, useDeleteTag } from '@/hooks/use-tags'

export default function TagManager({ eventId, categories }: { eventId: string; categories: string[] }) {
  const { data: tags, isLoading } = useTags(eventId)
  const createTag = useCreateTag(eventId)
  const updateTag = useUpdateTag(eventId)
  const deleteTag = useDeleteTag(eventId)

  const createRef = useRef<HTMLDialogElement>(null)
  const editRef = useRef<HTMLDialogElement>(null)
  const deleteRef = useRef<HTMLDialogElement>(null)

  const [form, setForm] = useState({ name: '', category: '' })
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function openCreate() {
    setForm({ name: '', category: '' })
    createRef.current?.showModal()
  }

  function openEdit(t: any) {
    setEditId(t.id)
    setForm({ name: t.name, category: t.category ?? '' })
    editRef.current?.showModal()
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    createTag.mutate(
      { name: form.name, ...(form.category && { category: form.category }) },
      { onSuccess: () => createRef.current?.close() },
    )
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    updateTag.mutate(
      { tagId: editId, name: form.name, ...(form.category ? { category: form.category } : { category: undefined }) },
      {
        onSuccess: () => {
          editRef.current?.close()
          setEditId(null)
        },
      },
    )
  }

  function confirmDelete(id: string) {
    setDeleteId(id)
    deleteRef.current?.showModal()
  }

  function handleDelete() {
    if (!deleteId) return
    deleteTag.mutate(deleteId, {
      onSuccess: () => {
        deleteRef.current?.close()
        setDeleteId(null)
      },
    })
  }

  if (isLoading) return <p className="text-gray-500">載入中...</p>

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
          新增標籤
        </button>
        <span className="text-sm text-gray-500 ml-auto">共 {tags?.length ?? 0} 個標籤</span>
      </div>

      {tags && tags.length === 0 && (
        <p className="text-gray-500">尚無標籤，點擊「新增標籤」開始。</p>
      )}

      {tags && tags.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="border-b font-medium">
            <tr>
              <th className="py-2">名稱</th>
              <th className="py-2">綁定分類</th>
              <th className="py-2">賓客數</th>
              <th className="py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((t: any) => (
              <tr key={t.id} className="border-b">
                <td className="py-2">
                  <span className="inline-block text-xs bg-gray-100 rounded px-2 py-1">{t.name}</span>
                </td>
                <td className="py-2 text-gray-500">{t.category || '-'}</td>
                <td className="py-2">{t._count?.guests ?? 0}</td>
                <td className="py-2 space-x-2">
                  <button onClick={() => openEdit(t)} className="text-blue-600 hover:underline">編輯</button>
                  <button onClick={() => confirmDelete(t.id)} className="text-red-500 hover:underline">刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Create tag dialog */}
      <dialog ref={createRef} className="rounded-lg p-6 w-full max-w-sm backdrop:bg-black/30">
        <h2 className="text-lg font-semibold mb-4">新增標籤</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">名稱 *</label>
            <input required className="w-full border rounded px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">綁定分類</label>
              <select className="w-full border rounded px-3 py-2" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">不綁定</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => createRef.current?.close()} className="px-4 py-2 border rounded">取消</button>
            <button type="submit" disabled={createTag.isPending} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {createTag.isPending ? '新增中...' : '新增'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Edit tag dialog */}
      <dialog ref={editRef} className="rounded-lg p-6 w-full max-w-sm backdrop:bg-black/30">
        <h2 className="text-lg font-semibold mb-4">編輯標籤</h2>
        <form onSubmit={handleEdit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">名稱 *</label>
            <input required className="w-full border rounded px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">綁定分類</label>
              <select className="w-full border rounded px-3 py-2" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">不綁定</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => editRef.current?.close()} className="px-4 py-2 border rounded">取消</button>
            <button type="submit" disabled={updateTag.isPending} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {updateTag.isPending ? '儲存中...' : '儲存'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Delete confirm */}
      <dialog ref={deleteRef} className="rounded-lg p-6 w-full max-w-sm backdrop:bg-black/30">
        <h2 className="text-lg font-semibold mb-2">確認刪除</h2>
        <p className="text-gray-600 mb-4">刪除標籤後，所有賓客的此標籤關聯也會移除。</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => deleteRef.current?.close()} className="px-4 py-2 border rounded">取消</button>
          <button onClick={handleDelete} disabled={deleteTag.isPending} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
            {deleteTag.isPending ? '刪除中...' : '確定刪除'}
          </button>
        </div>
      </dialog>
    </div>
  )
}
