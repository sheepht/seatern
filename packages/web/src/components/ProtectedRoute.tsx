import { Navigate, Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'

function AppHeader() {
  const { user, signOut } = useAuthStore()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const displayName =
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    user?.email

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b bg-white">
      <nav className="flex items-center gap-4">
        <Link to="/dashboard" className="font-bold text-lg">Seatern</Link>
      </nav>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">{displayName}</span>
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          登出
        </button>
      </div>
    </header>
  )
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">載入中...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1">{children}</main>
    </div>
  )
}
