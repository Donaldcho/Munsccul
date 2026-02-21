import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  PlusIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  XCircleIcon,
  ShieldExclamationIcon
} from '@heroicons/react/24/outline'
import { loansApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { formatCurrency, formatDate } from '../utils/formatters'
import toast from 'react-hot-toast'

interface Loan {
  id: number
  loan_number: string
  principal_amount: number
  amount_outstanding: number
  status: string
  application_date: string
  member_id: number
}

export default function Loans() {
  const navigate = useNavigate()
  const [loans, setLoans] = useState<Loan[]>([])
  const [stats, setStats] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { user } = useAuthStore()
  const isCreditOfficer = user?.role === 'CREDIT_OFFICER'

  useEffect(() => {
    fetchLoans()
    fetchStats()
  }, [])

  const fetchLoans = async () => {
    try {
      setIsLoading(true)
      const response = await loansApi.getAll({ limit: 100 })
      setLoans(response.data)
    } catch (error) {
      toast.error('Failed to fetch loans')
    } finally {
      setIsLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await loansApi.getStats()
      setStats(response.data)
    } catch (error) {
      console.error('Failed to fetch loan stats')
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Loans</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Manage loan applications and portfolio
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          {isCreditOfficer ? (
            <Link to="/loans/apply" className="btn-primary">
              <PlusIcon className="mr-2 h-5 w-5" />
              New Application
            </Link>
          ) : (
            <div className="flex items-center text-sm text-gray-400 dark:text-slate-500" title="Only Credit Officers can originate loan applications (Separation of Duties)">
              <ShieldExclamationIcon className="h-5 w-5 mr-1" />
              Credit Officer access only
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="stat-card dark:bg-slate-900/40 dark:border-slate-800">
            <p className="stat-label dark:text-slate-400">Total Portfolio</p>
            <p className="stat-value dark:text-white">{formatCurrency(stats.total_portfolio)}</p>
          </div>
          <div className="stat-card dark:bg-slate-900/40 dark:border-slate-800">
            <p className="stat-label dark:text-slate-400">Outstanding</p>
            <p className="stat-value dark:text-white">{formatCurrency(stats.total_outstanding)}</p>
          </div>
          <div className="stat-card dark:bg-slate-900/40 dark:border-slate-800">
            <p className="stat-label dark:text-slate-400">Active Loans</p>
            <p className="stat-value dark:text-white">{stats.active_loans}</p>
          </div>
          <div className="stat-card bg-red-50 dark:bg-red-900/20 dark:border-red-900/30">
            <p className="stat-label text-red-600 dark:text-red-400">Delinquent</p>
            <p className="stat-value text-red-700 dark:text-red-300">{stats.delinquent_loans}</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Loan Number</th>
                <th>Principal</th>
                <th>Outstanding</th>
                <th>Status</th>
                <th>Application Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    </div>
                  </td>
                </tr>
              ) : loans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500 dark:text-slate-500">
                    No loans found
                  </td>
                </tr>
              ) : (
                loans.map((loan) => (
                  <tr key={loan.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="font-mono text-gray-900 dark:text-slate-200">{loan.loan_number}</td>
                    <td className="text-gray-900 dark:text-slate-200">{formatCurrency(loan.principal_amount)}</td>
                    <td className="text-gray-900 dark:text-slate-200">{formatCurrency(loan.amount_outstanding)}</td>
                    <td>
                      <span className={`badge ${loan.status === 'active' ? 'badge-success' :
                        loan.status === 'delinquent' ? 'badge-danger' :
                          loan.status === 'pending' ? 'badge-warning' :
                            loan.status === 'approved' ? 'badge-info' :
                              'badge-danger'
                        }`}>
                        {loan.status}
                      </span>
                    </td>
                    <td className="text-gray-500 dark:text-slate-400">{formatDate(loan.application_date)}</td>
                    <td>
                      <button
                        onClick={() => navigate(`/loans/${loan.id}`)}
                        className="text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 transition-colors"
                      >
                        <DocumentTextIcon className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}