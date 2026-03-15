import { useEffect, useState } from 'react'
import {
  ArrowDownCircleIcon,
  ArrowUpCircleIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  CreditCardIcon
} from '@heroicons/react/24/outline'
import { transactionsApi, mobileMoneyApi } from '../services/api'
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
    description: '',
    payment_channel: 'CASH',
    purpose: 'SAVINGS',
    external_reference: '',
    comments: ''
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
      if (formData.payment_channel === 'MTN_MOMO' || formData.payment_channel === 'ORANGE_MONEY') {
        await mobileMoneyApi.collect({
          provider: formData.payment_channel,
          phone_number: formData.external_reference,
          amount: parseFloat(formData.amount),
          account_id: parseInt(formData.account_id),
          description: formData.description || `${formData.payment_channel} Deposit`
        })
        toast.success(`${formData.payment_channel} Collection Request Sent! Please ask member to check their phone.`)
      } else {
        await transactionsApi.deposit({
          account_id: parseInt(formData.account_id),
          amount: parseFloat(formData.amount),
          description: formData.description,
          payment_channel: formData.payment_channel,
          purpose: formData.purpose,
          external_reference: formData.external_reference || undefined,
          comments: formData.comments || undefined
        })
        toast.success('Deposit successful')
      }
      setShowDepositModal(false)
      setFormData({
        account_id: '', to_account_id: '', amount: '', description: '',
        payment_channel: 'CASH', purpose: 'SAVINGS', external_reference: '', comments: ''
      })
      fetchTransactions()
    } catch (error) {
      toast.error('Deposit failed')
    }
  }

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (formData.payment_channel === 'MTN_MOMO' || formData.payment_channel === 'ORANGE_MONEY') {
        await mobileMoneyApi.disburse({
          provider: formData.payment_channel,
          phone_number: formData.external_reference,
          amount: parseFloat(formData.amount),
          account_id: parseInt(formData.account_id),
          description: formData.description || `${formData.payment_channel} Withdrawal`
        })
        toast.success(`${formData.payment_channel} Disbursement Request Sent!`)
      } else {
        await transactionsApi.withdraw({
          account_id: parseInt(formData.account_id),
          amount: parseFloat(formData.amount),
          description: formData.description,
          payment_channel: formData.payment_channel,
          purpose: formData.purpose,
          external_reference: formData.external_reference || undefined,
          comments: formData.comments || undefined
        })
        toast.success('Withdrawal successful')
      }
      setShowWithdrawModal(false)
      setFormData({
        account_id: '', to_account_id: '', amount: '', description: '',
        payment_channel: 'CASH', purpose: 'SAVINGS', external_reference: '', comments: ''
      })
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
      case 'SHARE_PURCHASE':
        return <CreditCardIcon className="h-6 w-6 text-purple-600" />
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
                    <td className={`font-medium ${transaction.transaction_type === 'deposit' || transaction.transaction_type === 'SHARE_PURCHASE' ? 'text-green-600 dark:text-green-400' :
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Payment Method</label>
                      <select
                        className="select"
                        value={formData.payment_channel}
                        onChange={(e) => setFormData({ ...formData, payment_channel: e.target.value })}
                      >
                        <option value="CASH">Physical Cash</option>
                        <option value="MTN_MOMO">MTN MoMo</option>
                        <option value="ORANGE_MONEY">Orange Money</option>
                        <option value="BANK_TRANSFER">Bank Transfer (Corp)</option>
                        <option value="BALI_CO">Bali Co</option>
                        <option value="GLOVIC">Glovic</option>
                        <option value="MICROFINANCE_A">Microfinance A</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Deposit Type (Purpose)</label>
                      <select
                        className="select"
                        value={formData.purpose}
                        onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                      >
                        <option value="SAVINGS">Savings</option>
                        <option value="CURRENT_ACCOUNT">Current Account</option>
                        <option value="SHARE_CAPITAL">Share Capital</option>
                        <option value="ENTRANCE_FEES">Entrance Fees</option>
                        <option value="SOLIDARITY_FUND">Solidarity Fund</option>
                        <option value="BUILDING_CONTRIBUTION">Building Contribution</option>
                        <option value="LOAN_REPAYMENT">Loan Repayment</option>
                        <option value="LOAN_PROCESSING_FEES">Loan Processing Fees</option>
                      </select>
                    </div>
                  </div>
                  {(formData.payment_channel !== 'CASH') && (
                    <div>
                      <label className="label">
                        {formData.payment_channel === 'MTN_MOMO' || formData.payment_channel === 'ORANGE_MONEY'
                          ? 'Phone Number (e.g. 671234567)'
                          : 'External Ref (Mobile Ref / Check #)'}
                      </label>
                      <input
                        type="text"
                        value={formData.external_reference}
                        onChange={(e) => setFormData({ ...formData, external_reference: e.target.value })}
                        className="input"
                        placeholder={formData.payment_channel === 'MTN_MOMO' ? 'Enter MTN momo phone number' : 'Enter transaction reference'}
                        required={formData.payment_channel === 'MTN_MOMO' || formData.payment_channel === 'ORANGE_MONEY'}
                      />
                    </div>
                  )}
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
                  <div>
                    <label className="label">Comments</label>
                    <textarea
                      value={formData.comments}
                      onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                      className="input min-h-[80px]"
                      placeholder="Additional comments for the matrix report"
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Payment Method</label>
                      <select
                        className="select"
                        value={formData.payment_channel}
                        onChange={(e) => setFormData({ ...formData, payment_channel: e.target.value })}
                      >
                        <option value="CASH">Physical Cash</option>
                        <option value="MTN_MOMO">MTN MoMo</option>
                        <option value="ORANGE_MONEY">Orange Money</option>
                        <option value="BANK_TRANSFER">Bank Transfer (Corp)</option>
                        <option value="BALI_CO">Bali Co</option>
                        <option value="GLOVIC">Glovic</option>
                        <option value="MICROFINANCE_A">Microfinance A</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Withdrawal Type (Purpose)</label>
                      <select
                        className="select"
                        value={formData.purpose}
                        onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                      >
                        <option value="SAVINGS">Savings</option>
                        <option value="CURRENT_ACCOUNT">Current Account</option>
                        <option value="EXPENSES_OFFICE">Office Expenses</option>
                        <option value="EXPENSES_SALARIES">Salaries</option>
                        <option value="TAXATION_CNPS">Taxation/CNPS</option>
                        <option value="LOAN_DISBURSEMENT">Loan Disbursement</option>
                      </select>
                    </div>
                  </div>
                  {(formData.payment_channel !== 'CASH') && (
                    <div>
                      <label className="label">
                        {formData.payment_channel === 'MTN_MOMO' || formData.payment_channel === 'ORANGE_MONEY'
                          ? 'Phone Number (e.g. 671234567)'
                          : 'External Ref (Check # / Transfer Ref)'}
                      </label>
                      <input
                        type="text"
                        value={formData.external_reference}
                        onChange={(e) => setFormData({ ...formData, external_reference: e.target.value })}
                        className="input"
                        placeholder={formData.payment_channel === 'MTN_MOMO' ? 'Enter MTN momo phone number' : 'Enter routing reference'}
                        required={formData.payment_channel === 'MTN_MOMO' || formData.payment_channel === 'ORANGE_MONEY'}
                      />
                    </div>
                  )}
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
                  <div>
                    <label className="label">Comments</label>
                    <textarea
                      value={formData.comments}
                      onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                      className="input min-h-[80px]"
                      placeholder="Additional comments for the matrix report"
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