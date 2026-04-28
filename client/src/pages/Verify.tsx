import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/client'
import type { User } from '../contexts/AuthContext'

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
      .post('/api/auth/verify-magic-link', { token, email })
      .then(({ data }) => {
        const user: User | null = data.isNewUser
          ? null
          : {
              id: data.user.id,
              email: data.user.email,
              businessName: data.user.businessName ?? null,
              phone: data.user.phone ?? null,
              plan: data.user.plan ?? null,
              vatNumber: data.user.vatNumber ?? null,
              logoUrl: data.user.logoUrl ?? null,
              addressLine1: data.user.addressLine1 ?? null,
              addressLine2: data.user.addressLine2 ?? null,
              city: data.user.city ?? null,
              province: data.user.province ?? null,
              postalCode: data.user.postalCode ?? null,
              bankName: data.user.bankName ?? null,
              bankAccountNumber: data.user.bankAccountNumber ?? null,
              bankBranchCode: data.user.bankBranchCode ?? null,
              invoiceCountThisMonth: data.user.invoiceCountThisMonth ?? null,
            }

        login(data.accessToken, data.refreshToken, user)

        if (data.isNewUser) {
          navigate('/onboarding', { replace: true })
        } else {
          navigate('/dashboard', { replace: true })
        }
      })
      .catch((err: unknown) => {
        const msg =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
            : undefined
        setError(msg ?? 'This link has expired or is invalid.')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
