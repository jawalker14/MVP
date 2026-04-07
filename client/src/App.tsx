import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import ProtectedLayout from './components/ProtectedLayout'
import ProtectedRoute from './components/ProtectedRoute'

// Auth / onboarding pages
import Login from './pages/Login'
import Verify from './pages/Verify'
import Onboarding from './pages/Onboarding'

// Protected app pages
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import ClientNew from './pages/ClientNew'
import ClientEdit from './pages/ClientEdit'
import Invoices from './pages/Invoices'
import InvoiceNew from './pages/InvoiceNew'
import InvoiceDetail from './pages/InvoiceDetail'
import InvoiceEdit from './pages/InvoiceEdit'
import Settings from './pages/Settings'

// Public pages (no auth)
import InvoicePublic from './pages/InvoicePublic'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Root — redirect handled by RootIndex */}
            <Route path="/" element={<RootIndex />} />

            {/* Public auth routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/auth/verify" element={<Verify />} />

            {/* Onboarding — protected but no AppLayout */}
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              }
            />

            {/* Public invoice view */}
            <Route path="/invoice/:id" element={<InvoicePublic />} />

            {/* ── Protected app pages (AppLayout + auth guard) ── */}
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/clients/new" element={<ClientNew />} />
              <Route path="/clients/:id/edit" element={<ClientEdit />} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/invoices/new" element={<InvoiceNew />} />
              <Route path="/invoices/:id" element={<InvoiceDetail />} />
              <Route path="/invoices/:id/edit" element={<InvoiceEdit />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

/** Waits for auth to resolve, then redirects to /dashboard or /login. */
function RootIndex() {
  const { accessToken, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-primary">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    )
  }

  return <Navigate to={accessToken ? '/dashboard' : '/login'} replace />
}
