import axios from 'axios'
import toast from 'react-hot-toast'

// API base URL
const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

// Create axios instance
export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds timeout for slow connections
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add timestamp to prevent caching
    if (config.method === 'get') {
      config.params = { ...config.params, _t: Date.now() }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    // Handle specific error cases
    if (error.response) {
      const { status, data } = error.response

      switch (status) {
        case 401:
          // Unauthorized - clear auth and redirect to login
          toast.error('Session expired. Please login again.')
          localStorage.removeItem('camccul-auth')
          window.location.href = '/login'
          break

        case 403:
          toast.error('You do not have permission to perform this action.')
          break

        case 404:
          toast.error(data?.detail || 'Resource not found.')
          break

        case 422:
          const detail = data?.detail
          let message = 'Validation error. Please check your input.'
          if (typeof detail === 'string') {
            message = detail
          } else if (Array.isArray(detail)) {
            message = detail.map((err: any) => err.msg).join(', ')
          }
          toast.error(message)
          break

        case 500:
          toast.error('Server error. Please try again later.')
          break

        default:
          // Check if this is a structured COBAC constraint violation
          const errorDetail = data?.detail
          if (errorDetail && typeof errorDetail === 'object' && errorDetail.cobac_code) {
            // COBAC regulatory constraint violation — show formatted message
            const cobac = errorDetail
            toast.error(
              `⚠️ ${cobac.title}\n\n${cobac.message}\n\n💡 ${cobac.suggestion}`,
              {
                duration: 8000,
                style: {
                  maxWidth: '480px',
                  padding: '16px',
                  borderLeft: '4px solid #dc2626',
                  backgroundColor: '#fef2f2',
                  color: '#1f2937',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  whiteSpace: 'pre-line',
                  zIndex: 9999,
                },
              }
            )
          } else {
            // Standard error message
            toast.error(
              typeof errorDetail === 'string' ? errorDetail : 'An error occurred. Please try again.'
            )
          }
      }
    } else if (error.request) {
      // Network error
      toast.error('Network error. Please check your connection.')
    }

    return Promise.reject(error)
  }
)

// API helper functions
export const membersApi = {
  getAll: (params?: any) => api.get('/members', { params }),
  getById: (id: string | number) => api.get(`/members/${id}`),
  create: (data: any) => api.post('/members', data),
  update: (id: string | number, data: any) => api.put(`/members/${id}`, data),
  search: (query: string) => api.get('/members', { params: { search: query } }),
  uploadPhoto: (id: string | number, formData: FormData) =>
    api.post(`/members/${id}/upload-photo`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadSignature: (id: string | number, formData: FormData) =>
    api.post(`/members/${id}/upload-signature`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
}

export const accountsApi = {
  getAll: (params?: any) => api.get('/accounts', { params }),
  getById: (id: string | number) => api.get(`/accounts/${id}`),
  create: (data: any) => api.post('/accounts', data),
  getBalance: (id: string | number) => api.get(`/accounts/${id}/balance`),
  getStatement: (id: string | number, params?: any) => api.get(`/accounts/${id}/statement`, { params }),
}

export const transactionsApi = {
  getAll: (params?: any) => api.get('/transactions', { params }),
  deposit: (data: any) => api.post('/transactions/deposit', data),
  withdraw: (data: any) => api.post('/transactions/withdrawal', data),
  transfer: (data: any) => api.post('/transactions/transfer', data),
  approve: (data: any) => api.post('/transactions/approve', data),
  getDailyCashPosition: (params?: any) => api.get('/transactions/stats/daily-cash-position', { params }),
}

export const loansApi = {
  getProducts: () => api.get('/loans/products'),
  getAll: (params?: any) => api.get('/loans/applications', { params }),
  getById: (id: string | number) => api.get(`/loans/applications/${id}`),
  apply: (data: any) => api.post('/loans/applications', data),
  submit: (id: number) => api.post(`/loans/applications/${id}/submit`),
  getApplication: (id: number) => api.get(`/loans/applications/${id}`),
  approve: (id: number, data: { approved: boolean, reason?: string }) =>
    api.post(`/loans/applications/${id}/approve`, data),
  returnApplication: (id: number, reason: string) => api.post(`/loans/applications/${id}/return`, { approved: false, reason }),
  rejectApplication: (id: number, reason: string) => api.post(`/loans/applications/${id}/reject`, { reason }),
  disburse: (id: number, sourceAccountId: number) => api.post(`/loans/applications/${id}/disburse`, { source_account_id: sourceAccountId }),
  repay: (data: any) => api.post('/loans/repayments', data),
  createProduct: (data: any) => api.post('/loans/products', data),
  deactivateProduct: (id: string | number) => api.put(`/loans/products/${id}/deactivate`, {}),
  getStats: () => api.get('/loans/stats/portfolio'),
  checkEligibility: (memberId: number) => api.get(`/loans/eligibility/${memberId}`),
}

export const reportsApi = {
  getDashboard: () => api.get('/reports/dashboard'),
  getAuditLogs: (params?: any) => api.get('/reports/audit-logs', { params }),
  getCobacLiquidity: (period: string) => api.get('/reports/cobac/liquidity', { params: { report_period: period } }),
  getDailyCashPosition: (params?: any) => api.get('/reports/daily-cash-position', { params }),
  getTrialBalance: (params?: any) => api.get('/reports/trial-balance', { params, responseType: params?.format === 'pdf' || params?.format === 'excel' ? 'blob' : 'json' }),
  getBalanceSheet: (params?: any) => api.get('/reports/balance-sheet', { params, responseType: params?.format === 'pdf' || params?.format === 'excel' ? 'blob' : 'json' }),
  getIncomeStatement: (params?: any) => api.get('/reports/income-statement', { params, responseType: params?.format === 'pdf' || params?.format === 'excel' ? 'blob' : 'json' }),
  getParReport: (params?: any) => api.get('/reports/par', { params, responseType: params?.format === 'pdf' || params?.format === 'excel' ? 'blob' : 'json' }),
}

export const eodApi = {
  getStatus: (params?: any) => api.get('/eod/status', { params }),
  start: (data?: any) => api.post('/eod/start', data),
}

export const branchesApi = {
  getAll: () => api.get('/branches'),
  getById: (id: string | number) => api.get(`/branches/${id}`),
  create: (data: any) => api.post('/branches', data),
  update: (id: string | number, data: any) => api.put(`/branches/${id}`, data),
  getStats: (id: string | number) => api.get(`/branches/${id}/stats`),
}

export const usersApi = {
  getAll: () => api.get('/auth/users'),
  getById: (id: string | number) => api.get(`/auth/users/${id}`),
  create: (data: any) => api.post('/auth/users', data),
  update: (id: string | number, data: any) => api.put(`/auth/users/${id}`, data),
  approve: (id: string | number, data: any) => api.put(`/auth/users/${id}/approve`, data),
}

export const queueApi = {
  issue: (data: { service_type: string, is_vip: boolean, branch_id: number }) => api.post('/queue/issue', data),
  callNext: (data: { service_type: string, counter_number: string }) => api.post('/queue/call-next', data),
  complete: (id: number) => api.post(`/queue/${id}/complete`),
  noShow: (id: number) => api.post(`/queue/${id}/no-show`),
  recall: (id: number) => api.post(`/queue/${id}/recall`),
  getStats: () => api.get('/queue/stats'),
  getWebSocketUrl: () => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const path = "/ws/display";
    return protocol + "//" + host + path;
  },
}
