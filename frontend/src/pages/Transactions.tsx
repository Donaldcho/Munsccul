import { useEffect, useState } from 'react'
import {
  ArrowDownCircleIcon,
  ArrowUpCircleIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline'
import { transactionsApi } from '../services/api'
import { formatCurrency, formatDateTime, formatTransactionRef } from '../utils/formatters'
import toast from 'react-hot-toast'

interface Transaction {
  id: number
  transaction_ref: string
  transaction_type: string
  amount: number
  balance_after: number
  description: string | null
  created_at: string
  sync_status: string
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)

  const [formData, setFormData] = useState({
    account_id: '',
    to_account_id: '',
    amount: '',
    description: ''
  })

  useEffect(() => {
    fetchTransactions()
  }, [])

  const fetchTransactions = async () => {
    try {
      setIsLoading(true)
      const response = await transactionsApi.getAll({ limit: 50 })
      setTransactions(response.data.transactions)
    } catch (error) {
      toast.error('Failed to fetch transactions')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await transactionsApi.deposit({
        account_id: parseInt(formData.account_id),
        amount: parseFloat(formData.amount),
        description: formData.description
      })
      toast.success('Deposit successful')
      setShowDepositModal(false)
      setFormData({ account_id: '', to_account_id: '', amount: '', description: '' })
      fetchTransactions()
    } catch (error) {
      toast.error('Deposit failed')
    }
  }

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await transactionsApi.withdraw({
        account_id: parseInt(formData.account_id),
        amount: parseFloat(formData.amount),
        description: formData.description
      })
      toast.success('Withdrawal successful')
      setShowWithdrawModal(false)
      setFormData({ account_id: '', to_account_id: '', amount: '', description: '' })
      fetchTransactions()
    } catch (error) {
      toast.error('Withdrawal failed')
    }
  }

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return <ArrowDownCircleIcon className="h-6 w-6 text-green-500" />
      case 'withdrawal':
        return <ArrowUpCircleIcon className="h-6 w-6 text-red-500" />
      case 'transfer':
        return <ArrowsRightLeftIcon className="h-6 w-6 text-blue-500" />
      default:
        return <CheckCircleIcon className="h-6 w-6 text-gray-500" />
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Transactions</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Process and view financial transactions
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-3">
          <button
            onClick={() => setShowDepositModal(true)}
            className="btn-secondary"
          >
            <ArrowDownCircleIcon className="mr-2 h-5 w-5" />
            Deposit
          </button>
          <button
            onClick={() => setShowWithdrawModal(true)}
            className="btn-primary"
          >
            <ArrowUpCircleIcon className="mr-2 h-5 w-5" />
            Withdraw
          </button>
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Balance After</th>
                <th>Description</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    </div>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-500 dark:text-slate-400">
                    No transactions found
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="font-mono text-sm text-gray-900 dark:text-slate-200">
                      {formatTransactionRef(transaction.transaction_ref)}
                    </td>
                    <td>
                      <div className="flex items-center">
                        {getTransactionIcon(transaction.transaction_type)}
                        <span className="ml-2 capitalize text-gray-900 dark:text-slate-200">{transaction.transaction_type}</span>
                      </div>
                    </td>
                    <td className={`font-medium ${transaction.transaction_type === 'deposit' ? 'text-green-600 dark:text-green-400' :
                      transaction.transaction_type === 'withdrawal' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-slate-200'
                      }`}>
                      {transaction.transaction_type === 'withdrawal' ? '-' : '+'}
                      {formatCurrency(transaction.amount)}
                    </td>
                    <td className="text-gray-900 dark:text-slate-200">{formatCurrency(transaction.balance_after)}</td>
                    <td className="text-gray-500 dark:text-slate-400">{transaction.description || '-'}</td>
                    <td className="text-gray-900 dark:text-slate-200">{formatDateTime(transaction.created_at)}</td>
                    <td>
                      <span className={`badge ${transaction.sync_status === 'synced' ? 'badge-success' :
                        transaction.sync_status === 'pending' ? 'badge-warning' : 'badge-danger'
                        }`}>
                        {transaction.sync_status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-black dark:bg-opacity-70 backdrop-blur-sm" onClick={() => setShowDepositModal(false)} />
            <div className="relative bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full border dark:border-slate-800">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-800">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Process Deposit</h3>
              </div>
              <form onSubmit={handleDeposit} className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="label">Account ID *</label>
                    <input
                      type="number"
                      required
                      value={formData.account_id}
                      onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                      className="input"
                      placeholder="Enter account ID"
                    />
                  </div>
                  <div>
                    <label className="label dark:text-slate-300">Amount (FCFA) *</label>
                    <input
                      type="number"
                      required
                      min="100"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="input dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                      placeholder="Enter amount"
                    />
                  </div>
                  <div>
                    <label className="label">Description</label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="input"
                      placeholder="Optional description"
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowDepositModal(false)} className="btn-outline">
                    Cancel
                  </button>
                  <button type="submit" className="btn-secondary">
                    Process Deposit
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-black dark:bg-opacity-70 backdrop-blur-sm" onClick={() => setShowWithdrawModal(false)} />
            <div className="relative bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full border dark:border-slate-800">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-800">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Process Withdrawal</h3>
              </div>
              <form onSubmit={handleWithdrawal} className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="label">Account ID *</label>
                    <input
                      type="number"
                      required
                      value={formData.account_id}
                      onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                      className="input"
                      placeholder="Enter account ID"
                    />
                  </div>
                  <div>
                    <label className="label dark:text-slate-300">Amount (FCFA) *</label>
                    <input
                      type="number"
                      required
                      min="100"
                      max="5000000"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      className="input dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                      placeholder="Enter amount"
                    />
                  </div>
                  <div>
                    <label className="label">Description</label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="input"
                      placeholder="Optional description"
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowWithdrawModal(false)} className="btn-outline">
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    Process Withdrawal
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}