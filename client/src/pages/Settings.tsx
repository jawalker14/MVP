import { useEffect, useRef, useState } from 'react'
import { Camera, LogOut } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import ConfirmModal from '../components/ConfirmModal'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import api from '../api/client'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const SA_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
]

const BANKS = [
  'Standard Bank',
  'FNB',
  'ABSA',
  'Nedbank',
  'Capitec',
  'TymeBank',
  'African Bank',
  'Discovery Bank',
  'Investec',
  'Other',
]

const FREE_INVOICE_LIMIT = 10
const FREE_CLIENT_LIMIT = 5

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
      {children}
    </p>
  )
}

function Field({
  label,
  helper,
  children,
}: {
  label: string
  helper?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      {children}
      {helper && <p className="text-xs text-text-muted">{helper}</p>}
    </div>
  )
}

const inputCls =
  'h-12 rounded-xl px-4 bg-surface text-text-primary text-base outline-none border border-transparent focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const selectCls =
  'h-12 rounded-xl px-4 bg-surface text-text-primary text-base outline-none border border-transparent focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent appearance-none'

function SaveButton({ loading }: { loading: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full h-12 rounded-xl bg-accent text-primary font-bold text-sm disabled:opacity-60 active:scale-95 transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {loading ? 'Saving…' : 'Save'}
    </button>
  )
}

