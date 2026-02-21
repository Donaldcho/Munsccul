// Currency formatter for FCFA (XAF)
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-CM', {
    style: 'currency',
    currency: 'XAF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// Date formatter
export const formatDate = (date: string | Date): string => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-CM', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// DateTime formatter
export const formatDateTime = (date: string | Date): string => {
  if (!date) return '-'
  return new Date(date).toLocaleString('en-CM', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Phone number formatter for Cameroon
export const formatPhone = (phone: string): string => {
  if (!phone) return '-'
  // Format: +237 6XX XXX XXX
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 9) {
    return `+237 ${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`
  }
  return phone
}

// Account number formatter
export const formatAccountNumber = (accountNumber: string): string => {
  if (!accountNumber) return '-'
  // Format: ACC-YYYYMMDD-XXXXX
  return accountNumber
}

// Member ID formatter
export const formatMemberId = (memberId: string): string => {
  if (!memberId) return '-'
  return memberId
}

// Transaction reference formatter
export const formatTransactionRef = (ref: string): string => {
  if (!ref) return '-'
  return ref
}

// Status badge color mapper
export const getStatusColor = (status: string): string => {
  const statusMap: Record<string, string> = {
    'active': 'badge-success',
    'pending': 'badge-warning',
    'approved': 'badge-info',
    'rejected': 'badge-danger',
    'closed': 'badge-danger',
    'delinquent': 'badge-danger',
    'disbursed': 'badge-success',
    'synced': 'badge-success',
    'failed': 'badge-danger',
  }
  return statusMap[status.toLowerCase()] || 'badge-info'
}

// Role display name mapper
export const getRoleDisplayName = (role: string): string => {
  const roleMap: Record<string, string> = {
    'teller': 'Teller',
    'branch_manager': 'Branch Manager',
    'credit_officer': 'Credit Officer',
    'system_admin': 'System Administrator',
    'auditor': 'Auditor',
  }
  return roleMap[role] || role
}

// Truncate text
export const truncate = (text: string, length: number): string => {
  if (!text) return ''
  if (text.length <= length) return text
  return text.slice(0, length) + '...'
}