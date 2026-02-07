import { useState, useRef } from 'react'
import { useUpdateEvent, useRenameCategory, useDeleteCategory } from '@/hooks/use-events'
import { useGuests } from '@/hooks/use-guests'

export default function CategoryManager({ eventId, categories }: { eventId: string; categories: string[] }) {
  const updateEvent = useUpdateEvent()
  const renameCategory = useRenameCategory(eventId)
  const deleteCategory = useDeleteCategory(eventId)
  const { data: guests } = useGuests(eventId)

  const createRef = useRef<HTMLDialogElement>(null)
  const editRef = useRef<HTMLDialogElement>(null)
  const deleteRef = useRef<HTMLDialogElement>(null)

  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState('')
  const [editTarget, setEditTarget] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editError, setEditError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // 每個分類的賓客數
  const countByCategory = new Map<string, number>()
  let uncategorized = 0
  if (guests) {
    for (const g of guests as any[]) {
      const cat = g.category
      if (cat) {
        countByCategory.set(cat, (countByCategory.get(cat) || 0) + 1)
      } else {
        uncategorized++
      }
    }
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const value = newName.trim()
    if (!value) return
    if (categories.includes(value)) { setCreateError(`分類「${value}」已存在`); return }
    setCreateError('')
    updateEvent.mutate(
      { id: eventId, categories: [...categories, value] },
      { onSuccess: () => { setNewName(''); createRef.current?.close() } },
    )
  }

  function openEdit(cat: string) {
    setEditTarget(cat)
    setEditName(cat)
    setEditError('')
    editRef.current?.showModal()
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    const value = editName.trim()
    if (!editTarget || !value) return
    if (value === editTarget) { editRef.current?.close(); return }
    if (categories.includes(value)) { setEditError(`分類「${value}」已存在`); return }
    setEditError('')
    renameCategory.mutate(
      { oldName: editTarget, newName: value },
      { onSuccess: () => { editRef.current?.close(); setEditTarget(null) } },
    )
  }

  function confirmDelete(cat: string) {
    setDeleteTarget(cat)
    deleteRef.current?.showModal()
  }

  function handleDelete() {
    if (!deleteTarget) return
    deleteCategory.mutate(deleteTarget, {
      onSuccess: () => { deleteRef.current?.close(); setDeleteTarget(null) },
    })
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => { setNewName(''); createRef.current?.showModal() }} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
          新增分類
        </button>
        <span className="text-sm text-gray-500 ml-auto">共 {categories.length} 個分類</span>
      </div>

      {categories.length === 0 && (
        <p className="text-gray-500">尚無分類，點擊「新增分類」開始。</p>
      )}

      {categories.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="border-b font-medium">
            <tr>
              <th className="py-2">名稱</th>
              <th className="py-2">賓客數</th>
              <th className="py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat} className="border-b">
                <td className="py-2">
                  <span className="inline-block text-xs bg-blue-50 text-blue-700 rounded px-2 py-1">{cat}</span>
                </td>
                <td className="py-2">{countByCategory.get(cat) ?? 0}</td>
                <td className="py-2 space-x-2">
                  <button onClick={() => openEdit(cat)} className="text-blue-600 hover:underline">編輯</button>
                  <button onClick={() => confirmDelete(cat)} className="text-red-500 hover:underline">刪除</button>
                </td>
              </tr>
            ))}
            {uncategorized > 0 && (
              <tr className="border-b text-gray-400">
                <td className="py-2">（未分類）</td>
                <td className="py-2">{uncategorized}</td>
                <td className="py-2" />
              </tr>
            )}
          </tbody>
        </table>
      )}

      {/* Create dialog */}
      <dialog ref={createRef} className="rounded-lg p-6 w-full max-w-sm backdrop:bg-black/30">
        <h2 className="text-lg font-semibold mb-4">新增分類</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">名稱 *</label>
            <input required className="w-full border rounded px-3 py-2" value={newName} onChange={(e) => { setNewName(e.target.value); setCreateError('') }} />
            {createError && <p className="text-sm text-red-600 mt-1">{createError}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => createRef.current?.close()} className="px-4 py-2 border rounded">取消</button>
            <button type="submit" disabled={updateEvent.isPending} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {updateEvent.isPending ? '新增中...' : '新增'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Edit dialog */}
      <dialog ref={editRef} className="rounded-lg p-6 w-full max-w-sm backdrop:bg-black/30">
        <h2 className="text-lg font-semibold mb-4">編輯分類</h2>
        <form onSubmit={handleEdit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">名稱 *</label>
            <input required className="w-full border rounded px-3 py-2" value={editName} onChange={(e) => { setEditName(e.target.value); setEditError('') }} />
            {editError && <p className="text-sm text-red-600 mt-1">{editError}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => editRef.current?.close()} className="px-4 py-2 border rounded">取消</button>
            <button type="submit" disabled={renameCategory.isPending} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {renameCategory.isPending ? '儲存中...' : '儲存'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Delete confirm */}
      <dialog ref={deleteRef} className="rounded-lg p-6 w-full max-w-sm backdrop:bg-black/30">
        <h2 className="text-lg font-semibold mb-2">確認刪除</h2>
        <p className="text-gray-600 mb-4">
          刪除分類「{deleteTarget}」後，已設定此分類的賓客不會被刪除，但其分類欄位會變為空白。
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => deleteRef.current?.close()} className="px-4 py-2 border rounded">取消</button>
          <button onClick={handleDelete} disabled={deleteCategory.isPending} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
            {deleteCategory.isPending ? '刪除中...' : '確定刪除'}
          </button>
        </div>
      </dialog>
    </div>
  )
}
