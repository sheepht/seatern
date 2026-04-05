import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { useSeatingStore } from '@/stores/seating'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuthStore()

  const tables = useSeatingStore((s) => s.tables)
  const tableLimit = user ? 20 : 10

  // Provider detection
  const provider =
    (user as any)?.app_metadata?.provider ??
    (user as any)?.user_metadata?.provider ??
    'email'
  const isEmailUser = provider === 'email'

  // Profile state
  const [name, setName] = useState(
    user?.user_metadata?.name || user?.user_metadata?.full_name || ''
  )
  const [savingName, setSavingName] = useState(false)
  const [nameMsg, setNameMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Password state
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Export state
  const [exporting, setExporting] = useState(false)

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Linking state
  const [unlinking, setUnlinking] = useState<string | null>(null)

  // Avatar
  const avatarUrl = user?.user_metadata?.avatar_url
  const initial = name ? name[0] : '?'

  // Identities — Google/Email 用 Supabase identities，LINE 用 user_metadata
  const identities = (user as any)?.identities ?? []
  const linkedGoogle = identities.find((i: any) => i.provider === 'google')
  const linkedEmail = identities.find((i: any) => i.provider === 'email')
  const linkedLine = !!(user as any)?.user_metadata?.line_user_id
  // 計算已綁定的登入方式數量（用於防止解除最後一個）
  const linkedCount = (linkedGoogle ? 1 : 0) + (linkedEmail ? 1 : 0) + (linkedLine ? 1 : 0)

  // --- Handlers ---

  const handleSaveName = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setNameMsg({ type: 'error', text: '名稱不可為空' })
      return
    }
    setSavingName(true)
    setNameMsg(null)
    try {
      await supabase.auth.updateUser({ data: { name: trimmed } })
      await api.patch('/users/me', { name: trimmed })
      setNameMsg({ type: 'success', text: '已儲存' })
      setTimeout(() => setNameMsg(null), 3000)
    } catch {
      setNameMsg({ type: 'error', text: '儲存失敗' })
    } finally {
      setSavingName(false)
    }
  }

  const handleChangePw = async () => {
    setPwError('')
    setPwMsg(null)
    if (newPw.length < 6) { setPwError('密碼至少 6 字元'); return }
    if (newPw !== confirmPw) { setPwError('確認密碼不一致'); return }
    if (newPw === currentPw) { setPwError('新密碼不能與舊密碼相同'); return }

    setSavingPw(true)
    try {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: user?.email ?? '',
        password: currentPw,
      })
      if (verifyErr) { setPwError('目前密碼錯誤'); setSavingPw(false); return }

      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw })
      if (updateErr) { setPwError(updateErr.message); setSavingPw(false); return }

      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      setPwMsg({ type: 'success', text: '密碼已更新' })
      setTimeout(() => setPwMsg(null), 3000)
    } catch {
      setPwError('更新失敗')
    } finally {
      setSavingPw(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await api.get('/users/me/export')
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'seatern-export.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // empty export or error
    } finally {
      setExporting(false)
    }
  }

  const handleLinkGoogle = async () => {
    await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/workspace/settings` },
    })
  }

  const handleLinkLine = async () => {
    try {
      const res = await api.get('/auth/line/link')
      window.location.href = res.data.url
    } catch {
      // ignore
    }
  }

  const handleUnlinkLine = async () => {
    setUnlinking('line')
    try {
      await api.post('/auth/line/unlink')
      // 重新取得 user 更新 metadata
      const { data } = await supabase.auth.getUser()
      if (data.user) {
        useAuthStore.setState({ user: data.user })
      }
    } catch {
      // ignore
    } finally {
      setUnlinking(null)
    }
  }

  const handleUnlinkGoogle = async (identity: any) => {
    setUnlinking('google')
    try {
      await supabase.auth.unlinkIdentity(identity)
      const { data } = await supabase.auth.getUser()
      if (data.user) {
        useAuthStore.setState({ user: data.user })
      }
    } catch {
      // ignore
    } finally {
      setUnlinking(null)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.delete('/users/me')
      await signOut()
      navigate('/')
    } catch {
      setDeleting(false)
    }
  }

  // Provider badge colors
  const providerBadge = {
    google: { bg: '#E8F0FE', color: '#4285F4', label: 'Google' },
    line: { bg: '#E6F9ED', color: '#06C755', label: 'LINE' },
    email: { bg: 'var(--accent-light)', color: 'var(--accent)', label: 'Email' },
  }[provider] ?? { bg: 'var(--accent-light)', color: 'var(--accent)', label: provider }

  return (
    <div style={{ flex: 1, background: 'var(--bg-primary)', overflow: 'auto' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 24px', width: '100%' }}>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* 左欄：個人資料+帳號安全（同卡片） + 帳號綁定 */}
        <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 個人資料 + 帳號安全 合併卡片 */}
          <div style={cardStyle}>
            <div className="settings-split-profile" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {/* 左半：個人資料 */}
              <div style={{ flex: 1, minWidth: 220 }}>
                <h2 style={cardTitleStyle}>個人資料</h2>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="avatar"
                      style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{
                      width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--accent)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-display)',
                    }}>
                      {initial}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>名字</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={inputStyle}
                    />
                    <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                      {user?.email}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span style={{
                        display: 'inline-block', fontSize: 12,
                        padding: '2px 8px', borderRadius: 999,
                        background: providerBadge.bg, color: providerBadge.color,
                        fontWeight: 500,
                      }}>
                        {providerBadge.label}
                      </span>
                    </div>
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button onClick={handleSaveName} disabled={savingName} style={primaryBtnStyle}>
                        {savingName ? '儲存中...' : '儲存變更'}
                      </button>
                      {nameMsg && (
                        <span style={{ fontSize: 13, color: nameMsg.type === 'success' ? 'var(--success)' : 'var(--error)' }}>
                          {nameMsg.text}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 右半：帳號安全 (email users only) */}
              {isEmailUser && (
                <div className="settings-divider-col" style={{ flex: 1, minWidth: 220 }}>
                  <h2 style={cardTitleStyle}>帳號安全</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>目前密碼</label>
                      <input
                        type="password"
                        value={currentPw}
                        onChange={(e) => setCurrentPw(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>新密碼</label>
                      <input
                        type="password"
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>確認密碼</label>
                      <input
                        type="password"
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    {pwError && <div style={{ fontSize: 13, color: 'var(--error)' }}>{pwError}</div>}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button onClick={handleChangePw} disabled={savingPw} style={primaryBtnStyle}>
                        {savingPw ? '更新中...' : '更新密碼'}
                      </button>
                      {pwMsg && (
                        <span style={{ fontSize: 13, color: pwMsg.type === 'success' ? 'var(--success)' : 'var(--error)' }}>
                          {pwMsg.text}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 帳號綁定 */}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 20, paddingTop: 20 }}>
              <h2 style={cardTitleStyle}>帳號綁定</h2>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {/* Google */}
                <div style={linkItemStyle}>
                  <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  <span style={{ fontSize: 13 }}>Google</span>
                  {linkedGoogle ? (
                    <button
                      onClick={() => handleUnlinkGoogle(linkedGoogle)}
                      disabled={linkedCount <= 1 || unlinking === 'google'}
                      style={{ ...smallBtnStyle, color: linkedCount <= 1 ? 'var(--text-muted)' : 'var(--error)', opacity: linkedCount <= 1 ? 0.5 : 1 }}
                      title={linkedCount <= 1 ? '至少需要保留一個登入方式' : ''}
                    >
                      {unlinking === 'google' ? '...' : '解除'}
                    </button>
                  ) : (
                    <button onClick={handleLinkGoogle} style={{ ...smallBtnStyle, color: 'var(--accent)' }}>綁定</button>
                  )}
                </div>

                {/* LINE */}
                <div style={linkItemStyle}>
                  <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#06C755" d="M24 10.304c0-5.369-5.383-9.738-12-9.738S0 4.935 0 10.304c0 4.814 4.27 8.846 10.035 9.608.391.084.922.258 1.057.592.121.303.079.778.039 1.085l-.171 1.027c-.053.303-.242 1.186 1.039.647 1.281-.54 6.911-4.069 9.428-6.967C23.309 14.253 24 12.38 24 10.304"/></svg>
                  <span style={{ fontSize: 13 }}>LINE</span>
                  {linkedLine ? (
                    <button
                      onClick={handleUnlinkLine}
                      disabled={linkedCount <= 1 || unlinking === 'line'}
                      style={{ ...smallBtnStyle, color: linkedCount <= 1 ? 'var(--text-muted)' : 'var(--error)', opacity: linkedCount <= 1 ? 0.5 : 1 }}
                      title={linkedCount <= 1 ? '至少需要保留一個登入方式' : ''}
                    >
                      {unlinking === 'line' ? '...' : '解除'}
                    </button>
                  ) : (
                    <button onClick={handleLinkLine} style={{ ...smallBtnStyle, color: 'var(--accent)' }}>綁定</button>
                  )}
                </div>

                {/* Email */}
                <div style={linkItemStyle}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  <span style={{ fontSize: 13 }}>Email</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{linkedEmail ? '已綁定' : '未綁定'}</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* 右欄：使用方案 + 資料管理 + 危險區域 */}
        <div style={{ flex: 1, minWidth: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 使用方案 + 資料管理 + 刪除帳號 */}
          <div style={cardStyle}>
            <h2 style={cardTitleStyle}>使用方案</h2>
            <div className="settings-split-plan" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {/* 目前方案 */}
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{
                    fontSize: 18, fontWeight: 700, color: 'var(--accent)',
                    fontFamily: 'var(--font-display)',
                  }}>
                    免費版
                  </span>
                  <span style={{
                    fontSize: 11, padding: '2px 6px', borderRadius: 999,
                    background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600,
                  }}>
                    目前方案
                  </span>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    <span>桌數用量</span>
                    <span style={{ fontFamily: 'var(--font-data)', fontWeight: 500 }}>{tables.length} / {tableLimit}</span>
                  </div>
                  <div style={{
                    height: 6, borderRadius: 3,
                    background: 'var(--border)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      background: tables.length / tableLimit >= 0.8 ? 'var(--warning)' : 'var(--accent)',
                      width: `${Math.min(100, (tables.length / tableLimit) * 100)}%`,
                      transition: 'width 300ms',
                    }} />
                  </div>
                </div>
                <ul style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <li>最多 {tableLimit} 桌</li>
                  <li>單一活動</li>
                  <li>基本排位功能</li>
                </ul>
              </div>

              {/* 升級方案 */}
              <div className="settings-divider-col" style={{ flex: 1, minWidth: 180 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{
                    fontSize: 18, fontWeight: 700, color: 'var(--text-primary)',
                    fontFamily: 'var(--font-display)',
                  }}>
                    專業版
                  </span>
                  <span style={{
                    fontSize: 11, padding: '2px 6px', borderRadius: 999,
                    background: 'var(--bg-primary)', color: 'var(--text-muted)', fontWeight: 600,
                  }}>
                    即將推出
                  </span>
                </div>
                <ul style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <li>最多 50+ 桌</li>
                  <li>多活動管理</li>
                  <li>匯出 PDF 座位表</li>
                  <li>優先客服支援</li>
                </ul>
                <button
                  disabled
                  style={{
                    ...primaryBtnStyle,
                    background: 'var(--border)',
                    color: 'var(--text-muted)',
                    cursor: 'not-allowed',
                  }}
                >
                  敬請期待
                </button>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0' }} />

            <h2 style={cardTitleStyle}>資料管理</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
              匯出你的賓客名單、桌次安排等所有資料。
            </p>
            <button onClick={handleExport} disabled={exporting} style={primaryBtnStyle}>
              {exporting ? '匯出中...' : '⬇ 匯出 JSON'}
            </button>

            <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0' }} />

            <h2 style={{ ...cardTitleStyle, color: 'var(--error)' }}>刪除帳號</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
              刪除後你的所有資料將無法存取。此操作無法復原。
            </p>
            <button onClick={() => setShowDeleteDialog(true)} style={dangerBtnStyle}>
              刪除我的帳號
            </button>
          </div>

        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
            onClick={() => { setShowDeleteDialog(false); setDeleteInput('') }}
          />
          <div style={{
            position: 'relative', background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg, 12px)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            padding: 24, width: 400, maxWidth: 'calc(100vw - 32px)',
            border: '1px solid var(--border)',
          }}>
            <h3 style={{
              fontSize: 16, fontWeight: 600, color: 'var(--text-primary)',
              marginBottom: 8, fontFamily: 'var(--font-display)',
            }}>
              刪除帳號
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
              此操作將永久移除你的帳號存取權限。你的所有賓客資料、桌次安排都將無法存取。
            </p>
            <label style={{ ...labelStyle, marginBottom: 4 }}>
              請輸入「刪除」來確認
            </label>
            <input
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder="刪除"
              style={inputStyle}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                onClick={() => { setShowDeleteDialog(false); setDeleteInput('') }}
                style={cancelBtnStyle}
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteInput !== '刪除' || deleting}
                style={{
                  ...dangerFilledBtnStyle,
                  opacity: deleteInput !== '刪除' || deleting ? 0.5 : 1,
                  cursor: deleteInput !== '刪除' || deleting ? 'not-allowed' : 'pointer',
                }}
              >
                {deleting ? '刪除中...' : '確認刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

// --- Shared styles ---

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg, 12px)',
  padding: 24,
}

const cardTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-display)',
  marginBottom: 16,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 4,
  fontFamily: 'var(--font-display)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm, 4px)',
  padding: '8px 12px',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
  color: 'var(--text-primary)',
  background: 'var(--bg-surface)',
  outline: 'none',
  boxSizing: 'border-box',
}

const primaryBtnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-sm, 4px)',
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 500,
  fontFamily: 'var(--font-display)',
  cursor: 'pointer',
}

const dangerBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--error)',
  border: '1px solid var(--error)',
  borderRadius: 'var(--radius-sm, 4px)',
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 500,
  fontFamily: 'var(--font-display)',
  cursor: 'pointer',
}

const dangerFilledBtnStyle: React.CSSProperties = {
  background: 'var(--error)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-sm, 4px)',
  padding: '8px 16px',
  fontSize: 14,
  fontWeight: 500,
  fontFamily: 'var(--font-display)',
}

const cancelBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm, 4px)',
  padding: '8px 16px',
  fontSize: 14,
  fontFamily: 'var(--font-display)',
  cursor: 'pointer',
}

const linkItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  borderRadius: 'var(--radius-sm, 4px)',
  border: '1px solid var(--border)',
  fontSize: 13,
  color: 'var(--text-primary)',
}

const smallBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'var(--font-display)',
  cursor: 'pointer',
  padding: '4px 0',
}