function UsageBar({ count, limit }: { count: number; limit: number }) {
  const pct = Math.min((count / limit) * 100, 100)
  return (
    <div className="h-2 bg-surface-raised rounded-full overflow-hidden">
      <div
        className="h-full bg-accent rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function Settings() {
  const { user, logout, updateUser } = useAuth()
  const { showToast } = useToast()

  // ── Business details ──────────────────────────────────────────────────────
  const [biz, setBiz] = useState({
    business_name: user?.businessName ?? '',
    phone: user?.phone ?? '',
    vat_number: user?.vatNumber ?? '',
  })
  const [bizSaving, setBizSaving] = useState(false)

  // ── Address ───────────────────────────────────────────────────────────────
  const [addr, setAddr] = useState({
    address_line1: user?.addressLine1 ?? '',
    address_line2: user?.addressLine2 ?? '',
    city: user?.city ?? '',
    province: user?.province ?? '',
    postal_code: user?.postalCode ?? '',
  })
  const [addrSaving, setAddrSaving] = useState(false)

  // ── Bank details ──────────────────────────────────────────────────────────
  const [bank, setBank] = useState({
    bank_name: user?.bankName ?? '',
    bank_account_number: user?.bankAccountNumber ?? '',
    bank_branch_code: user?.bankBranchCode ?? '',
  })
  const [bankSaving, setBankSaving] = useState(false)

  // ── Logo ──────────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(
    user?.logoUrl ? `${API_URL}${user.logoUrl}` : null,
  )
  const [logoUploading, setLogoUploading] = useState(false)

  // ── Plan & Usage ──────────────────────────────────────────────────────────
  const [clientCount, setClientCount] = useState(0)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  // ── Account ───────────────────────────────────────────────────────────────
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  // Sync form fields when user changes (e.g. after first load)
  useEffect(() => {
    if (!user) return
    setBiz({
      business_name: user.businessName ?? '',
      phone: user.phone ?? '',
      vat_number: user.vatNumber ?? '',
    })
    setAddr({
      address_line1: user.addressLine1 ?? '',
      address_line2: user.addressLine2 ?? '',
      city: user.city ?? '',
      province: user.province ?? '',
      postal_code: user.postalCode ?? '',
    })
    setBank({
      bank_name: user.bankName ?? '',
      bank_account_number: user.bankAccountNumber ?? '',
      bank_branch_code: user.bankBranchCode ?? '',
    })
    if (user.logoUrl) setLogoPreview(`${API_URL}${user.logoUrl}`)
  }, [user])

  // Fetch client count for usage bar
  useEffect(() => {
    api
      .get<{ total_clients: number }>('/api/dashboard/summary')
      .then((r) => setClientCount(r.data.total_clients))
      .catch(() => {})
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function saveProfile(patch: Record<string, unknown>) {
    const { data } = await api.put('/api/auth/profile', patch)
    updateUser({
      id: data.id,
      email: data.email,
      businessName: data.businessName ?? null,
      phone: data.phone ?? null,
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
      plan: data.plan ?? null,
      invoiceCountThisMonth: data.invoiceCountThisMonth ?? null,
    })
  }

  async function handleBizSave(e: React.SyntheticEvent) {
    e.preventDefault()
    setBizSaving(true)
    try {
      await saveProfile({
        business_name: biz.business_name,
        phone: biz.phone,
        vat_number: biz.vat_number || null,
      })
      showToast('Settings saved')
    } catch {
      showToast('Failed to save', 'error')
    } finally {
      setBizSaving(false)
    }
  }

  async function handleAddrSave(e: React.SyntheticEvent) {
    e.preventDefault()
    setAddrSaving(true)
    try {
      await saveProfile({
        address_line1: addr.address_line1 || null,
        address_line2: addr.address_line2 || null,
        city: addr.city || null,
        province: addr.province || null,
        postal_code: addr.postal_code || null,
      })
      showToast('Settings saved')
    } catch {
      showToast('Failed to save', 'error')
    } finally {
      setAddrSaving(false)
    }
  }

  async function handleBankSave(e: React.SyntheticEvent) {
    e.preventDefault()
    setBankSaving(true)
    try {
      await saveProfile({
        bank_name: bank.bank_name || null,
        bank_account_number: bank.bank_account_number || null,
        bank_branch_code: bank.bank_branch_code || null,
      })
      showToast('Settings saved')
    } catch {
      showToast('Failed to save', 'error')
    } finally {
      setBankSaving(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      showToast('Image must be under 2MB', 'error')
      return
    }

    // Show preview immediately
    const reader = new FileReader()
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    // Upload
    setLogoUploading(true)
    const form = new FormData()
    form.append('logo', file)
    api
      .post<{ logo_url: string }>('/api/auth/logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(({ data }) => {
        updateUser({ ...user!, logoUrl: data.logo_url })
        setLogoPreview(`${API_URL}${data.logo_url}`)
        showToast('Logo uploaded')
      })
      .catch(() => showToast('Logo upload failed', 'error'))
      .finally(() => setLogoUploading(false))
  }

  const invoiceCount = user?.invoiceCountThisMonth ?? 0
  const isPremium = user?.plan === 'premium'

  return (
    <div className="pb-24">
      <PageHeader title="Settings" />

      <div className="px-4 flex flex-col gap-6">

        {/* ── Section 1: Business Details ─────────────────────────────────── */}
        <section>
          <SectionLabel>Business Details</SectionLabel>
          <form onSubmit={handleBizSave} className="flex flex-col gap-3">
            <Field label="Business Name">
              <input
                className={inputCls}
                value={biz.business_name}
                onChange={(e) => setBiz((p) => ({ ...p, business_name: e.target.value }))}
                placeholder="My Business"
                required
              />
            </Field>
            <Field label="Phone Number">
              <input
                className={inputCls}
                type="tel"
                value={biz.phone}
                onChange={(e) => setBiz((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+27 82 000 0000"
                required
              />
            </Field>
            <Field label="Email" helper="This is your login email">
              <input
                className={`${inputCls} opacity-50 cursor-not-allowed`}
                value={user?.email ?? ''}
                disabled
              />
            </Field>
            <Field label="VAT Number" helper="Add your VAT number to include VAT on invoices">
              <input
                className={inputCls}
                value={biz.vat_number}
                onChange={(e) => setBiz((p) => ({ ...p, vat_number: e.target.value }))}
                placeholder="4xxxxxxxxx (optional)"
              />
            </Field>
            <SaveButton loading={bizSaving} />
          </form>
        </section>

        {/* ── Section 2: Address ──────────────────────────────────────────── */}
        <section>
          <SectionLabel>Address</SectionLabel>
          <form onSubmit={handleAddrSave} className="flex flex-col gap-3">
            <Field label="Address Line 1">
              <input
                className={inputCls}
                value={addr.address_line1}
                onChange={(e) => setAddr((p) => ({ ...p, address_line1: e.target.value }))}
                placeholder="123 Main Street"
              />
            </Field>
            <Field label="Address Line 2">
              <input
                className={inputCls}
                value={addr.address_line2}
                onChange={(e) => setAddr((p) => ({ ...p, address_line2: e.target.value }))}
                placeholder="Unit / Suite (optional)"
              />
            </Field>
            <Field label="City">
              <input
                className={inputCls}
                value={addr.city}
                onChange={(e) => setAddr((p) => ({ ...p, city: e.target.value }))}
                placeholder="Johannesburg"
              />
            </Field>
            <Field label="Province">
              <select
                className={selectCls}
                value={addr.province}
                onChange={(e) => setAddr((p) => ({ ...p, province: e.target.value }))}
              >
                <option value="">Select province</option>
                {SA_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Postal Code">
              <input
                className={inputCls}
                value={addr.postal_code}
                inputMode="numeric"
                onChange={(e) => setAddr((p) => ({ ...p, postal_code: e.target.value }))}
                placeholder="2000"
              />
            </Field>
            <SaveButton loading={addrSaving} />
          </form>
        </section>

        {/* ── Section 3: Bank Details ─────────────────────────────────────── */}
        <section>
          <SectionLabel>Bank Details</SectionLabel>
          <form onSubmit={handleBankSave} className="flex flex-col gap-3">
            <Field label="Bank Name">
              <select
                className={selectCls}
                value={bank.bank_name}
                onChange={(e) => setBank((p) => ({ ...p, bank_name: e.target.value }))}
              >
                <option value="">Select bank</option>
                {BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Account Number">
              <input
                className={inputCls}
                value={bank.bank_account_number}
                inputMode="numeric"
                onChange={(e) =>
                  setBank((p) => ({ ...p, bank_account_number: e.target.value }))
                }
                placeholder="1234567890"
              />
            </Field>
            <Field
              label="Branch Code"
              helper="Most banks now use universal branch codes"
            >
              <input
                className={inputCls}
                value={bank.bank_branch_code}
                inputMode="numeric"
                onChange={(e) =>
                  setBank((p) => ({ ...p, bank_branch_code: e.target.value }))
                }
                placeholder="051001"
              />
            </Field>
            <SaveButton loading={bankSaving} />
          </form>
        </section>

        {/* ── Section 4: Logo ─────────────────────────────────────────────── */}
        <section>
          <SectionLabel>Logo</SectionLabel>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Business logo"
                  className="w-20 h-20 rounded-xl object-cover border border-border"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-surface-raised flex items-center justify-center border border-border">
                  <Camera className="w-7 h-7 text-text-muted" />
                </div>
              )}
              <div className="flex-1">
                <p className="text-xs text-text-muted mb-2">
                  PNG or JPEG, max 2MB
                </p>
                <button
                  type="button"
                  disabled={logoUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="h-12 min-w-[120px] px-4 rounded-xl bg-surface border border-border text-text-primary text-sm font-medium disabled:opacity-60 active:scale-95 transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {logoUploading ? 'Uploading…' : 'Upload Logo'}
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </section>

        {/* ── Section 5: Plan & Usage ──────────────────────────────────────── */}
        <section>
          <SectionLabel>Plan &amp; Usage</SectionLabel>
          <div className="bg-surface rounded-2xl p-4 flex flex-col gap-4">
            {/* Plan badge */}
            <div className="flex items-center justify-between">
              <span className="text-text-primary text-sm font-semibold">Current Plan</span>
              {isPremium ? (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-accent/20 text-accent">
                  Premium
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-surface-raised text-text-muted">
                  Free Plan
                </span>
              )}
            </div>

            {/* Invoice usage */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-text-secondary">
                <span>Invoices this month</span>
                <span>
                  {invoiceCount}/{FREE_INVOICE_LIMIT}
                </span>
              </div>
              <UsageBar count={invoiceCount} limit={FREE_INVOICE_LIMIT} />
            </div>

            {/* Client usage */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-text-secondary">
                <span>Clients</span>
                <span>
                  {clientCount}/{FREE_CLIENT_LIMIT}
                </span>
              </div>
              <UsageBar count={clientCount} limit={FREE_CLIENT_LIMIT} />
            </div>

            {!isPremium && (
              <button
                type="button"
                onClick={() => setShowUpgradeModal(true)}
                className="w-full h-12 rounded-xl bg-accent text-primary font-bold text-sm active:scale-95 transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Upgrade to Premium
              </button>
            )}
          </div>
        </section>

        {/* ── Section 6: Account ──────────────────────────────────────────── */}
        <section>
          <SectionLabel>Account</SectionLabel>
          <button
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full h-12 rounded-xl border border-danger text-danger font-medium text-sm active:scale-95 active:bg-danger/10 transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
          >
            <span className="flex items-center justify-center gap-2">
              <LogOut className="w-4 h-4" />
              Log Out
            </span>
          </button>
        </section>
      </div>

      {/* ── Logout confirm modal ─────────────────────────────────────────── */}
      {showLogoutConfirm && (
        <ConfirmModal
          title="Log out?"
          message="You'll need to use a magic link to sign back in."
          confirmLabel="Log Out"
          confirmVariant="danger"
          onConfirm={logout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}

      {/* ── Upgrade modal ────────────────────────────────────────────────── */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setShowUpgradeModal(false)}
          />
          <div className="relative bg-surface rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-text-primary font-bold text-lg mb-2">Coming Soon!</h3>
            <p className="text-text-secondary text-sm mb-6">
              Premium is on its way. Email us at{' '}
              <a
                href="mailto:hello@invoicekasi.co.za"
                className="text-accent underline"
              >
                hello@invoicekasi.co.za
              </a>{' '}
              for early access.
            </p>
            <button
              onClick={() => setShowUpgradeModal(false)}
              className="w-full h-12 rounded-xl bg-accent text-primary font-bold text-sm active:scale-95 transition-transform duration-150"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}