import { useState, useRef, useDeferredValue } from 'react'
import { useContacts, useCreateContact, useUpdateContact, useDeleteContact } from '@/hooks/use-contacts'

interface ContactForm {
  name: string
  aliases: string
  email: string
  phone: string
}

const emptyForm: ContactForm = { name: '', aliases: '', email: '', phone: '' }

export default function ContactsPage() {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const { data: contacts, isLoading } = useContacts(deferredSearch || undefined)
  const createContact = useCreateContact()
  const updateContact = useUpdateContact()
  const deleteContact = useDeleteContact()

  const createRef = useRef<HTMLDialogElement>(null)
  const editRef = useRef<HTMLDialogElement>(null)
  const deleteRef = useRef<HTMLDialogElement>(null)

  const [form, setForm] = useState<ContactForm>(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function openCreate() {
    setForm(emptyForm)
    createRef.current?.showModal()
  }

  function openEdit(c: any) {
    setEditId(c.id)
    setForm({
      name: c.name,
      aliases: (c.aliases ?? []).join(', '),
      email: c.email ?? '',
      phone: c.phone ?? '',
    })
    editRef.current?.showModal()
  }

  function parseAliases(raw: string): string[] {
    return raw.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean)
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    createContact.mutate(
      {
        name: form.name,
        aliases: parseAliases(form.aliases),
        ...(form.email && { email: form.email }),
        ...(form.phone && { phone: form.phone }),
      },
      { onSuccess: () => createRef.current?.close() },
    )
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    updateContact.mutate(
      {
        id: editId,
        name: form.name,
        aliases: parseAliases(form.aliases),
        ...(form.email ? { email: form.email } : { email: undefined }),
        ...(form.phone ? { phone: form.phone } : { phone: undefined }),
      },
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
    deleteContact.mutate(deleteId, {
      onSuccess: () => {
        deleteRef.current?.close()
        setDeleteId(null)
      },
    })
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">通訊錄</h1>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          新增聯絡人
        </button>
      </div>

      <input
        type="text"
        placeholder="搜尋姓名或別名..."
        className="w-full border rounded px-3 py-2 mb-4"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading && <p className="text-gray-500">載入中...</p>}

      {contacts && contacts.length === 0 && (
        <p className="text-gray-500">找不到聯絡人。</p>
      )}

      {contacts && contacts.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="border-b font-medium">
            <tr>
              <th className="py-2">姓名</th>
              <th className="py-2">別名</th>
              <th className="py-2">Email</th>
              <th className="py-2">電話</th>
              <th className="py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c: any) => (
              <tr key={c.id} className="border-b">
                <td className="py-2">{c.name}</td>
                <td className="py-2 text-gray-500">{(c.aliases ?? []).join(', ') || '-'}</td>
                <td className="py-2 text-gray-500">{c.email || '-'}</td>
                <td className="py-2 text-gray-500">{c.phone || '-'}</td>
                <td className="py-2 space-x-2">
                  <button onClick={() => openEdit(c)} className="text-blue-600 hover:underline">編輯</button>
                  <button onClick={() => confirmDelete(c.id)} className="text-red-500 hover:underline">刪除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Create dialog */}
      <dialog ref={createRef} className="rounded-lg p-6 w-full max-w-md backdrop:bg-black/30">
        <h2 className="text-lg font-semibold mb-4">新增聯絡人</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">姓名 *</label>
            <input required className="w-full border rounded px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">別名（逗號分隔）</label>
            <input className="w-full border rounded px-3 py-2" value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} placeholder="小明, 阿明" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" className="w-full border rounded px-3 py-2" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">電話</label>
            <input className="w-full border rounded px-3 py-2" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => createRef.current?.close()} className="px-4 py-2 border rounded">取消</button>
            <button type="submit" disabled={createContact.isPending} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {createContact.isPending ? '新增中...' : '新增'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Edit dialog */}
      <dialog ref={editRef} className="rounded-lg p-6 w-full max-w-md backdrop:bg-black/30">
        <h2 className="text-lg font-semibold mb-4">編輯聯絡人</h2>
        <form onSubmit={handleEdit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">姓名 *</label>
            <input required className="w-full border rounded px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">別名（逗號分隔）</label>
            <input className="w-full border rounded px-3 py-2" value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" className="w-full border rounded px-3 py-2" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">電話</label>
            <input className="w-full border rounded px-3 py-2" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => editRef.current?.close()} className="px-4 py-2 border rounded">取消</button>
            <button type="submit" disabled={updateContact.isPending} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {updateContact.isPending ? '儲存中...' : '儲存'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Delete confirm */}
      <dialog ref={deleteRef} className="rounded-lg p-6 w-full max-w-sm backdrop:bg-black/30">
        <h2 className="text-lg font-semibold mb-2">確認刪除</h2>
        <p className="text-gray-600 mb-4">刪除後無法復原，確定要刪除此聯絡人嗎？</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => deleteRef.current?.close()} className="px-4 py-2 border rounded">取消</button>
          <button onClick={handleDelete} disabled={deleteContact.isPending} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
            {deleteContact.isPending ? '刪除中...' : '確定刪除'}
          </button>
        </div>
      </dialog>
    </div>
  )
}
