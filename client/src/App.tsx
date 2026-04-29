import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import ProtectedLayout from './components/ProtectedLayout'
import ProtectedRoute from './components/ProtectedRoute'

// Route-level code splitting — each page loads only when navigated to
const Login = lazy(() => import('./pages/Login'))
const Verify = lazy(() => import('./pages/Verify'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Clients = lazy(() => import('./pages/Clients'))
const ClientNew = lazy(() => import('./pages/ClientNew'))
const ClientEdit = lazy(() => import('./pages/ClientEdit'))
const Invoices = lazy(() => import('./pages/Invoices'))
const InvoiceNew = lazy(() => import('./pages/InvoiceNew'))
const InvoiceDetail = lazy(() => import('./pages/InvoiceDetail'))
const InvoiceEdit = lazy(() => import('./pages/InvoiceEdit'))
const InvoicePublic = lazy(() => import('./pages/InvoicePublic'))
const Settings = lazy(() => import('./pages/Settings'))

function FullscreenSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-primary">
      <Loader2 className="w-8 h-8 text-accent animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<FullscreenSpinner />}>
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
          </Suspense>
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
