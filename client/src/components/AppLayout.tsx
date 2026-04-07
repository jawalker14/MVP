import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, Users, Plus, FileText, Settings } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const { user } = useAuth()

  const initial = (user?.email ?? '?').charAt(0).toUpperCase()

  return (
    <div className="flex flex-col min-h-screen bg-primary">
      {/* ── Top bar — pt accounts for status bar on iOS standalone PWA ── */}
      <header
        className="fixed top-0 left-0 right-0 z-40 bg-primary border-b border-border flex items-center justify-between px-4"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center gap-2 h-14">
          <span className="w-8 h-8 bg-accent text-primary text-sm font-bold rounded-lg flex items-center justify-center leading-none">
            IK
          </span>
          <span className="text-text-primary font-bold text-lg tracking-tight">InvoiceKasi</span>
        </div>
        <div className="w-9 h-9 rounded-full bg-surface-raised flex items-center justify-center text-text-primary text-sm font-bold">
          {initial}
        </div>
      </header>

      {/* ── Main content — margin-top accounts for header + safe area ── */}
      <main
        className="flex-1 pb-24 overflow-y-auto"
        style={{ marginTop: 'calc(3.5rem + env(safe-area-inset-top))' }}
      >
        {children}
      </main>

      {/* ── Bottom navigation ───────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-end h-16 px-1">
          <NavItem
            to="/dashboard"
            icon={Home}
            label="Home"
            active={pathname === '/dashboard'}
          />
          <NavItem
            to="/clients"
            icon={Users}
            label="Clients"
            active={pathname.startsWith('/clients')}
          />

          {/* ── Gold FAB ── raised -12px above nav bar */}
          <div className="flex-1 flex justify-center">
            <Link
              to="/invoices/new"
              className="relative -top-3 w-14 h-14 bg-accent rounded-full flex items-center justify-center active:scale-95 transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              style={{ boxShadow: '0 4px 20px rgba(232,185,49,0.45)' }}
              aria-label="New invoice"
            >
              <Plus className="w-7 h-7 text-primary" strokeWidth={2.5} />
            </Link>
          </div>

          <NavItem
            to="/invoices"
            icon={FileText}
            label="Invoices"
            active={pathname.startsWith('/invoices')}
          />
          <NavItem
            to="/settings"
            icon={Settings}
            label="Settings"
            active={pathname === '/settings'}
          />
        </div>
      </nav>
    </div>
  )
}

function NavItem({
  to,
  icon: Icon,
  label,
  active,
}: {
  to: string
  icon: React.ElementType
  label: string
  active: boolean
}) {
  return (
    <Link
      to={to}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[48px] py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-lg ${
        active ? 'text-accent' : 'text-text-muted'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  )
}