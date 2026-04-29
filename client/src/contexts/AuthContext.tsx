import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { setAccessToken, setLogoutHandler } from '../api/client'
import { API_URL as BASE_URL } from '../api/config'

export interface User {
  id: string
  email: string
  businessName: string | null
  phone: string | null
  vatNumber: string | null
  logoUrl: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  province: string | null
  postalCode: string | null
  bankName: string | null
  bankAccountNumber: string | null
  bankBranchCode: string | null
  plan: string | null
  invoiceCountThisMonth: number | null
}

interface AuthContextValue {
  user: User | null
  accessToken: string | null
  loading: boolean
  login: (accessToken: string, refreshToken: string, user: User | null) => void
  logout: () => void
  updateUser: (user: User) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)


export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [accessToken, setTokenState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const logout = useCallback(() => {
    setTokenState(null)
    setUser(null)
    setAccessToken(null)
    localStorage.removeItem('refreshToken')
    navigate('/login', { replace: true })
  }, [navigate])

  // Use a ref so the interceptor always calls the latest logout without re-registering
  const logoutRef = useRef(logout)
  logoutRef.current = logout

  const login = useCallback(
    (token: string, refreshToken: string, userData: User | null) => {
      setTokenState(token)
      setAccessToken(token)
      localStorage.setItem('refreshToken', refreshToken)
      if (userData) {
        setUser(userData)
      }
    },
    [],
  )

  const updateUser = useCallback((userData: User) => {
    setUser(userData)
  }, [])

  // Register logout handler once; ref keeps it fresh
  useEffect(() => {
    setLogoutHandler(() => logoutRef.current())
  }, [])

  // Restore session on mount
  useEffect(() => {
    const restore = async () => {
      const stored = localStorage.getItem('refreshToken')
      if (!stored) {
        setLoading(false)
        return
      }

      try {
        const { data: refreshData } = await axios.post(
          `${BASE_URL}/api/auth/refresh`,
          { refreshToken: stored },
        )

        const newToken: string = refreshData.accessToken
        setTokenState(newToken)
        setAccessToken(newToken)

        if (refreshData.refreshToken) {
          localStorage.setItem('refreshToken', refreshData.refreshToken)
        }

        const { data: me } = await axios.get(`${BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${newToken}` },
        })

        setUser({
          id: me.id,
          email: me.email,
          businessName: me.businessName ?? null,
          phone: me.phone ?? null,
          vatNumber: me.vatNumber ?? null,
          logoUrl: me.logoUrl ?? null,
          addressLine1: me.addressLine1 ?? null,
          addressLine2: me.addressLine2 ?? null,
          city: me.city ?? null,
          province: me.province ?? null,
          postalCode: me.postalCode ?? null,
          bankName: me.bankName ?? null,
          bankAccountNumber: me.bankAccountNumber ?? null,
          bankBranchCode: me.bankBranchCode ?? null,
          plan: me.plan ?? null,
          invoiceCountThisMonth: me.invoiceCountThisMonth ?? 0,
        })
      } catch {
        localStorage.removeItem('refreshToken')
        setTokenState(null)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    restore()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
