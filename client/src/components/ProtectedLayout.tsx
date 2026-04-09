import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import AppLayout from './AppLayout'

/** Layout route — wraps nested protected pages with AppLayout + auth check. */
export default function ProtectedLayout() {
  const { accessToken, user, loading } = useAuth()
  const { pathname } = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-primary">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    )
  }

  if (!accessToken) return <Navigate to="/login" replace />

  // Redirect to onboarding if the user hasn't set their business name yet.
  // Skip the check if we're already headed there (avoids redirect loops via ProtectedRoute).
  if (user && !user.businessName && pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}
