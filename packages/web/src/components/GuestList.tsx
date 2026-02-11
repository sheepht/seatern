import { useState, useRef, useDeferredValue } from 'react'
import { useGuests, useCreateGuest, useUpdateGuest, useUpdateGuestTags, useDeleteGuest, useApproveGuest, useRejectGuest } from '@/hooks/use-guests'
import { useTags } from '@/hooks/use-tags'
import { useContacts } from '@/hooks/use-contacts'
import ImportGuestsDialog from './ImportGuestsDialog'

export default function GuestList({ eventId, categories }: { eventId: string; categories: string[] }) {
  const { data: guests, isLoading } = useGuests(eventId)
  const { data: tags } = useTags(eventId)
  const createGuest = useCreateGuest(eventId)
  const updateGuest = useUpdateGuest(eventId)
  const updateGuestTags = useUpdateGuestTags(eventId)
  const deleteGuest = useDeleteGuest(eventId)
  const approveGuest = useApproveGuest(eventId)
  const rejectGuest = useRejectGuest(eventId)

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedEvent, setCopiedEvent] = useState(false)

  const createRef = useRef<HTMLDialogElement>(null)
  const editRef = useRef<HTMLDialogElement>(null)
  const deleteRef = useRef<HTMLDialogElement>(null)
  const importRef = useRef<HTMLDialogElement>(null)
  const reviewRef = useRef<HTMLDialogElement>(null)
  const [reviewGuest, setReviewGuest] = useState<any>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editGuest, setEditGuest] = useState<any>(null)
  const [editCategory, setEditCategory] = useState('')
  const [editRelationScore, setEditRelationScore] = useState(3)
  const [editTagIds, setEditTagIds] = useState<string[]>([])
  const [origTagIds, setOrigTagIds] = useState<string[]>([])

  // Create form state
  const [contactSearch, setContactSearch] = useState('')
  const deferredContactSearch = useDeferredValue(contactSearch)
  const { data: contactResults } = useContacts(deferredContactSearch || undefined)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [selectedContactName, setSelectedContactName] = useState('')
  const [category, setCategory] = useState('')
  const [relationScore, setRelationScore] = useState(3)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  function filteredTags(cat: string) {
    if (!tags) return []
    return tags.filter((t: any) => !t.category || t.category === cat)
  }

  function openCreate() {
    setContactSearch('')
    setSelectedContactId(null)
    setSelectedContactName('')
    setCategory(categories[0] ?? '')
    setRelationScore(3)
    setSelectedTagIds([])
    createRef.current?.showModal()
  }

  function selectContact(c: any) {
    setSelectedContactId(c.id)
    setSelectedContactName(c.name)
    setContactSearch('')
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedContactId) return
    createGuest.mutate(
      {
        contactId: selectedContactId,
        ...(category && { category }),
        relationScore,
        tagIds: selectedTagIds,
      },
      {
        onSuccess: () => createRef.current?.close(),
      },
    )
  }

  function openEdit(g: any) {
    setEditGuest(g)
    setEditCategory(g.category ?? '')
    setEditRelationScore(g.relationScore)
    const currentTagIds = (g.tags ?? []).map((gt: any) => gt.tag.id)
    setEditTagIds(currentTagIds)
    setOrigTagIds(currentTagIds)
    editRef.current?.showModal()
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editGuest) return
    const guestId = editGuest.id

    // Update guest fields
    updateGuest.mutate(
      {
        guestId,
        category: editCategory || undefined,
        relationScore: editRelationScore,
      },
      {
        onSuccess: () => {
          // Update tags if changed
          const addTagIds = editTagIds.filter((id) => !origTagIds.includes(id))
          const removeTagIds = origTagIds.filter((id) => !editTagIds.includes(id))
          if (addTagIds.length > 0 || removeTagIds.length > 0) {
            updateGuestTags.mutate({ guestId, addTagIds, removeTagIds })
          }
          editRef.current?.close()
          setEditGuest(null)
        },
      },
    )
  }

  function toggleEditTag(tagId: string) {
    setEditTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    )
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    )
  }

  function copyFormLink(token: string, guestId: string) {
    const url = `${window.location.origin}/form/${token}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(guestId)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  function confirmDelete(guestId: string) {
    setDeleteId(guestId)
    deleteRef.current?.showModal()
  }

  function handleDelete() {
    if (!deleteId) return
    deleteGuest.mutate(deleteId, {
      onSuccess: () => {
        deleteRef.current?.close()
        setDeleteId(null)
      },
    })
  }

  function openReview(g: any) {
    setReviewGuest(g)
    reviewRef.current?.showModal()
  }

  function handleApprove() {
    if (!reviewGuest) return
    approveGuest.mutate(reviewGuest.id, {
      onSuccess: () => {
        reviewRef.current?.close()
        setReviewGuest(null)
      },
    })
  }

  function handleReject() {
    if (!reviewGuest) return
    rejectGuest.mutate(reviewGuest.id, {
      onSuccess: () => {
        reviewRef.current?.close()
        setReviewGuest(null)
      },
    })
  }

  const pendingCount = guests?.filter((g: any) => g.pendingSubmission != null).length ?? 0

  if (isLoading) return <p className="text-gray-500">載入中...</p>

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
          新增賓客
        </button>
        <button onClick={() => importRef.current?.showModal()} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">
          CSV 匯入
        </button>
        <button
          onClick={() => {
            const url = `${window.location.origin}/form/event/${eventId}`
            navigator.clipboard.writeText(url).then(() => {
              setCopiedEvent(true)
              setTimeout(() => setCopiedEvent(false), 2000)
            })
          }}
          className="px-4 py-2 border rounded hover:bg-gray-50 text-sm"
        >
          {copiedEvent ? '已複製！' : '複製統一表單連結'}
        </button>
        {pendingCount > 0 && (
          <span className="text-sm text-amber-600 bg-amber-50 px-2 py-1 rounded">
            {pendingCount} 位賓客待審核
          </span>
        )}
        <span className="text-sm text-gray-500 ml-auto">共 {guests?.length ?? 0} 位賓客</span>
      </div>

      {guests && guests.length === 0 && (
        <p className="text-gray-500">尚無賓客，點擊「新增賓客」或「CSV 匯入」。</p>
      )}

      {guests && guests.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b font-medium">
              <tr>
                <th className="py-2">姓名</th>
                <th className="py-2">分類</th>
                <th className="py-2">關係分</th>
                <th className="py-2">標籤</th>
                <th className="py-2">RSVP</th>
                <th className="py-2">人數</th>
                <th className="py-2">表單</th>
                <th className="py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {guests.map((g: any) => (
                <tr key={g.id} className="border-b">
                  <td className="py-2">{g.contact?.name ?? '?'}</td>
                  <td className="py-2 text-gray-500">{g.category || '-'}</td>
                  <td className="py-2">{g.relationScore}</td>
                  <td className="py-2">
                    {g.tags?.length > 0
                      ? g.tags.map((gt: any) => (
                          <span key={gt.tag.id} className="inline-block text-xs bg-gray-100 rounded px-1.5 py-0.5 mr-1">
                            {gt.tag.name}
                          </span>
                        ))
                      : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      g.rsvpStatus === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                      g.rsvpStatus === 'DECLINED' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {g.rsvpStatus === 'CONFIRMED' ? '已確認' :
                       g.rsvpStatus === 'DECLINED' ? '婉拒' :
                       g.rsvpStatus === 'MODIFIED' ? '已修改' : '待回覆'}
                    </span>
                    {g.pendingSubmission && (
                      <button
                        onClick={() => openReview(g)}
                        className="ml-1 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200"
                      >
                        待審核
                      </button>
                    )}
                  </td>
                  <td className="py-2">{g.attendeeCount}{g.infantCount > 0 ? ` +${g.infantCount}嬰` : ''}</td>
                  <td className="py-2">
                    <button
                      onClick={() => copyFormLink(g.formToken, g.id)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {copiedId === g.id ? '已複製！' : '複製連結'}
                    </button>
                  </td>
                  <td className="py-2 space-x-2">
                    {g.pendingSubmission && (
                      <button onClick={() => openReview(g)} className="text-amber-600 hover:underline text-sm">審核</button>
                    )}
                    <button onClick={() => openEdit(g)} className="text-blue-600 hover:underline text-sm">編輯</button>
                    <button onClick={() => confirmDelete(g.id)} className="text-red-500 hover:underline text-sm">刪除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create guest dialog */}
      <dialog ref={createRef} className="rounded-lg p-6 w-full max-w-md backdrop:bg-black/30">
        <h2 className="text-lg font-semibold mb-4">新增賓客</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          {/* Contact search */}
          <div>
            <label className="block text-sm font-medium mb-1">聯絡人 *</label>
            {selectedContactId ? (
              <div className="flex items-center gap-2">
                <span className="border rounded px-3 py-2 flex-1">{selectedContactName}</span>
                <button type="button" onClick={() => { setSelectedContactId(null); setSelectedContactName('') }} className="text-sm text-gray-500 hover:underline">
                  清除
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  className="w-full border rounded px-3 py-2"
                  placeholder="搜尋聯絡人..."
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                />
                {contactSearch && contactResults && contactResults.length > 0 && (
                  <ul className="absolute z-10 w-full bg-white border rounded mt-1 max-h-40 overflow-y-auto shadow">
                    {contactResults.map((c: any) => (
                      <li
                        key={c.id}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm"
                        onClick={() => selectContact(c)}
                      >
                        {c.name}
                        {c.aliases?.length > 0 && <span className="text-gray-400 ml-1">({c.aliases.join(', ')})</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {contactSearch && contactResults && contactResults.length === 0 && (
                  <p className="absolute z-10 w-full bg-white border rounded mt-1 px-3 py-2 text-sm text-gray-500 shadow">
                    找不到聯絡人，請先到通訊錄新增。
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Category */}
          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">分類</label>
              <select className="w-full border rounded px-3 py-2" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">不指定</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          )}

          {/* Relation score */}
          <div>
            <label className="block text-sm font-medium mb-1">關係分數 (1-3)</label>
            <input
              type="number"
              min={1}
              max={3}
              className="w-full border rounded px-3 py-2"
              value={relationScore}
              onChange={(e) => setRelationScore(Number(e.target.value))}
            />
          </div>

          {/* Tags (filtered by category) */}
          {filteredTags(category).length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">標籤</label>
              <div className="flex flex-wrap gap-2">
                {filteredTags(category).map((t: any) => (
                  <label key={t.id} className="flex items-center gap-1 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTagIds.includes(t.id)}
                      onChange={() => toggleTag(t.id)}
                    />
                    {t.name}
                    {t.category && <span className="text-gray-400 text-xs">({t.category})</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => createRef.current?.close()} className="px-4 py-2 border rounded">取消</button>
            <button
              type="submit"
              disabled={!selectedContactId || createGuest.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {createGuest.isPending ? '新增中...' : '新增'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Edit guest dialog */}
      <dialog ref={editRef} className="rounded-lg p-6 w-full max-w-md backdrop:bg-black/30">
        <h2 className="text-lg font-semibold mb-4">
          編輯賓客 {editGuest?.contact?.name ? `— ${editGuest.contact.name}` : ''}
        </h2>
        <form onSubmit={handleEdit} className="space-y-3">
          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">分類</label>
              <select className="w-full border rounded px-3 py-2" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                <option value="">不指定</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">關係分數 (1-3)</label>
            <input
              type="number"
              min={1}
              max={3}
              className="w-full border rounded px-3 py-2"
              value={editRelationScore}
              onChange={(e) => setEditRelationScore(Number(e.target.value))}
            />
          </div>
          {filteredTags(editCategory).length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">標籤</label>
              <div className="flex flex-wrap gap-2">
                {filteredTags(editCategory).map((t: any) => (
                  <label key={t.id} className="flex items-center gap-1 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editTagIds.includes(t.id)}
                      onChange={() => toggleEditTag(t.id)}
                    />
                    {t.name}
                    {t.category && <span className="text-gray-400 text-xs">({t.category})</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => editRef.current?.close()} className="px-4 py-2 border rounded">取消</button>
            <button
              type="submit"
              disabled={updateGuest.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {updateGuest.isPending ? '儲存中...' : '儲存'}
            </button>
          </div>
        </form>
      </dialog>

      {/* Delete confirm */}
      <dialog ref={deleteRef} className="rounded-lg p-6 w-full max-w-sm backdrop:bg-black/30">
        <h2 className="text-lg font-semibold mb-2">確認刪除</h2>
        <p className="text-gray-600 mb-4">確定要移除此賓客嗎？</p>
        <div className="flex justify-end gap-2">
          <button onClick={() => deleteRef.current?.close()} className="px-4 py-2 border rounded">取消</button>
          <button onClick={handleDelete} disabled={deleteGuest.isPending} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
            {deleteGuest.isPending ? '刪除中...' : '確定刪除'}
          </button>
        </div>
      </dialog>

      {/* CSV Import dialog */}
      <ImportGuestsDialog ref={importRef} eventId={eventId} />

      {/* Review pending submission dialog */}
      <dialog ref={reviewRef} className="rounded-lg p-6 w-full max-w-lg backdrop:bg-black/30">
        {reviewGuest && (() => {
          const pending = reviewGuest.pendingSubmission
          const isFirstSubmission = reviewGuest.rsvpStatus === 'PENDING'
          const rsvpLabel = (s: string) =>
            s === 'confirmed' || s === 'CONFIRMED' ? '確認出席' :
            s === 'declined' || s === 'DECLINED' ? '婉拒' :
            s === 'modified' || s === 'MODIFIED' ? '已修改' : '待回覆'

          const currentPrefs = (reviewGuest.preferencesFrom ?? []).map((p: any) =>
            p.preferred?.contact?.name ?? '(未知)'
          ).join('、') || '(無)'
          const pendingPrefs = (pending.seatPreferences ?? []).map((p: any) =>
            p.preferredName
          ).join('、') || '(無)'

          const currentTags = (reviewGuest.tags ?? []).map((gt: any) => gt.tag.name).join('、') || '(無)'

          type DiffRow = { label: string; current: string; pending: string }
          const diffs: DiffRow[] = []

          const curRsvp = rsvpLabel(reviewGuest.rsvpStatus)
          const pendRsvp = rsvpLabel(pending.rsvpStatus)
          if (isFirstSubmission || curRsvp !== pendRsvp) {
            diffs.push({ label: '出席意願', current: isFirstSubmission ? '(未回覆)' : curRsvp, pending: pendRsvp })
          }
          if (isFirstSubmission || reviewGuest.attendeeCount !== pending.attendeeCount) {
            diffs.push({ label: '成人人數', current: isFirstSubmission ? '(未回覆)' : String(reviewGuest.attendeeCount), pending: String(pending.attendeeCount) })
          }
          if (isFirstSubmission || reviewGuest.infantCount !== pending.infantCount) {
            diffs.push({ label: '嬰兒人數', current: isFirstSubmission ? '(未回覆)' : String(reviewGuest.infantCount), pending: String(pending.infantCount) })
          }
          const curDietary = reviewGuest.dietaryNote || '(無)'
          const pendDietary = pending.dietaryNote || '(無)'
          if (isFirstSubmission || curDietary !== pendDietary) {
            diffs.push({ label: '飲食需求', current: isFirstSubmission ? '(未回覆)' : curDietary, pending: pendDietary })
          }
          const curSpecial = reviewGuest.specialNote || '(無)'
          const pendSpecial = pending.specialNote || '(無)'
          if (isFirstSubmission || curSpecial !== pendSpecial) {
            diffs.push({ label: '特殊需求', current: isFirstSubmission ? '(未回覆)' : curSpecial, pending: pendSpecial })
          }
          if (isFirstSubmission || currentPrefs !== pendingPrefs) {
            diffs.push({ label: '想同桌', current: isFirstSubmission ? '(未回覆)' : currentPrefs, pending: pendingPrefs })
          }

          return (
            <>
              <h2 className="text-lg font-semibold mb-1">
                審核回覆 — {reviewGuest.contact?.name ?? '?'}
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                提交時間：{reviewGuest.pendingSubmittedAt ? new Date(reviewGuest.pendingSubmittedAt).toLocaleString('zh-TW') : '-'}
              </p>

              {diffs.length === 0 ? (
                <p className="text-gray-500 mb-4">內容與目前資料完全相同。</p>
              ) : (
                <table className="w-full text-sm mb-4 border">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="py-2 px-3 text-left">欄位</th>
                      <th className="py-2 px-3 text-left">目前</th>
                      <th className="py-2 px-3 text-left">待審核</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffs.map((row) => (
                      <tr key={row.label} className="border-b">
                        <td className="py-2 px-3 font-medium">{row.label}</td>
                        <td className="py-2 px-3 text-gray-500">{row.current}</td>
                        <td className="py-2 px-3 text-blue-700">{row.pending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { reviewRef.current?.close(); setReviewGuest(null) }}
                  className="px-4 py-2 border rounded"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={rejectGuest.isPending}
                  className="px-4 py-2 border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                >
                  {rejectGuest.isPending ? '處理中...' : '拒絕'}
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={approveGuest.isPending}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {approveGuest.isPending ? '處理中...' : '核准'}
                </button>
              </div>
            </>
          )
        })()}
      </dialog>
    </div>
  )
}
