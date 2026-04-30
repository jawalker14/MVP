import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import api, { extractApiError } from '../api/client'
import type { User } from '../contexts/AuthContext'

export default function Onboarding() {
  const navigate = useNavigate()
  const { updateUser } = useAuth()
  const { showToast } = useToast()
  const [businessName, setBusinessName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!businessName || !phone) return
    setLoading(true)

    try {
      // Server expects snake_case: business_name
      const { data } = await api.post('/api/auth/complete-onboarding', {
        business_name: businessName,
        phone,
      })

      const user: User = {
        id: data.id,
        email: data.email,
        businessName: data.businessName ?? null,
        phone: data.phone ?? null,
        plan: data.plan ?? null,
        vatNumber: data.vatNumber ?? null,
        logoUrl: data.logoUrl ?? null,
        addressLine1: data.addressLine1 ?? null,
        addressLine2: data.addressLine2 ?? null,
        city: data.city ?? null,
        province: data.province ?? null,
        postalCode: data.postalCode ?? null,
        bankName: data.bankName ?? null,
        bankAccountNumber: data.bankAccountNumber ?? null,
        bankBranchCode: data.bankBranchCode ?? null,
        invoiceCountThisMonth: data.invoiceCountThisMonth ?? null,
      }

      updateUser(user)
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      showToast(extractApiError(err).error, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="bg-surface rounded-2xl p-6">
          <h1 className="text-text-primary font-bold text-2xl mb-1">
            Let's set up your business
          </h1>
          <p className="text-text-secondary text-sm mb-6">
            Just a couple of details to get you started.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-text-secondary text-sm font-medium block mb-1.5">
                Business Name
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                autoComplete="organization"
                placeholder="e.g. Thandi's Catering"
                className="w-full h-12 px-4 rounded-xl border border-border bg-primary text-text-primary text-[16px] placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            <div>
              <label className="text-text-secondary text-sm font-medium block mb-1.5">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                autoComplete="tel"
                placeholder="+27 XX XXX XXXX"
                className="w-full h-12 px-4 rounded-xl border border-border bg-primary text-text-primary text-[16px] placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !businessName || !phone}
              className="mt-2 w-full h-12 rounded-xl bg-accent text-primary font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Get Started'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
