import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAdminPlans,
  useAdminApprove,
  useAdminReject,
  useAdminUpdateEvent,
  type PlanEvent,
} from '@/hooks/useAdminApi';

const PLAN_PRICE: Record<string, number> = { '30': 199, '50': 499, '80': 799, '200': 1499 };

const PLAN_OPTIONS = [
  { value: '', label: '無（免費版）' },
  { value: '30', label: '30 桌 / NT$199' },
  { value: '50', label: '50 桌 / NT$499' },
  { value: '80', label: '80 桌 / NT$799' },
  { value: '200', label: '200 桌 / NT$1,499' },
];

const STATUS_OPTIONS = [
  { value: '', label: '無' },
  { value: 'pending', label: '待審核' },
  { value: 'active', label: '已啟用' },
];

function toDateInput(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [verifying, setVerifying] = useState(true);
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ planType: '', planStatus: '', planExpiresAt: '', planCreatedAt: '', planNote: '' });

  useEffect(() => {
    const adminSecret = localStorage.getItem('admin_secret');
    if (!adminSecret) {
      navigate('/', { replace: true });
      return;
    }
    fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: adminSecret }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      })
      .then(({ token: t }) => {
        setToken(t);
        setVerifying(false);
      })
      .catch(() => {
        localStorage.removeItem('admin_secret');
        navigate('/', { replace: true });
      });
  }, [navigate]);

  const { data, isLoading, refetch, isError } = useAdminPlans(token);
  const approveMut = useAdminApprove(token);
  const rejectMut = useAdminReject(token);
  const updateMut = useAdminUpdateEvent(token);

  if (isError) {
    localStorage.removeItem('admin_secret');
    navigate('/', { replace: true });
  }

  const pending = data?.pending ?? [];
  const all = data?.all ?? [];

  const startEdit = (event: PlanEvent) => {
    setEditingId(event.id);
    setEditForm({
      planType: event.planType || '',
      planStatus: event.planStatus || '',
      planExpiresAt: toDateInput(event.planExpiresAt),
      planCreatedAt: toDateInput(event.planCreatedAt),
      planNote: event.planNote || '',
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateMut.mutate({
      eventId: editingId,
      patch: {
        planType: editForm.planType || null,
        planStatus: editForm.planStatus || null,
        planExpiresAt: editForm.planExpiresAt ? new Date(editForm.planExpiresAt).toISOString() : null,
        planCreatedAt: editForm.planCreatedAt ? new Date(editForm.planCreatedAt).toISOString() : null,
        planNote: editForm.planNote || null,
      },
    }, { onSuccess: () => setEditingId(null) });
  };

  if (verifying || !token) return (
    <p className="text-base text-stone-400 text-center py-12">驗證中...</p>
  );

  const statusBadge = (status: string | null) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">待審核</span>;
      case 'active':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">已啟用</span>;
      case 'expired':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-500">已到期</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-400">免費版</span>;
    }
  };

  const list = tab === 'pending' ? pending : all;
  const actionLoading = approveMut.isPending || rejectMut.isPending || updateMut.isPending;
  const actionId = approveMut.variables ?? rejectMut.variables ?? (updateMut.variables as { eventId: string } | undefined)?.eventId ?? null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-3xl font-bold text-stone-900 font-[family-name:var(--font-display)]">
          管理後台
        </h1>
        <button
          onClick={() => { localStorage.removeItem('admin_secret'); navigate('/', { replace: true }); }}
          className="text-sm text-stone-400 hover:text-stone-600"
        >
          登出
        </button>
      </div>
      <p className="text-base text-stone-400 mb-6">付費申請管理</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-stone-200">
        <button
          onClick={() => setTab('pending')}
          className={`px-4 py-2.5 text-base font-medium border-b-2 transition-colors ${
            tab === 'pending'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-stone-400 hover:text-stone-600'
          }`}
        >
          待審核 {pending.length > 0 && <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">{pending.length}</span>}
        </button>
        <button
          onClick={() => setTab('all')}
          className={`px-4 py-2.5 text-base font-medium border-b-2 transition-colors ${
            tab === 'all'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-stone-400 hover:text-stone-600'
          }`}
        >
          全部方案
        </button>
      </div>

      {isLoading ? (
        <p className="text-base text-stone-400 text-center py-12">載入中...</p>
      ) : list.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-stone-400 text-base">
            {tab === 'pending' ? '目前沒有待審核的付費申請' : '尚無付費紀錄'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((event) => {
            const isEditing = editingId === event.id;
            const isBusy = actionLoading && actionId === event.id;
            return (
              <div key={event.id} className="rounded-xl border border-stone-200 p-5">
                {/* 基本資訊 */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-stone-900 text-base">{event.ownerName}</span>
                      {statusBadge(event.planStatus)}
                    </div>
                    <p className="text-sm text-stone-400 mb-2">{event.ownerEmail}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500">
                      <span>活動：{event.name}</span>
                      <span>方案：{event.planType ? `${event.planType} 桌` : '免費版'}</span>
                      <span>金額：NT${PLAN_PRICE[event.planType || ''] || '—'}</span>
                      <span>賓客：{event.guestCount} 人</span>
                      <span>桌數：{event.tableCount} 桌</span>
                      {event.planCreatedAt && (
                        <span>申請日：{new Date(event.planCreatedAt).toLocaleDateString('zh-TW')}</span>
                      )}
                      {event.planExpiresAt && (
                        <span>到期：{new Date(event.planExpiresAt).toLocaleDateString('zh-TW')}</span>
                      )}
                    </div>
                    {event.planNote && (
                      <p className="text-sm text-stone-400 mt-1">備註：{event.planNote}</p>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {event.planStatus === 'pending' && !isEditing && (
                      <>
                        <button
                          onClick={() => approveMut.mutate(event.id)}
                          disabled={isBusy}
                          className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-[var(--accent)] disabled:opacity-50"
                        >
                          {isBusy ? '...' : '核准'}
                        </button>
                        <button
                          onClick={() => { if (confirm('確定要拒絕這個付費申請？')) rejectMut.mutate(event.id); }}
                          disabled={isBusy}
                          className="px-5 py-2 rounded-lg text-sm font-medium text-stone-500 border border-stone-200 hover:bg-stone-50 disabled:opacity-50"
                        >
                          拒絕
                        </button>
                      </>
                    )}
                    {!isEditing && (
                      <button
                        onClick={() => startEdit(event)}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-stone-500 border border-stone-200 hover:bg-stone-50"
                      >
                        編輯
                      </button>
                    )}
                  </div>
                </div>

                {/* 編輯表單 */}
                {isEditing && (
                  <div className="mt-4 pt-4 border-t border-stone-100">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                      <div>
                        <label className="block text-sm text-stone-500 mb-1">方案</label>
                        <select
                          value={editForm.planType}
                          onChange={(e) => setEditForm({ ...editForm, planType: e.target.value })}
                          className="w-full h-10 px-3 rounded-lg border border-stone-200 text-base bg-white focus:outline-none focus:border-[var(--accent)]"
                        >
                          {PLAN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-stone-500 mb-1">狀態</label>
                        <select
                          value={editForm.planStatus}
                          onChange={(e) => setEditForm({ ...editForm, planStatus: e.target.value })}
                          className="w-full h-10 px-3 rounded-lg border border-stone-200 text-base bg-white focus:outline-none focus:border-[var(--accent)]"
                        >
                          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-stone-500 mb-1">申請日</label>
                        <input
                          type="date"
                          value={editForm.planCreatedAt}
                          onChange={(e) => setEditForm({ ...editForm, planCreatedAt: e.target.value })}
                          className="w-full h-10 px-3 rounded-lg border border-stone-200 text-base focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-stone-500 mb-1">到期日</label>
                        <input
                          type="date"
                          value={editForm.planExpiresAt}
                          onChange={(e) => setEditForm({ ...editForm, planExpiresAt: e.target.value })}
                          className="w-full h-10 px-3 rounded-lg border border-stone-200 text-base focus:outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    </div>
                    <div className="mb-4">
                      <label className="block text-sm text-stone-500 mb-1">備註</label>
                      <input
                        type="text"
                        value={editForm.planNote}
                        onChange={(e) => setEditForm({ ...editForm, planNote: e.target.value })}
                        placeholder="例如：已確認匯款 NT$499"
                        className="w-full h-10 px-3 rounded-lg border border-stone-200 text-base focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-5 py-2 rounded-lg text-sm font-medium text-stone-500 border border-stone-200 hover:bg-stone-50"
                      >
                        取消
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={updateMut.isPending}
                        className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-[var(--accent)] disabled:opacity-50"
                      >
                        {updateMut.isPending ? '儲存中...' : '儲存'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 text-center">
        <button onClick={() => refetch()} className="text-sm text-[var(--accent)] hover:underline">
          重新整理
        </button>
      </div>
    </div>
  );
}
