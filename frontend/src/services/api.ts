import axios from 'axios'
import toast from 'react-hot-toast'
import { getErrorMessage } from '../utils/errorUtils'

// API base URL
const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

// Create axios instance
export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
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
          toast.error(getErrorMessage(error, 'Validation error. Please check your input.'))
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
            toast.error(getErrorMessage(error))
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
  getByAccountId: (accountId: string | number) => api.get(`/members/by-account/${accountId}`),
  create: (data: any) => api.post('/members', data),
  update: (id: string | number, data: any) => api.put(`/members/${id}`, data),
  search: (query: string) => api.get('/members', { params: { search: query } }),
  uploadPhoto: (id: string | number, formData: FormData) =>
    api.post(`/members/${id}/upload-photo`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadSignature: (id: string | number, formData: FormData) =>
    api.post(`/members/${id}/upload-signature`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
}
export const kycApi = {
  uploadDocument: (formData: FormData) =>
    api.post('/kyc/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
}

export const mobileMoneyApi = {
  getProviders: () => api.get('/mobile-money/providers'),
  collect: (params: any) => api.post('/mobile-money/collect', null, { params }),
  disburse: (params: any) => api.post('/mobile-money/disburse', null, { params }),
  getTransactions: (params?: any) => api.get('/mobile-money/transactions', { params }),
}

export const accountsApi = {
  getAll: (params?: any) => api.get('/accounts', { params }),
  getById: (id: string | number) => api.get(`/accounts/${id}`),
  create: (data: any) => api.post('/accounts', data),
  getBalance: (id: string | number) => api.get(`/accounts/${id}/balance`),
  getStatement: (id: string | number, params?: any) => api.get(`/accounts/${id}/statement`, { params }),
  getByNumber: (number: string) => api.get(`/accounts/by-number/${number}`),
}

export const transactionsApi = {
  getAll: (params?: any) => api.get('/transactions', { params }),
  deposit: (data: any) => api.post('/transactions/deposit', data),
  onboardPayment: (data: { member_id: number, shares_amount: number, fee_amount: number, payment_channel?: string, description?: string }) =>
    api.post('/transactions/onboard-payment', data),
  withdraw: (data: any) => api.post('/transactions/withdrawal', data),
  transfer: (data: any) => api.post('/transactions/transfer', data),
  approve: (data: any) => api.post('/transactions/approve', data),
  purchaseShares: (data: any) => api.post('/transactions/purchase-shares', data),
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
  getDossier: (id: number) => api.get(`/loans/applications/${id}/dossier`),
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
  getDailyCashFlow: (params?: any) => api.get('/reports/daily-cash-flow', { params, responseType: params?.format === 'pdf' || params?.format === 'excel' ? 'blob' : 'json' }),
  getBoardMetrics: () => api.get('/reports/board/metrics'),
  getSummaryPack: (params?: any) => api.get('/reports/summary-pack', { params }),
}

export const eodApi = {
  getStatus: (params?: any) => api.get('/eod/status', { params }),
  accrueInterest: (params?: any) => api.post('/eod/accrue', {}, { params }),
  finalize: (params?: any) => api.post('/eod/finalize', {}, { params }),
}

export const opsApi = {
  getOverrideRequests: (params?: any) => api.get('/transactions/overrides/pending', { params }),
  approveOverride: (id: number, data: { manager_pin: string }) => api.post(`/transactions/overrides/${id}/approve`, { override_id: id, ...data }),
  rejectOverride: (id: number, data: { manager_pin: string, comments?: string }) => api.post(`/transactions/overrides/${id}/reject`, { override_id: id, ...data }),
  getLiquidity: (branchId: number) => api.get(`/branches/${branchId}/stats/liquidity`),
  getAmlFlags: (params?: any) => api.get('/reports/audit-logs', { params: { ...params, category: 'AML' } }),
  getEodLockStatus: (params?: any) => api.get('/eod/status', { params }),
  vaultDropByManager: (data: any) => api.post('/branches/vault-drop', data),
  /** Backend endpoint: GET /api/v1/branches/ws/{branch_id} — no auth. */
  getOpsInboxWebSocketUrl: (branchId: number) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    // Add ngrok-skip-browser-warning=true as query parameter because WebSockets can't send headers
    return `${protocol}//${host}/api/v1/branches/ws/${branchId}?ngrok-skip-browser-warning=true`;
  },
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
  triggerPinReset: (id: string | number) => api.post(`/auth/users/${id}/trigger-pin-reset`),
}

export const authApi = {
  login: (data: any) => api.post('/auth/login', data),
  setupOnboarding: (data: any) => api.post('/auth/setup-onboarding', data),
  updatePin: (data: any) => api.post('/auth/update-pin', data),
  resetPinConfirm: (data: any) => api.post('/auth/reset-pin-confirm', data),
  changePassword: (data: any) => api.post('/auth/change-password', data),
}

export const queueApi = {
  issue: (data: { service_type: string, is_vip: boolean, branch_id: number }) => api.post('/queue/issue', data),
  callNext: (data: { service_type: string, counter_number: string }) => api.post('/queue/call-next', data),
  complete: (id: number) => api.post(`/queue/${id}/complete`),
  noShow: (id: number) => api.post(`/queue/${id}/no-show`),
  recall: (id: number) => api.post(`/queue/${id}/recall`),
  getStats: () => api.get('/queue/stats'),
  getWebSocketUrl: (branchId: number = 1) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    // Add ngrok-skip-browser-warning=true as query parameter because WebSockets can't send headers
    return `${protocol}//${host}/api/v1/branches/ws/${branchId}?ngrok-skip-browser-warning=true`;
  },
}

