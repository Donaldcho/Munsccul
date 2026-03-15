import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  PlusIcon,
  CreditCardIcon,
  EyeIcon,
  ExclamationCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { accountsApi } from '../services/api'
import { formatCurrency, formatDate } from '../utils/formatters'
import toast from 'react-hot-toast'
import { getErrorMessage } from '../utils/errorUtils'

interface Account {
  id: number
  account_number: string
  member_id: number
  account_type: string
  balance: number
  available_balance: number
  is_active: boolean
  is_frozen: boolean
  opened_at: string
}

export default function Accounts() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    try {
      setIsLoading(true)
      setLoadError(null)
      const response = await accountsApi.getAll({ limit: 100 })
      setAccounts(response.data)
    } catch (error: any) {
      const msg = getErrorMessage(error, 'Unable to load accounts. Please try again.')
      setLoadError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Accounts</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            View and manage member accounts
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            onClick={() => navigate('/members')}
            className="btn-primary"
            title="Open a new account from a member's profile"
          >
            <PlusIcon className="mr-2 h-5 w-5" />
            New Account
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Account Number</th>
                <th>Type</th>
                <th>Balance</th>
                <th>Available</th>
                <th>Status</th>
                <th>Opened</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                      <p className="text-sm">Loading accounts...</p>
                    </div>
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <ExclamationCircleIcon className="h-10 w-10 text-amber-400" />
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Could not load accounts</p>
                      <p className="text-xs text-slate-400">{loadError}</p>
                      <button onClick={fetchAccounts} className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 text-sm font-medium hover:bg-primary-100 transition-colors">
                        <ArrowPathIcon className="h-4 w-4" /> Try Again
                      </button>
                    </div>
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <CreditCardIcon className="h-10 w-10 text-slate-300" />
                      <p className="text-sm">No accounts registered yet.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="font-mono text-gray-900 dark:text-slate-200">{account.account_number}</td>
                    <td className="capitalize text-gray-900 dark:text-slate-200">{account.account_type}</td>
                    <td className="font-medium text-gray-900 dark:text-slate-200">{formatCurrency(account.balance)}</td>
                    <td className="text-gray-900 dark:text-slate-200">{formatCurrency(account.available_balance)}</td>
                    <td>
                      <div className="flex gap-2">
                        <span className={`badge ${account.is_active ? 'badge-success' : 'badge-danger'}`}>
                          {account.is_active ? 'Active' : 'Inactive'}
                        </span>
                        {account.is_frozen && (
                          <span className="badge badge-warning">Frozen</span>
                        )}
                      </div>
                    </td>
                    <td className="text-gray-500 dark:text-slate-400">{formatDate(account.opened_at)}</td>
                    <td>
                      <Link
                        to={`/accounts/${account.id}`}
                        className="text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 transition-colors"
                      >
                        <EyeIcon className="h-5 w-5" />
                      </Link>
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