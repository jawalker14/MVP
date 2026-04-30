import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api, { extractApiError } from '../api/client'
import type { AuthResponse, UserResponse } from '@invoicekasi/shared'

export default function Verify() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const [error, setError] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    const email = searchParams.get('email')

    if (!token || !email) {
      setError('Invalid link. Please request a new one.')
      return
    }

    window.history.replaceState({}, '', '/auth/verify')

    api
      .post<AuthResponse>('/api/auth/verify-magic-link', { token, email })
      .then(({ data }) => {
        const user: UserResponse | null = data.isNewUser ? null : (data.user ?? null)

        login(data.accessToken, data.refreshToken, user)

        if (data.isNewUser) {
          import('./Onboarding')
          navigate('/onboarding', { replace: true })
        } else {
          import('./Dashboard')
          navigate('/dashboard', { replace: true })
        }
      })
      .catch((err: unknown) => {
        setError(extractApiError(err).error)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount; token consumed immediately and URL cleared after first parse

  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center px-6 text-center">
      {error ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-danger font-medium">{error}</p>
          <Link to="/login" className="text-accent text-sm font-medium underline">
            Try again
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
          <p className="text-text-secondary">Verifying your login...</p>
        </div>
      )}
    </div>
  )
}
