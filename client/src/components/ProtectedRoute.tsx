import React from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

/** Wraps a single component/page — no AppLayout. */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { accessToken, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-primary">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    )
  }

  if (!accessToken) return <Navigate to="/login" replace />

  return <>{children}</>
}
