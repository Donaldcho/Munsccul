import { useState, useEffect } from 'react'
import {
    InboxIcon,
    ShieldExclamationIcon,
    UserGroupIcon,
    BanknotesIcon,
    CheckCircleIcon,
    XCircleIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { usersApi, loansApi, transactionsApi, reportsApi } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import LoanProductsConfig from './LoanProductsConfig'

export default function DirectorDashboard() {
    const [activeTab, setActiveTab] = useState<'users' | 'loans' | 'transactions' | 'config'>('users')
    const [pendingUsers, setPendingUsers] = useState<any[]>([])
    const [loanApplications, setLoanApplications] = useState<any[]>([])
    const [pendingTransactions, setPendingTransactions] = useState<any[]>([])
    const [liquidityRatio, setLiquidityRatio] = useState<number | null>(null)
    const [managedUsers, setManagedUsers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [limit, setLimit] = useState(0)
    const [showLimitModal, setShowLimitModal] = useState(false)
    const [selectedUser, setSelectedUser] = useState<any>(null)

    useEffect(() => {
        fetchAllData()
    }, [])

    const fetchAllData = async () => {
        setLoading(true)
        try {
            const [usersRes, loansRes, txnsRes, liquidityRes] = await Promise.all([
                usersApi.getAll(),
                loansApi.getAll({ status: 'PENDING_REVIEW' }),
                transactionsApi.getAll({ status: 'pending_approval' }),
                reportsApi.getCobacLiquidity(format(new Date(), 'yyyy-MM'))
            ])

            // Filter users client-side as API returns all
            setPendingUsers(usersRes.data.filter((u: any) => u.approval_status === 'PENDING'))
            // Show all approved users except admin
            setManagedUsers(usersRes.data.filter((u: any) =>
                u.approval_status === 'APPROVED' && u.role !== 'SYSTEM_ADMIN'
            ))
            // Filter for Tier 2 loans requiring Director approval
            setLoanApplications(loansRes.data.filter((l: any) => (l.principal_amount || l.amount) > 1000000 && l.approved_by != null))
            setPendingTransactions(txnsRes.data.transactions || [])
            setLiquidityRatio(liquidityRes.data.liquidity_ratio)
        } catch (error) {
            console.error('Failed to fetch manager data', error)
        } finally {
            setLoading(false)
        }
    }

    const handleApproveUser = async () => {
        if (!selectedUser) return
        try {
            await usersApi.approve(selectedUser.id, { approve: true, transaction_limit: limit })
            toast.success('User Approved')
            setShowLimitModal(false)
            fetchAllData()
        } catch (error: any) {
            toast.error('Failed to approve user')
        }
    }

    const handleRejectUser = async (user: any) => {
        if (!confirm(`Reject user ${user.username}?`)) return
        try {
            await usersApi.approve(user.id, { approve: false })
            toast.success('User Rejected')
            fetchAllData()
        } catch (error: any) {
            toast.error('Failed to reject user')
        }
    }

    const handleSuspendUser = async (user: any) => {
        if (!confirm(`SUSPEND ${user.username}? They will be logged out immediately.`)) return
        try {
            await usersApi.update(user.id, { is_active: false })
            toast.success('User Suspended')
            fetchAllData()
        } catch (error: any) {
            toast.error('Failed to suspend user')
        }
    }

    const handleRestoreUser = async (user: any) => {
        if (!confirm(`RESTORE ${user.username}? They will regain access.`)) return
        try {
            await usersApi.update(user.id, { is_active: true })
            toast.success('User Restored')
            fetchAllData()
        } catch (error: any) {
            toast.error('Failed to restore user')
        }
    }

    const handleApproveLoan = async (loan: any) => {
        if (!confirm(`Approve loan for ${formatCurrency(loan.principal_amount || loan.amount)}?`)) return
        try {
            await loansApi.approve(loan.id, { approved: true, reason: 'Approved by Manager' })
            toast.success('Loan Approved / Recommended')
            fetchAllData()
        } catch (error: any) {
            // Error handled by interceptor
            toast.error('Failed to approve loan')
        }
    }

    const handleRejectLoan = async (loan: any) => {
        const reason = prompt(`Reason for rejecting/returning loan ${loan.loan_number}?`)
        if (reason === null) return // canceled
        try {
            await loansApi.approve(loan.id, { approved: false, reason: reason })
            toast.success('Loan Rejected and returned')
            fetchAllData()
        } catch (error: any) {
            toast.error('Failed to reject loan')
        }
    }

    const handleApproveTxn = async (txn: any) => {
        if (!confirm(`Approve transaction of ${formatCurrency(txn.amount)}?`)) return
        try {
            await transactionsApi.approve({ transaction_ref: txn.transaction_ref, approved: true })
            toast.success('Transaction Approved')
            fetchAllData()
        } catch (error: any) {
            toast.error('Failed to approve transaction')
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Operations Directorate</h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                        Tier 2 Oversight & Approvals
                    </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                    Ops Director View
                </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Inbox (Approvals) */}
                <div className="lg:col-span-2">
                    <div className="card h-full">
                        <div className="card-header border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <InboxIcon className="h-5 w-5 text-gray-400 dark:text-slate-500 mr-2" />
                                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Inbox</h3>
                                </div>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => setActiveTab('users')}
                                        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${activeTab === 'users' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                                            }`}
                                    >
                                        Staff ({pendingUsers.length})
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('loans')}
                                        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${activeTab === 'loans' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                                            }`}
                                    >
                                        Loans ({loanApplications.length})
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('transactions')}
                                        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${activeTab === 'transactions' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                                            }`}
                                    >
                                        Txns ({pendingTransactions.length})
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('config')}
                                        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${activeTab === 'config' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                                            }`}
                                    >
                                        Configuration
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="card-body p-0">
                            {activeTab === 'config' ? (
                                <div className="p-6">
                                    <LoanProductsConfig />
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                                        <thead className="bg-gray-50 dark:bg-slate-800/60">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Item</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Details</th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white dark:bg-transparent divide-y divide-gray-200 dark:divide-slate-700">
                                            {activeTab === 'users' && pendingUsers.map(user => (
                                                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-slate-200">{user.full_name}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400">{user.role} - {user.username}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400 space-x-4">
                                                        <button onClick={() => { setSelectedUser(user); setShowLimitModal(true) }} className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 font-medium transition-colors">Approve</button>
                                                        <button onClick={() => handleRejectUser(user)} className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 font-medium transition-colors">Reject</button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {activeTab === 'loans' && loanApplications.map(loan => (
                                                <tr key={loan.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-slate-200">Loan #{loan.loan_number}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400">{formatCurrency(loan.principal_amount || loan.amount)} - {loan.member_name}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400 space-x-4">
                                                        <button onClick={() => handleApproveLoan(loan)} className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 font-medium transition-colors">Approve</button>
                                                        <button onClick={() => handleRejectLoan(loan)} className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 font-medium transition-colors">Reject</button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {activeTab === 'transactions' && pendingTransactions.map(txn => (
                                                <tr key={txn.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-slate-200">{txn.type}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400">{formatCurrency(txn.amount)} - Ref: {txn.transaction_ref}</td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400">
                                                        <button onClick={() => handleApproveTxn(txn)} className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 font-medium transition-colors">Approve</button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {((activeTab === 'users' && pendingUsers.length === 0) ||
                                                (activeTab === 'loans' && loanApplications.length === 0) ||
                                                (activeTab === 'transactions' && pendingTransactions.length === 0)) && (
                                                    <tr>
                                                        <td colSpan={3} className="px-6 py-4 text-center text-gray-500 dark:text-slate-400">No pending items</td>
                                                    </tr>
                                                )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="lg:col-span-1 space-y-6">

                    {/* 2. COBAC Liquidity Gauge */}
                    <div className="card">
                        <div className="card-header border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60">
                            <div className="flex items-center">
                                <BanknotesIcon className="h-5 w-5 text-gray-400 dark:text-slate-500 mr-2" />
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">COBAC Compliance</h3>
                            </div>
                        </div>
                        <div className="card-body text-center">
                            <div className="relative pt-1">
                                <div className="flex mb-2 items-center justify-between">
                                    <div>
                                        <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300">
                                            Liquidity Ratio
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-semibold inline-block text-blue-600 dark:text-blue-300">
                                            {liquidityRatio ? liquidityRatio.toFixed(2) : 0}%
                                        </span>
                                    </div>
                                </div>
                                <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-200 dark:bg-slate-700">
                                    <div style={{ width: `${Math.min(liquidityRatio || 0, 100)}%` }} className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${(liquidityRatio || 0) >= 100 ? 'bg-green-500' : 'bg-red-500'
                                        }`}></div>
                                </div>
                                <p className={`text-sm font-bold ${(liquidityRatio || 0) >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                                    {(liquidityRatio || 0) >= 100 ? 'COMPLIANT' : 'NON-COMPLIANT'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 3. Kill Switch */}
                    <div className="card">
                        <div className="card-header border-b border-gray-200 dark:border-slate-700 bg-red-50 dark:bg-red-900/20">
                            <div className="flex items-center text-red-700 dark:text-red-400">
                                <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
                                <h3 className="text-lg font-bold">Kill Switch</h3>
                            </div>
                        </div>
                        <div className="card-body">
                            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">Manage access for approved users.</p>
                            <div className="max-h-64 overflow-y-auto">
                                <ul className="divide-y divide-gray-200 dark:divide-slate-700">
                                    {managedUsers.map((user: any) => (
                                        <li key={user.id} className={`py-3 flex justify-between items-center transition-colors ${!user.is_active ? 'opacity-75 bg-gray-50 dark:bg-slate-800/40' : 'hover:bg-gray-50/50 dark:hover:bg-slate-800/30'}`}>
                                            <div>
                                                <p className="text-sm font-medium text-gray-900 dark:text-slate-200">
                                                    {user.username}
                                                    {!user.is_active && (
                                                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                                                            Suspended
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-slate-400">{user.role}</p>
                                            </div>
                                            {user.is_active ? (
                                                <button
                                                    onClick={() => handleSuspendUser(user)}
                                                    className="px-2 py-1 text-xs font-bold text-white bg-red-600 rounded hover:bg-red-700 transition-colors"
                                                >
                                                    SUSPEND
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleRestoreUser(user)}
                                                    className="px-2 py-1 text-xs font-bold text-white bg-green-600 rounded hover:bg-green-700 transition-colors"
                                                >
                                                    RESTORE
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Approval Limit Modal */}
            {showLimitModal && (
                <div className="fixed inset-0 bg-gray-600 dark:bg-black bg-opacity-50 dark:bg-opacity-70 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
                    <div className="relative mx-auto p-6 border dark:border-slate-700 w-96 shadow-xl rounded-xl bg-white dark:bg-slate-900">
                        <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Set Transaction Limit</h3>
                        <input
                            type="number"
                            className="input mb-4"
                            placeholder="Limit (FCFA)"
                            onChange={(e) => setLimit(parseInt(e.target.value))}
                        />
                        <div className="flex justify-end space-x-2">
                            <button onClick={() => setShowLimitModal(false)} className="btn-secondary">Cancel</button>
                            <button onClick={handleApproveUser} className="btn-primary">Confirm Approval</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
