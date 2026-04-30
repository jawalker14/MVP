import React, { useState, useEffect } from 'react'
import { Loader2, Mail } from 'lucide-react'
import api, { extractApiError } from '../api/client'

export default function Login() {
  const apiUrl = import.meta.env.VITE_API_URL
  // In development, show a warning if the API URL looks like localhost in a non-local context
  // This is just a dev helper — remove before final launch

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [devLink, setDevLink] = useState<string | null>(null)
  const [emailEnabled, setEmailEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    api.get('/api/auth/config').then((res) => {
      setEmailEnabled(res.data.emailEnabled)
    }).catch(() => {
      // If config fetch fails, don't block login — assume email is enabled
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')

    try {
      const res = await api.post('/api/auth/request-magic-link', { email })
      if (import.meta.env.DEV && res.data?.dev_link) {
        setDevLink(res.data.dev_link)
      }
      setSent(true)
      // Prefetch the most likely next chunk while the user checks their email
      import('./Dashboard')
      import('./Onboarding')
    } catch (err: unknown) {
      setError(extractApiError(err).error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center px-6">
      {!apiUrl && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-400 text-yellow-900 text-xs font-medium text-center py-2 px-4 z-50">
          Warning: VITE_API_URL is not set — requests will fall back to localhost:3001. Set this in your Vercel environment variables.
        </div>
      )}
      {emailEnabled === false && (
        <div className="fixed top-0 left-0 right-0 bg-orange-500 text-white text-xs font-medium text-center py-2 px-4 z-50">
          ⚠️ Email delivery is not configured on this server. Contact the admin.
        </div>
      )}
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
            {import.meta.env.DEV && devLink && (
              <div className="mt-4 p-4 bg-surface rounded-xl border border-accent/30 text-left w-full">
                <p className="text-text-muted text-xs mb-2">Dev mode — click to verify:</p>
                <a href={devLink} className="text-accent text-sm break-all underline">{devLink}</a>
              </div>
            )}
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
