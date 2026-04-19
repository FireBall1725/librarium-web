import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

interface Props {
  requireAdmin?: boolean
}

export default function ProtectedRoute({ requireAdmin = false }: Props) {
  const { user, isLoading, initialized } = useAuth()

  if (isLoading || initialized === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <span className="text-gray-500">Loading…</span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to={initialized ? '/login' : '/setup'} replace />
  }

  if (requireAdmin && !user.is_instance_admin) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
