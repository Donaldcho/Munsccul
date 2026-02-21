import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
    ArrowLeftIcon,
    CreditCardIcon,
    BanknotesIcon
} from '@heroicons/react/24/outline'
import { accountsApi } from '../services/api'
import { formatCurrency, formatDate } from '../utils/formatters'
import toast from 'react-hot-toast'

interface AccountDetail {
    id: number
    account_number: string
    account_type: string
    account_class: number
    balance: number
    available_balance: number
    interest_rate: number
    minimum_balance: number
    is_active: boolean
    is_frozen: boolean
    opened_at: string
    member_id: number
}

interface Transaction {
    id?: number
    reference: string
    type: string
    amount: number
    balance_after: number
    description: string
    date: string
}

export default function AccountDetail() {
    const { id } = useParams<{ id: string }>()
    const [account, setAccount] = useState<AccountDetail | null>(null)
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        fetchAccountDetail()
    }, [id])

    const fetchAccountDetail = async () => {
        try {
            setIsLoading(true)
            const res = await accountsApi.getById(id!)
            setAccount(res.data)

            // Fetch statement/transactions for this account
            try {
                const stmtRes = await accountsApi.getStatement(id!)
                if (stmtRes.data?.transactions) {
                    setTransactions(stmtRes.data.transactions)
                } else if (Array.isArray(stmtRes.data)) {
                    setTransactions(stmtRes.data)
                }
            } catch {
                // Statement endpoint may not exist or may return differently
            }
        } catch {
            toast.error('Failed to fetch account details')
        } finally {
            setIsLoading(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        )
    }

    if (!account) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500">Account not found</p>
                <Link to="/accounts" className="text-primary-600 hover:text-primary-900 mt-2 inline-block">
                    Back to Accounts
                </Link>
            </div>
        )
    }

    return (
        <div>
            {/* Header */}
            <div className="mb-6">
                <Link to="/accounts" className="text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 flex items-center mb-4 transition-colors">
                    <ArrowLeftIcon className="h-4 w-4 mr-1" />
                    Back to Accounts
                </Link>
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <div className="h-14 w-14 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mr-4">
                            <CreditCardIcon className="h-7 w-7 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white font-mono">{account.account_number}</h1>
                            <p className="text-sm text-gray-500 dark:text-slate-400 capitalize">{account.account_type} Account</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`badge ${account.is_active ? 'badge-success' : 'badge-danger'}`}>
                            {account.is_active ? 'Active' : 'Inactive'}
                        </span>
                        {account.is_frozen && <span className="badge badge-warning">Frozen</span>}
                    </div>
                </div>
            </div>

            {/* Balance Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="card dark:bg-slate-900/40 dark:border-slate-800">
                    <div className="card-body text-center">
                        <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">Current Balance</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">{formatCurrency(account.balance)}</p>
                    </div>
                </div>
                <div className="card dark:bg-slate-900/40 dark:border-slate-800">
                    <div className="card-body text-center">
                        <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">Available Balance</p>
                        <p className="text-3xl font-bold text-green-600 dark:text-green-400">{formatCurrency(account.available_balance)}</p>
                    </div>
                </div>
                <div className="card dark:bg-slate-900/40 dark:border-slate-800">
                    <div className="card-body text-center">
                        <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">Minimum Balance</p>
                        <p className="text-3xl font-bold text-gray-600 dark:text-slate-300">{formatCurrency(account.minimum_balance)}</p>
                    </div>
                </div>
            </div>

            {/* Account Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="card dark:bg-slate-900/40 dark:border-slate-800">
                    <div className="card-header dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Account Details</h3>
                    </div>
                    <div className="card-body space-y-3">
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-500 dark:text-slate-400">Account Number</span>
                            <span className="font-mono font-medium text-gray-900 dark:text-slate-200">{account.account_number}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-500 dark:text-slate-400">Account Type</span>
                            <span className="capitalize font-medium text-gray-900 dark:text-slate-200">{account.account_type}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-500 dark:text-slate-400">OHADA Class</span>
                            <span className="font-medium text-gray-900 dark:text-slate-200">{account.account_class}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-500 dark:text-slate-400">Interest Rate</span>
                            <span className="font-medium text-gray-900 dark:text-slate-200">{account.interest_rate}% p.a.</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-500 dark:text-slate-400">Opened</span>
                            <span className="font-medium text-gray-900 dark:text-slate-200">{formatDate(account.opened_at)}</span>
                        </div>
                    </div>
                </div>

                <div className="card dark:bg-slate-900/40 dark:border-slate-800">
                    <div className="card-header dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Quick Actions</h3>
                    </div>
                    <div className="card-body space-y-3">
                        <Link
                            to={`/members/${account.member_id}`}
                            className="block w-full text-center px-4 py-3 border border-gray-300 dark:border-slate-700 rounded-md text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                        >
                            View Member Profile
                        </Link>
                    </div>
                </div>
            </div>

            {/* Transaction History */}
            <div className="card dark:bg-slate-900/40 dark:border-slate-800">
                <div className="card-header dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        <BanknotesIcon className="h-5 w-5 inline mr-2 text-primary-500" />
                        Transaction History
                    </h3>
                </div>
                <div className="card-body p-0">
                    {transactions.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">No transactions yet</p>
                    ) : (
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
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.map((txn, idx) => (
                                        <tr key={txn.reference || idx} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="font-mono text-xs text-gray-900 dark:text-slate-200">{txn.reference}</td>
                                            <td>
                                                <span className={`badge ${txn.type === 'DEPOSIT' ? 'badge-success' :
                                                    txn.type === 'WITHDRAWAL' ? 'badge-danger' : 'badge-info'
                                                    }`}>
                                                    {txn.type}
                                                </span>
                                            </td>
                                            <td className="font-medium text-gray-900 dark:text-slate-200">{formatCurrency(txn.amount)}</td>
                                            <td className="text-gray-900 dark:text-slate-200">{formatCurrency(txn.balance_after)}</td>
                                            <td className="text-sm text-gray-500 dark:text-slate-400">{txn.description}</td>
                                            <td className="text-sm text-gray-900 dark:text-slate-200">{formatDate(txn.date)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