export const intercomApi = {
  getHistory: (userId: number, limit = 50) => api.get(`/intercom/history/${userId}?limit=${limit}`),
  send: (data: { content: string; receiver_id?: number | null; attached_entity_type?: string | null; attached_entity_id?: string | null }) => api.post(`/intercom/send?current_user_id=${JSON.parse(localStorage.getItem('camccul-auth') || '{}').state?.user?.id || 0}`, data),
  getWebSocketUrl: (userId: number) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    // Add ngrok-skip-browser-warning=true as query parameter because WebSockets can't send headers
    return `${protocol}//${host}/api/v1/intercom/ws/${userId}?ngrok-skip-browser-warning=true`;
  }
}

export const tellerApi = {
  verifyPin: (data: { pin: string }) => api.post('/teller/verify-pin', data),
  getBalance: () => api.get('/teller/balance'),
  vaultDrop: (data: { amount: number }) => api.post('/teller/vault-drop', data),
}
export const treasuryApi = {
  getAccounts: () => api.get('/treasury/accounts'),
  getPendingTransfers: () => api.get('/treasury/transfers/pending'),
  approveTransfer: (id: number, data: { approved: boolean, manager_pin: string }) => api.post(`/treasury/transfer/${id}/approve`, data),
  requestTransfer: (data: { amount: number, transfer_type: string, description?: string, source_treasury_id?: number | null, destination_treasury_id?: number | null, teller_id?: number | null }) => api.post('/treasury/transfer/request', data),
  vaultAdjustment: (data: { amount: number, description: string }) => api.post('/treasury/vault-adjustment', data),
  externalBankDeposit: (data: { amount: number, transfer_type: string, description?: string }) => api.post('/treasury/external-bank-deposit', data),
}
export const policiesApi = {
  getActive: () => api.get('/policies/active'),
  getProposals: () => api.get('/policies/proposals'),
  propose: (data: { policy_key: string; policy_value: string; change_reason: string; effective_date?: string }) =>
    api.post('/policies/propose', data),
  approve: (id: number, data: { reason?: string }) => api.post(`/policies/approve/${id}`, data),
  getHistory: (key: string) => api.get(`/policies/history/${key}`),
}
