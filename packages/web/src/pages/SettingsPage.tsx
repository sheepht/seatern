import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { useSeatingStore } from '@/stores/seating';
import { supabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import { trackEvent } from '@/lib/analytics';
import type { UserIdentity } from '@supabase/supabase-js';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuthStore();

  // 進入設定頁時強制刷新 session，取得最新 user_metadata（LINE 綁定後 admin API 更新的 metadata 需要 refresh 才能拿到）
  useEffect(() => {
    supabase.auth.refreshSession().then(({ data }) => {
      if (data.user) useAuthStore.setState({ user: data.user });
    });
  }, []);

  const tables = useSeatingStore((s) => s.tables);
  const tableLimit = useSeatingStore((s) => s.tableLimit);
  const planStatus = useSeatingStore((s) => s.planStatus);

  // Provider detection
  const provider =
    user?.app_metadata?.provider ??
    (user?.user_metadata?.provider as string | undefined) ??
    'email';
  const isEmailUser = provider === 'email';

  // Profile state
  const [name, setName] = useState(
    user?.user_metadata?.name || user?.user_metadata?.full_name || ''
  );
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Linking state
  const [unlinking, setUnlinking] = useState<string | null>(null);

  // Avatar
  const avatarUrl = user?.user_metadata?.avatar_url;
  const initial = name ? name[0] : '?';

  // Identities — Google/Email 用 Supabase identities，LINE 用 user_metadata
  const identities = user?.identities ?? [];
  const linkedGoogle = identities.find((i) => i.provider === 'google');
  const linkedEmail = identities.find((i) => i.provider === 'email');
  const linkedLine = !!(user?.user_metadata?.line_user_id);
  const linkedCount = (linkedGoogle ? 1 : 0) + (linkedEmail ? 1 : 0) + (linkedLine ? 1 : 0);

  // --- Handlers ---

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setNameMsg({ type: 'error', text: '名稱不可為空' }); return; }
    setSavingName(true);
    setNameMsg(null);
    try {
      await supabase.auth.updateUser({ data: { name: trimmed } });
      await api.patch('/users/me', { name: trimmed });
      setNameMsg({ type: 'success', text: '已儲存' });
      setTimeout(() => setNameMsg(null), 3000);
    } catch {
      setNameMsg({ type: 'error', text: '儲存失敗' });
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePw = async () => {
    setPwError('');
    setPwMsg(null);
    if (newPw.length < 6) { setPwError('密碼至少 6 字元'); return; }
    if (newPw !== confirmPw) { setPwError('確認密碼不一致'); return; }
    if (newPw === currentPw) { setPwError('新密碼不能與舊密碼相同'); return; }
    setSavingPw(true);
    try {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: user?.email ?? '', password: currentPw });
      if (verifyErr) { setPwError('目前密碼錯誤'); setSavingPw(false); return; }
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) { setPwError(updateErr.message); setSavingPw(false); return; }
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwMsg({ type: 'success', text: '密碼已更新' });
      setTimeout(() => setPwMsg(null), 3000);
    } catch {
      setPwError('更新失敗');
    } finally {
      setSavingPw(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get('/users/me/export');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'seatern-export.json'; a.click();
      URL.revokeObjectURL(url);
      trackEvent('export_seating', { format: 'json', source: 'settings' });
    } catch { /* empty */ } finally {
      setExporting(false);
    }
  };

  const handleLinkGoogle = async () => {
    await supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo: `${window.location.origin}/settings` } });
  };
  const handleLinkLine = async () => {
    try { const res = await api.get('/auth/line/link'); window.location.href = res.data.url; } catch { /* */ }
  };
  const handleUnlinkLine = async () => {
    setUnlinking('line');
    try {
      await api.post('/auth/line/unlink');
      const { data } = await supabase.auth.getUser();
      if (data.user) useAuthStore.setState({ user: data.user });
    } catch { /* */ } finally { setUnlinking(null); }
  };
  const handleUnlinkGoogle = async (identity: UserIdentity) => {
    setUnlinking('google');
    try {
      await supabase.auth.unlinkIdentity(identity);
      const { data } = await supabase.auth.getUser();
      if (data.user) useAuthStore.setState({ user: data.user });
    } catch { /* */ } finally { setUnlinking(null); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await api.delete('/users/me'); await signOut(); navigate('/'); } catch { setDeleting(false); }
  };

  // Provider badge
  const badgeMap = {
    google: { cls: 'bg-blue-50 text-blue-600', label: 'Google' },
    line: { cls: 'bg-green-50 text-green-600', label: 'LINE' },
    email: { cls: 'bg-[var(--accent-light)] text-[var(--accent)]', label: 'Email' },
  };
  const providerBadge = badgeMap[provider as keyof typeof badgeMap] ?? { cls: 'bg-[var(--accent-light)] text-[var(--accent)]', label: provider };

  const pct = Math.min(100, (tables.length / tableLimit) * 100);

  return (
    <div className="flex-1 overflow-auto bg-[var(--bg-primary)]">
      <div className="max-w-[1440px] mx-auto w-full p-6">
        <div className="flex gap-6 items-start flex-wrap">

          {/* 左欄 */}
          <div className="flex-1 min-w-[280px] flex flex-col gap-4">
            <div className="card">
              <div className="settings-split-profile flex gap-6 flex-wrap">
                {/* 個人資料 */}
                <div className="flex-1 min-w-[220px]">
                  <h2 className="card-title">個人資料</h2>
                  <div className="flex gap-4 items-start">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="avatar" className="w-16 h-16 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-16 h-16 rounded-full shrink-0 flex items-center justify-center text-2xl font-bold text-white bg-[var(--accent)] font-[family-name:var(--font-display)]">
                        {initial}
                      </div>
                    )}
                    <div className="flex-1">
                      <label className="settings-label">名字</label>
                      <input value={name} onChange={(e) => setName(e.target.value)} className="settings-input" />
                      <div className="mt-2 text-[13px] text-[var(--text-muted)]">{user?.email}</div>
                      <div className="mt-1">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${providerBadge.cls}`}>
                          {providerBadge.label}
                        </span>
                      </div>
                      <div className="mt-3 flex gap-2 items-center">
                        <button onClick={handleSaveName} disabled={savingName} className="btn-primary">{savingName ? '儲存中...' : '儲存變更'}</button>
                        {nameMsg && <span className="text-[13px]" style={{ color: nameMsg.type === 'success' ? 'var(--success)' : 'var(--error)' }}>{nameMsg.text}</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 帳號安全 */}
                {isEmailUser && (
                  <div className="settings-divider-col flex-1 min-w-[220px]">
                    <h2 className="card-title">帳號安全</h2>
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="settings-label">目前密碼</label>
                        <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className="settings-input" />
                      </div>
                      <div>
                        <label className="settings-label">新密碼</label>
                        <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className="settings-input" />
                      </div>
                      <div>
                        <label className="settings-label">確認密碼</label>
                        <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="settings-input" />
                      </div>
                      {pwError && <div className="text-[13px] text-[var(--error)]">{pwError}</div>}
                      <div className="flex gap-2 items-center">
                        <button onClick={handleChangePw} disabled={savingPw} className="btn-primary">{savingPw ? '更新中...' : '更新密碼'}</button>
                        {pwMsg && <span className="text-[13px]" style={{ color: pwMsg.type === 'success' ? 'var(--success)' : 'var(--error)' }}>{pwMsg.text}</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 帳號綁定 */}
              <div className="border-t border-[var(--border)] mt-5 pt-5">
                <h2 className="card-title">帳號綁定</h2>
                <div className="flex gap-2 flex-wrap">
                  <LinkPill icon={<GoogleIcon />} label="Google"
                    linked={!!linkedGoogle} loading={unlinking === 'google'} canUnlink={linkedCount > 1}
                    onLink={handleLinkGoogle} onUnlink={() => linkedGoogle && handleUnlinkGoogle(linkedGoogle)} />
                  <LinkPill icon={<LineIcon />} label="LINE"
                    linked={linkedLine} loading={unlinking === 'line'} canUnlink={linkedCount > 1}
                    onLink={handleLinkLine} onUnlink={handleUnlinkLine} />
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border border-[var(--border)]">
                    <EmailIcon /><span>Email</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{linkedEmail ? '已綁定' : '未綁定'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 右欄 */}
          <div className="flex-1 min-w-[280px] flex flex-col gap-4">
            <div className="card">
              {/* 使用方案 */}
              <h2 className="card-title">使用方案</h2>
              <div className="settings-split-plan flex gap-6 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg font-bold text-[var(--accent)] font-[family-name:var(--font-display)]">
                      {tableLimit > 20 ? `${tableLimit} 桌方案` : '免費版'}
                    </span>
                    {planStatus === 'pending' ? (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">匯款確認中</span>
                    ) : (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold bg-[var(--accent-light)] text-[var(--accent)]">目前方案</span>
                    )}
                  </div>
                  <div className="mb-2">
                    <div className="flex justify-between text-[13px] mb-1 text-[var(--text-secondary)]">
                      <span>桌數用量</span>
                      <span className="font-medium font-[family-name:var(--font-data)]">{tables.length} / {tableLimit}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden bg-[var(--border)]">
                      <div className="h-full rounded-full transition-[width] duration-300" style={{ background: pct >= 80 ? 'var(--warning)' : 'var(--accent)', width: `${pct}%` }} />
                    </div>
                  </div>
                  <ul className="text-[13px] pl-4 flex flex-col gap-1 m-0 text-[var(--text-secondary)]">
                    <li>最多 {tableLimit} 桌</li>
                    <li>單一活動</li>
                    <li>基本排位功能</li>
                  </ul>
                </div>
                <div className="settings-divider-col flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
                      {tableLimit > 20 ? '更高方案' : '付費版'}
                    </span>
                  </div>
                  <ul className="text-[13px] pl-4 flex flex-col gap-1 m-0 text-[var(--text-secondary)] mb-4">
                    <li>最多 200 桌</li>
                    <li>更長有效期</li>
                    <li>多活動管理</li>
                  </ul>
                  <button
                    onClick={() => navigate('/pricing')}
                    className="w-full h-9 rounded-lg text-sm font-medium text-white bg-[var(--accent)]"
                  >
                    {tableLimit > 20 ? '查看更多方案' : '升級方案'}
                  </button>
                </div>
              </div>

              <div className="border-t border-[var(--border)] my-5" />

              {/* 資料管理 */}
              <h2 className="card-title">資料管理</h2>
              <p className="text-sm mb-3 text-[var(--text-secondary)]">匯出你的賓客名單、桌次安排等所有資料。</p>
              <button onClick={handleExport} disabled={exporting} className="btn-primary">{exporting ? '匯出中...' : '⬇ 匯出 JSON'}</button>

              <div className="border-t border-[var(--border)] my-5" />

              {/* 登出 */}
              <h2 className="card-title">登出</h2>
              <p className="text-sm mb-3 text-[var(--text-secondary)]">登出後可重新登入或使用其他帳號。</p>
              <button onClick={async () => { await signOut(); navigate('/login'); }} className="btn-primary">登出</button>

              <div className="border-t border-[var(--border)] my-5" />

              {/* 刪除帳號 */}
              <h2 className="card-title text-[var(--error)]">刪除帳號</h2>
              <p className="text-sm mb-3 text-[var(--text-secondary)]">刪除後你的所有資料將無法存取。此操作無法復原。</p>
              <button onClick={() => setShowDeleteDialog(true)} className="btn-danger">刪除我的帳號</button>
            </div>
          </div>
        </div>

        {/* Delete dialog */}
        {showDeleteDialog && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => { setShowDeleteDialog(false); setDeleteInput(''); }} />
            <div className="relative p-6 w-[400px] max-w-[calc(100vw-32px)] border border-[var(--border)] bg-[var(--bg-surface)] rounded-[var(--radius-lg,12px)] shadow-[0_20px_60px_rgba(0,0,0,0.15)]">
              <h3 className="text-base font-semibold mb-2 text-[var(--text-primary)] font-[family-name:var(--font-display)]">刪除帳號</h3>
              <p className="text-sm mb-4 text-[var(--text-secondary)]">此操作將永久移除你的帳號存取權限。你的所有賓客資料、桌次安排都將無法存取。</p>
              <label className="settings-label mb-1">請輸入「刪除」來確認</label>
              <input value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)} placeholder="刪除" className="settings-input" autoFocus />
              <div className="flex gap-2 justify-end mt-4">
                <button onClick={() => { setShowDeleteDialog(false); setDeleteInput(''); }} className="btn-cancel">取消</button>
                <button onClick={handleDelete} disabled={deleteInput !== '刪除' || deleting}
                  className={`btn-danger-filled ${deleteInput !== '刪除' || deleting ? 'opacity-50 !cursor-not-allowed' : ''}`}>
                  {deleting ? '刪除中...' : '確認刪除'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Small components ---

function LinkPill({ icon, label, linked, loading, canUnlink, onLink, onUnlink }: {
  icon: React.ReactNode; label: string; linked: boolean; loading: boolean
  canUnlink: boolean; onLink: () => void; onUnlink: () => void
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs border border-[var(--border)]">
      {icon}<span>{label}</span>
      {linked ? (
        <button onClick={onUnlink} disabled={!canUnlink || loading}
          className={`bg-transparent border-none text-xs font-medium cursor-pointer p-0 font-[family-name:var(--font-display)] ${!canUnlink ? 'opacity-50 !cursor-not-allowed' : ''}`}
          style={{ color: canUnlink ? 'var(--error)' : 'var(--text-muted)' }}>
          {loading ? '...' : '解除'}
        </button>
      ) : (
        <button onClick={onLink} className="bg-transparent border-none text-xs font-medium cursor-pointer p-0 text-[var(--accent)] font-[family-name:var(--font-display)]">綁定</button>
      )}
    </div>
  );
}

const GoogleIcon = () => <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>;
const LineIcon = () => <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#06C755" d="M24 10.304c0-5.369-5.383-9.738-12-9.738S0 4.935 0 10.304c0 4.814 4.27 8.846 10.035 9.608.391.084.922.258 1.057.592.121.303.079.778.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967C23.309 14.253 24 12.38 24 10.304"/></svg>;
const EmailIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>;
