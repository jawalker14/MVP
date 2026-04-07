import React, { useState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import api from '../api/client'

export default function Login() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')

    try {
      await api.post('/api/auth/request-magic-link', { email })
      setSent(true)
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Brand mark */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-accent text-primary rounded-xl flex items-center justify-center font-bold text-xl mb-4 leading-none">
            IK
          </div>
          <h1 className="text-[28px] font-bold text-text-primary mb-2">InvoiceKasi</h1>
          <p className="text-text-secondary text-sm text-center leading-relaxed">
            Professional invoicing for every South African hustle
          </p>
        </div>

        {sent ? (
          /* ── Success state ── */
          <div className="flex flex-col items-center text-center gap-3">
            <Mail className="w-12 h-12 text-accent" />
            <p className="text-text-primary font-medium">
              Check your email! We sent you a login link.
            </p>
          </div>
        ) : (
          /* ── Form ── */
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              autoComplete="email"
              disabled={loading}
              required
              className="w-full h-12 px-4 rounded-xl border border-border bg-surface text-text-primary text-[16px] placeholder:text-text-muted focus:outline-none focus:border-accent disabled:opacity-50 transition-colors"
            />

            {error && <p className="text-danger text-sm mt-2">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email}
              className="mt-4 w-full h-12 rounded-xl bg-accent text-primary font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Magic Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
