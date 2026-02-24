import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../services/api'

export interface User {
  id: number
  username: string
  email: string | null
  full_name: string
  role: 'TELLER' | 'BRANCH_MANAGER' | 'CREDIT_OFFICER' | 'SYSTEM_ADMIN' | 'AUDITOR' | 'OPS_MANAGER' | 'OPS_DIRECTOR' | 'BOARD_MEMBER'
  branch_id: number | null
  is_active: boolean
  is_first_login: boolean
  teller_cash_limit?: number
  teller_gl_account_id?: number
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  clearError: () => void
  hasRole: (roles: string[]) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null })

        try {
          const response = await api.post('/auth/login', { username, password })
          const { access_token, user } = response.data

          // Set token in API headers
          api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`

          set({
            user,
            token: access_token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          })
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.detail || 'Login failed. Please check your credentials.'
          })
          throw error
        }
      },

      logout: () => {
        // Clear token from API headers
        delete api.defaults.headers.common['Authorization']

        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null
        })
      },

      clearError: () => {
        set({ error: null })
      },

      hasRole: (roles: string[]) => {
        const { user } = get()
        if (!user) return false
        return roles.includes(user.role)
      }
    }),
    {
      name: 'camccul-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)

// Initialize token from storage on app load
const token = useAuthStore.getState().token
if (token) {
  api.defaults.headers.common['Authorization'] = `Bearer ${token}`
}