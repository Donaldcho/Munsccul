import { create } from 'zustand'
import { api } from '../services/api'

interface User {
    id: number
    username: string
    full_name: string
    role: string
}

interface AuthState {
    user: User | null
    isAuthenticated: boolean
    isLoading: boolean
    error: string | null
    login: (username: string, password: string) => Promise<void>
    logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,

    login: async (username, password) => {
        set({ isLoading: true, error: null })
        try {
            const response = await api.post('/auth/login', { username, password })
            const { access_token, user } = response.data

            // Set token in API headers for future requests
            api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`

            set({
                user,
                isAuthenticated: true,
                isLoading: false,
                error: null
            })
        } catch (error: any) {
            set({
                isLoading: false,
                error: error.response?.data?.detail || 'Login failed'
            })
            throw error
        }
    },

    logout: () => {
        delete api.defaults.headers.common['Authorization']
        set({ user: null, isAuthenticated: false })
    }
}))
