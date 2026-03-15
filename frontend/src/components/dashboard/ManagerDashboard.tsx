import { useState, useEffect, useRef } from 'react'
import {
    InboxIcon,
    ShieldExclamationIcon,
    UserGroupIcon,
    BanknotesIcon,
    CheckCircleIcon,
    XCircleIcon,
    ExclamationTriangleIcon,
    ClockIcon,
    Bars3CenterLeftIcon as QueueIcon,
    LockClosedIcon,
    ArrowPathIcon,
    Cog6ToothIcon
} from '@heroicons/react/24/outline'
import { usersApi, loansApi, transactionsApi, reportsApi, queueApi, opsApi, eodApi, intercomApi, treasuryApi } from '../../services/api'
import { ArrowTrendingUpIcon } from '@heroicons/react/24/solid'
import { useAuthStore } from '../../stores/authStore'
import { formatCurrency } from '../../utils/formatters'
import { getErrorMessage } from '../../utils/errorUtils'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import LoanProductsConfig from './LoanProductsConfig'
import EODWizard from './EODWizard'
import TreasuryTransferModal from './TreasuryTransferModal'
import SystemInitWizard from './SystemInitWizard'
import { SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline'

interface OverrideRequest {
    id: number
    teller_id: number
    teller_name: string
    amount: number
    transaction_type: string
    member_id_display?: string
    status: string
    created_at: string
}

export default function ManagerDashboard() {
    const { user } = useAuthStore()
    const branchId = user?.branch_id || 1

    // Zone 1: Inbox Data
    const [pendingUsers, setPendingUsers] = useState<any[]>([])
    const [loanApplications, setLoanApplications] = useState<any[]>([])
    const [overrideRequests, setOverrideRequests] = useState<OverrideRequest[]>([])
    const [pendingTransfers, setPendingTransfers] = useState<any[]>([])

    // Zone 2: Liquidity Data
    const [liquidity, setLiquidity] = useState<any>(null)
    const [liquidityRatio, setLiquidityRatio] = useState<any>({ ratio: 104.5, status: 'COMPLIANT' })

    // Zone 3: Health & Queue
    const [queueStats, setQueueStats] = useState<any>(null)
    const [branchStatus, setBranchStatus] = useState<string>('OPEN')
    const [globalStats, setGlobalStats] = useState<any>(null)

    // State UI
    const [loading, setLoading] = useState(true)
    const [showEODWizard, setShowEODWizard] = useState(false)
    const [showConfig, setShowConfig] = useState(false)
    const [showTreasuryModal, setShowTreasuryModal] = useState(false)
    const [overrideModal, setOverrideModal] = useState<OverrideRequest | null>(null)
    const [overrideAction, setOverrideAction] = useState<'APPROVE' | 'REJECT'>('APPROVE')
    const [managerPin, setManagerPin] = useState('')
    const [showSyncWizard, setShowSyncWizard] = useState(false)
    const [showAdjustmentModal, setShowAdjustmentModal] = useState(false)
    const [adjustmentAmount, setAdjustmentAmount] = useState('')
    const [adjustmentDesc, setAdjustmentDesc] = useState('Genesis Vault Injection')
    const [limit, setLimit] = useState(0)
    const [selectedUser, setSelectedUser] = useState<any>(null)
    const [transferModal, setTransferModal] = useState<any>(null)
    const [transferPin, setTransferPin] = useState('')

    const wsRef = useRef<WebSocket | null>(null)

    const fetchAllData = async () => {
        try {
            const [usersRes, loansRes, overridesRes, liqRes, qRes, eodRes, treasuryRes, globalRes] = await Promise.all([
                usersApi.getAll(),
                loansApi.getAll({ status: 'PENDING_REVIEW' }),
                opsApi.getOverrideRequests({ branch_id: branchId }),
                opsApi.getLiquidity(branchId),
                queueApi.getStats().catch(() => ({ data: null })),
                eodApi.getStatus(),
                treasuryApi.getPendingTransfers().catch(() => ({ data: [] })),
                reportsApi.getDashboard().catch(() => ({ data: null }))
            ])

            setPendingUsers(usersRes.data.filter((u: any) => u.approval_status === 'PENDING') || [])
            setLoanApplications(loansRes.data?.applications || loansRes.data || [])
            setOverrideRequests(overridesRes.data || [])
            setLiquidity(liqRes.data || null)
            setQueueStats(qRes.data || null)
            setBranchStatus(eodRes.data?.is_closed ? 'CLOSED' : (eodRes.data?.eod_locked ? 'EOD_IN_PROGRESS' : 'OPEN'))
            setPendingTransfers(treasuryRes.data || [])
            setGlobalStats(globalRes?.data || null)

            // Fetch Liquidity Ratio
            try {
                const ratioRes = await reportsApi.getCobacLiquidity('daily')
                setLiquidityRatio(ratioRes.data)
            } catch (e) { }

        } catch (error) {
            console.error('Failed to fetch dashboard data', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchAllData()

        // WebSocket for live override alerts — backend endpoint: /api/v1/branches/ws/{branch_id}
        let ws: WebSocket | null = null
        try {
            const wsUrl = opsApi.getOpsInboxWebSocketUrl(branchId)
            ws = new WebSocket(wsUrl)
            wsRef.current = ws

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    if (data.type === 'TELLER_OVERRIDE_REQUEST' || data.type === 'TELLER_OVERRIDE_RESOLVED' || data.type === 'TREASURY_UPDATE') {
                        fetchAllData()
                    }
                } catch (_) { /* ignore parse errors */ }
            }
            ws.onerror = () => { /* fail silently; dashboard works without live updates */ }
            ws.onclose = () => { wsRef.current = null }
        } catch (_) {
            wsRef.current = null
        }
        return () => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close()
            }
            wsRef.current = null
        }
    }, [branchId])

    const handleOverrideSubmit = async () => {
        if (!overrideModal || !managerPin) return
        try {
            if (overrideAction === 'APPROVE') {
                await opsApi.approveOverride(overrideModal.id, { manager_pin: managerPin })
                toast.success('Transaction Approved Remotely')
            } else {
                const reason = window.prompt("Reason for rejection:")
                if (!reason || !reason.trim()) {
                    toast.error("Rejection reason is required via Intercom policy")
                    return
                }
                await opsApi.rejectOverride(overrideModal.id, { manager_pin: managerPin, comments: reason })
                toast.success('Override Rejected')

                // Dispatch justification to Teller via Intercom
                try {
                    await intercomApi.send({
                        content: `Transaction Override Rejected: ${reason}`,
                        receiver_id: overrideModal.teller_id,
                        attached_entity_type: 'TRANSACTION',
                        attached_entity_id: overrideModal.id.toString()
                    })
                } catch (err) {
                    console.error('Failed to dispatch intercom message', err)
                }
            }
            setOverrideModal(null)
            setManagerPin('')
            fetchAllData()
        } catch (e: any) {
            toast.error(getErrorMessage(e, `Failed to ${overrideAction.toLowerCase()}`))
        }
    }

    const handleApproveUser = async () => {
        if (!selectedUser) return
        try {
            await usersApi.approve(selectedUser.id, { approve: true, transaction_limit: limit })
            toast.success('User Activated')
            setSelectedUser(null)
            fetchAllData()
        } catch (error: any) {
            toast.error('Activation failed')
        }
    }

    const handleApproveTransfer = async (approved: boolean) => {
        if (approved && !transferPin) {
            toast.error('Enter your PIN')
            return
        }
        try {
            await treasuryApi.approveTransfer(transferModal.id, {
                approved,
                manager_pin: transferPin
            })
            toast.success(approved ? 'Transfer Approved & Ledger Posted' : 'Transfer Rejected')
            setTransferModal(null)
            setTransferPin('')
            fetchAllData()
        } catch (e: any) {
            toast.error(getErrorMessage(e, 'Action failed'))
        }
    }

    const handleVaultAdjustment = async () => {
        if (!adjustmentAmount) {
            toast.error('Enter amount')
            return
        }
        try {
            await treasuryApi.vaultAdjustment({
                amount: parseFloat(adjustmentAmount),
                description: adjustmentDesc
            })
            toast.success('Vault Adjustment Successful')
            setShowAdjustmentModal(false)
            setAdjustmentAmount('')
            fetchAllData()
        } catch (e: any) {
            toast.error(getErrorMessage(e, 'Adjustment failed'))
        }
    }

    if (loading) return <div className="flex items-center justify-center h-screen bg-slate-50 dark:bg-slate-950"><ArrowPathIcon className="h-12 w-12 animate-spin text-primary-600" /></div>

    return (
        <div className="space-y-6 pb-20 animate-in fade-in duration-500">
            {/* Header with quick stats and EOD toggle */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Branch Command Center</h1>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Monitoring Branch Ops • Real-time Compliance</p>
                </div>
                <div className="flex items-center gap-3">
                    {['OPS_MANAGER', 'OPS_DIRECTOR', 'SYSTEM_ADMIN'].includes(user?.role || '') && (
                        <button
                            onClick={() => setShowConfig(!showConfig)}
                            className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:shadow-lg transition-all"
                        >
                            <Cog6ToothIcon className="h-6 w-6 text-slate-600" />
                        </button>
                    )}
                    {['OPS_MANAGER', 'OPS_DIRECTOR', 'SYSTEM_ADMIN'].includes(user?.role || '') && (
                        <button
                            onClick={() => setShowSyncWizard(true)}
                            className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-black rounded-2xl hover:from-indigo-700 hover:to-blue-700 transition shadow-xl shadow-indigo-500/10 flex items-center gap-2"
                        >
                            <SparklesIcon className="h-5 w-5" /> System Sync
                        </button>
                    )}
                    {['OPS_MANAGER', 'OPS_DIRECTOR', 'SYSTEM_ADMIN'].includes(user?.role || '') && (
                        <button
                            onClick={() => setShowEODWizard(true)}
                            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black transition-all shadow-xl ${branchStatus === 'OPEN'
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/20'
                                : 'bg-slate-900 dark:bg-slate-700 text-white'
                                }`}
                        >
                            {branchStatus === 'OPEN' ? (
                                <> <ClockIcon className="h-5 w-5" /> Execute EOD Closure </>
                            ) : (
                                <> <LockClosedIcon className="h-5 w-5" /> {branchStatus.replace(/_/g, ' ')} </>
                            )}
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ZONE 1: HIGH-PRIORITY ACTION INBOX */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl">
                                    <InboxIcon className="h-6 w-6 text-indigo-600" />
                                </div>
                                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Action Inbox</h2>
                            </div>
                            <span className="bg-slate-100 dark:bg-slate-800 px-4 py-1.5 rounded-full text-xs font-black text-slate-500 uppercase tracking-widest">
                                {overrideRequests.length + pendingUsers.length + loanApplications.length + pendingTransfers.length} Items
                            </span>
                        </div>

                        <div className="space-y-8">
                            {/* Teller Overrides Section - PULSING RED */}
                            {overrideRequests.length > 0 && ['OPS_MANAGER', 'OPS_DIRECTOR', 'SYSTEM_ADMIN'].includes(user?.role || '') && (
                                <div className="space-y-4">
                                    <h3 className="text-xs font-black text-red-600 dark:text-red-400 uppercase tracking-[0.2em] flex items-center">
                                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mr-2" />
                                        Critical: Teller Overrides
                                    </h3>
                                    {overrideRequests.map(req => (
                                        <div key={req.id} className="flex items-center justify-between p-5 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-[2rem]">
                                            <div>
                                                <p className="font-black text-slate-900 dark:text-white">{req.teller_name}</p>
                                                <p className="text-sm text-slate-500">{req.transaction_type} of <span className="font-black text-red-600">{formatCurrency(req.amount)}</span></p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => { setOverrideAction('APPROVE'); setOverrideModal(req); }}
                                                    className="bg-red-600 text-white px-6 py-2 rounded-2xl font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-500/20"
                                                >
                                                    Approve REMOTELY
                                                </button>
                                                <button
                                                    onClick={() => { setOverrideAction('REJECT'); setOverrideModal(req); }}
                                                    className="px-4 py-2 border border-red-200 text-red-600 rounded-2xl font-bold text-sm"
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Loan Applications */}
                            <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800">
                                <h3 className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-[0.2em]">Loan Applications</h3>
                                {loanApplications.length === 0 ? <p className="text-sm text-slate-400 italic">No pending applications</p> : (
                                    loanApplications.slice(0, 5).map((loan: any) => (
                                        <div key={loan.id} className="flex items-center justify-between p-5 bg-slate-50 dark:bg-slate-800/50 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                                            <div>
                                                <p className="font-bold text-slate-900 dark:text-white">Loan #{loan.loan_number || loan.id}</p>
                                                <p className="text-sm text-slate-500">{loan.member_name || 'Member'} — {formatCurrency(loan.principal_amount || loan.amount)}</p>
                                            </div>
                                            <a href={`/loans/${loan.id}`} className="px-6 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-sm hover:opacity-80">
                                                Review
                                            </a>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Pending Cash Transfers */}
                            {pendingTransfers.length > 0 && (
                                <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800">
                                    <h3 className="text-xs font-black text-primary-600 dark:text-primary-400 uppercase tracking-[0.2em] flex items-center">
                                        <BanknotesIcon className="h-4 w-4 mr-2" />
                                        Pending Cash Transfers
                                    </h3>
                                    {pendingTransfers.map((tx: any) => (
                                        <div key={tx.id} className="flex items-center justify-between p-5 bg-primary-50/50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30 rounded-[2rem]">
                                            <div>
                                                <p className="font-black text-slate-900 dark:text-white">{tx.transfer_type.replace(/_/g, ' ')}</p>
                                                <p className="text-sm text-slate-500">{formatCurrency(tx.amount)} • By {tx.creator_name || 'Staff'}</p>
                                            </div>
                                            <button
                                                onClick={() => setTransferModal(tx)}
                                                className="px-6 py-2 bg-primary-600 text-white rounded-2xl font-bold text-sm hover:bg-primary-700 shadow-lg shadow-primary-500/20"
                                            >
                                                Verify & Accept
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* User Activations (Maker-Checker) */}
                            {pendingUsers.length > 0 && ['OPS_MANAGER', 'OPS_DIRECTOR', 'SYSTEM_ADMIN', 'BRANCH_MANAGER'].includes(user?.role || '') && (
                                <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800">
                                    <h3 className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em]">User Activations</h3>
                                    {pendingUsers.map(u => (
                                        <div key={u.id} className="flex items-center justify-between p-5 bg-slate-50 dark:bg-slate-800/50 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                                            <div>
                                                <p className="font-bold text-slate-900 dark:text-white">{u.full_name}</p>
                                                <p className="text-xs text-slate-500 uppercase tracking-tight">{u.role} • @{u.username}</p>
                                            </div>
                                            <button
                                                onClick={() => setSelectedUser(u)}
                                                className="text-indigo-600 font-black text-sm border-2 border-indigo-500/10 px-6 py-2 rounded-2xl hover:bg-indigo-50 transition-colors"
                                            >
                                                Authorize
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {overrideRequests.length + pendingUsers.length + loanApplications.length === 0 && (
                                <div className="py-20 text-center">
                                    <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto mb-4 opacity-20" />
                                    <h3 className="text-xl font-black text-slate-300 dark:text-slate-700 uppercase tracking-widest">Inbox Zero</h3>
                                    <p className="text-slate-400 dark:text-slate-600 text-sm">System is stable and up to date.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ZONE 2 & 3: RIGHT SIDEBAR */}
                <div className="space-y-6">

                    {/* LIQUIDITY MATRIX */}
                    {['OPS_MANAGER', 'OPS_DIRECTOR', 'SYSTEM_ADMIN'].includes(user?.role || '') && (
                        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-xl">
                                        <BanknotesIcon className="h-5 w-5 text-green-600" />
                                    </div>
                                    <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Liquidity Matrix</h2>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setShowTreasuryModal(true)}
                                        className="text-[10px] font-bold bg-green-600 text-white px-2 py-1 rounded-lg hover:bg-green-700 shadow shadow-green-500/20"
                                    >
                                        Move Funds
                                    </button>
                                    <button
                                        onClick={() => setShowAdjustmentModal(true)}
                                        className="text-[10px] font-bold bg-purple-600 text-white px-2 py-1 rounded-lg hover:bg-purple-700 shadow shadow-purple-500/20"
                                    >
                                        Inject Vault
                                    </button>
                                    <button onClick={fetchAllData} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                                        <ArrowPathIcon className="h-4 w-4 text-slate-400" />
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <div className="p-8 bg-slate-900 dark:bg-indigo-950 rounded-[2rem] text-white shadow-2xl shadow-indigo-500/10">
                                    <p className="text-[10px] font-black uppercase text-indigo-300 tracking-widest mb-1">Total Liquidity Pool</p>
                                    <p className="text-4xl font-black tracking-tighter">{formatCurrency(liquidity?.total_liquidity || 0)}</p>
                                </div>

                                <div className="p-6 bg-emerald-950/40 rounded-[2rem] border border-emerald-500/20 text-emerald-400">
                                    <p className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-70">Stable Capital (Shares)</p>
                                    <p className="text-2xl font-black tracking-tighter">{formatCurrency(globalStats?.capital_adequacy?.total_shares || 0)}</p>
                                </div>

                                {liquidity?.categories?.map((category: any) => (
                                    <div key={category.name} className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                                            <span>{category.name}</span>
                                            <span className="text-slate-400">{formatCurrency(category.total_balance)}</span>
                                        </h4>
                                        <div className="grid gap-3">
                                            {category.items.map((item: any) => {
                                                const isOverLimit = item.limit && Number(item.balance) >= Number(item.limit);
                                                const isWarning = item.limit && Number(item.balance) > (Number(item.limit) * 0.8) && !isOverLimit;

                                                return (
                                                    <div key={item.name} className={`p-5 rounded-[1.5rem] border transition-all ${isOverLimit ? 'bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-900/30'
                                                        : isWarning ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/30'
                                                            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'
                                                        }`}>
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <p className="text-xs font-bold text-slate-500">{item.name} {item.account_number ? `(${item.account_number})` : ''}</p>
                                                                <p className={`text-xl font-black ${isOverLimit ? 'text-red-700 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
                                                                    {formatCurrency(item.balance)}
                                                                </p>
                                                                {item.limit && (
                                                                    <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider font-bold">Limit: {formatCurrency(item.limit)}</p>
                                                                )}
                                                            </div>
                                                            {(isWarning || isOverLimit) && (
                                                                <div className={`h-8 w-8 rounded-full flex items-center justify-center animate-pulse ${isOverLimit ? 'bg-red-100' : 'bg-amber-100'}`} title="Approaching or exceeding threshold">
                                                                    <ExclamationTriangleIcon className={`h-4 w-4 ${isOverLimit ? 'text-red-600' : 'text-amber-600'}`} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* RISK RADAR & QUEUE */}
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-200 dark:border-slate-800 shadow-sm relative">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
                                <ShieldExclamationIcon className="h-5 w-5 text-amber-600" />
                            </div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Risk Radar</h2>
                        </div>

                        <div className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-800/50 rounded-[2rem] border border-slate-100 dark:border-slate-800 mb-6">
                            <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Liquidity Ratio</p>
                            <span className={`text-5xl font-black tracking-tighter ${liquidityRatio.ratio >= 100 ? 'text-green-600' : 'text-red-500'}`}>
                                {liquidityRatio.ratio.toFixed(1)}%
                            </span>
                            <span className={`mt-3 px-4 py-1 rounded-full text-[10px] font-black border ${liquidityRatio.status === 'COMPLIANT'
                                ? 'border-green-200 text-green-700 bg-green-50'
                                : 'border-red-200 text-red-700 bg-red-50'
                                }`}>
                                {liquidityRatio.status}
                            </span>
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
                                <div className="flex items-center gap-2">
                                    <QueueIcon className="h-5 w-5 text-slate-500" />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Queue Pressure</span>
                                </div>
                                <span className="text-lg font-black text-slate-900 dark:text-white">{queueStats?.waiting_count || 0} Members</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* MODALS */}
            {overrideModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl max-w-sm w-full p-10 border border-slate-200 dark:border-slate-800">
                        <div className="h-16 w-16 bg-red-100 rounded-3xl flex items-center justify-center mb-6">
                            <ShieldExclamationIcon className="h-8 w-8 text-red-600" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 uppercase">
                            {overrideAction === 'APPROVE' ? 'Remote Approval' : 'Remote Rejection'}
                        </h3>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-8">
                            Unblock <strong>{overrideModal.teller_name}</strong> for transaction of <strong>{formatCurrency(overrideModal.amount)}</strong>.
                        </p>
                        <input
                            type="password"
                            placeholder="••••"
                            autoFocus
                            className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-5 text-center text-2xl font-black tracking-[0.5em] mb-6 focus:border-red-500 focus:ring-0 transition-all"
                            value={managerPin}
                            onChange={e => setManagerPin(e.target.value)}
                        />
                        <div className="flex gap-4">
                            <button onClick={() => { setOverrideModal(null); setManagerPin('') }} className="flex-1 py-4 font-black text-slate-400 uppercase text-xs">Cancel</button>
                            <button onClick={handleOverrideSubmit} className={`flex-1 text-white rounded-[1.5rem] font-black py-4 shadow-xl active:scale-95 transition-all ${overrideAction === 'APPROVE' ? 'bg-indigo-600 shadow-indigo-600/20' : 'bg-red-600 shadow-red-600/20'}`}>SIGN & {overrideAction === 'APPROVE' ? 'APPROVE' : 'REJECT'}</button>
                        </div>
                    </div>
                </div>
            )}

            {selectedUser && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl max-w-sm w-full p-10 border border-slate-200 dark:border-slate-800">
                        <div className="h-16 w-16 bg-indigo-100 rounded-3xl flex items-center justify-center mb-6">
                            <UserGroupIcon className="h-8 w-8 text-indigo-600" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">User Activation</h3>
                        <p className="text-slate-500 text-sm mb-8">
                            Authorize <strong>{selectedUser.full_name}</strong> and set their daily limit.
                        </p>
                        <div className="space-y-4 mb-8">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Txn Limit (XAF)</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-5 font-black text-xl"
                                    value={limit}
                                    onChange={e => setLimit(Number(e.target.value))}
                                />
                                <div className="flex gap-2 mt-2">
                                    {[1000000, 5000000].map(v => (
                                        <button key={v} onClick={() => setLimit(v)} className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded-md">{formatCurrency(v)}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => setSelectedUser(null)} className="flex-1 py-4 font-black text-slate-400 uppercase text-xs">Cancel</button>
                            <button onClick={handleApproveUser} className="flex-1 bg-indigo-600 text-white rounded-[1.5rem] font-black py-4 shadow-xl shadow-indigo-600/20">AUTHORIZE</button>
                        </div>
                    </div>
                </div>
            )}

            {showConfig && (
                <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[120] flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl max-w-6xl w-full p-12 relative animate-in zoom-in-95">
                        <button
                            onClick={() => setShowConfig(false)}
                            className="absolute top-8 right-8 p-3 bg-slate-100 dark:bg-slate-800 rounded-full hover:rotate-90 transition-all"
                        >
                            <XCircleIcon className="h-8 w-8 text-slate-500" />
                        </button>
                        <div className="mb-8">
                            <h2 className="text-3xl font-black text-slate-900 dark:text-white">Loan Product Configuration</h2>
                            <p className="text-slate-500">Modify interest rates, terms, and regulatory constraints.</p>
                        </div>
                        <LoanProductsConfig />
                    </div>
                </div>
            )}

            {showEODWizard && (
                <EODWizard
                    onClose={() => setShowEODWizard(false)}
                    onComplete={() => {
                        setShowEODWizard(false)
                        setBranchStatus('CLOSED')
                        fetchAllData()
                    }}
                />
            )}

            {transferModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl max-w-sm w-full p-10 border border-slate-200 dark:border-slate-800">
                        <div className="h-16 w-16 bg-primary-100 rounded-3xl flex items-center justify-center mb-6">
                            <BanknotesIcon className="h-8 w-8 text-primary-600" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Verify Cash Transfer</h3>
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 mb-6 border border-slate-100 dark:border-slate-700">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Details</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{transferModal.transfer_type.replace(/_/g, ' ')}</p>
                            <p className="text-2xl font-black text-primary-600 mt-1">{formatCurrency(transferModal.amount)}</p>
                        </div>
                        <input
                            type="password"
                            placeholder="Your PIN"
                            autoFocus
                            className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-5 text-center text-2xl font-black tracking-[0.5em] mb-6 focus:border-primary-500 transition-all"
                            value={transferPin}
                            onChange={e => setTransferPin(e.target.value)}
                        />
                        <div className="flex gap-4">
                            <button onClick={() => handleApproveTransfer(false)} className="flex-1 py-4 font-black text-red-500 uppercase text-xs">Reject</button>
                            <button onClick={() => handleApproveTransfer(true)} className="flex-1 bg-primary-600 text-white rounded-[1.5rem] font-black py-4 shadow-xl active:scale-95 transition-all">POST LEDGER</button>
                        </div>
                        <button onClick={() => { setTransferModal(null); setTransferPin('') }} className="w-full mt-4 text-[10px] font-black text-slate-400 uppercase hover:text-slate-600">Cancel</button>
                    </div>
                </div>
            )}

            <TreasuryTransferModal
                isOpen={showTreasuryModal}
                onClose={() => setShowTreasuryModal(false)}
                onSuccess={() => {
                    fetchAllData();
                }}
            />

            {/* Genesis Injection Modal */}
            {showAdjustmentModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl max-w-sm w-full p-10 border border-slate-200 dark:border-slate-800">
                        <div className="h-16 w-16 bg-purple-100 rounded-3xl flex items-center justify-center mb-6">
                            <BanknotesIcon className="h-8 w-8 text-purple-600" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Genesis Injection</h3>
                        <p className="text-slate-500 text-sm mb-8">Set the initial physical cash balance against Retained Earnings (Capital).</p>

                        <div className="space-y-6">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Amount (FCFA)</label>
                                <input
                                    type="number"
                                    placeholder="5,000,000"
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-5 font-black text-xl"
                                    value={adjustmentAmount}
                                    onChange={e => setAdjustmentAmount(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Description</label>
                                <textarea
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-4 text-sm"
                                    value={adjustmentDesc}
                                    onChange={e => setAdjustmentDesc(e.target.value)}
                                    rows={2}
                                />
                            </div>
                        </div>

                        <div className="flex gap-4 mt-8">
                            <button onClick={() => setShowAdjustmentModal(false)} className="flex-1 py-4 font-black text-slate-400 uppercase text-xs">Cancel</button>
                            <button onClick={handleVaultAdjustment} className="flex-1 bg-purple-600 text-white rounded-[1.5rem] font-black py-4 shadow-xl shadow-purple-600/20">INJECT CAPITAL</button>
                        </div>
                    </div>
                </div>
            )}

            {/* System Sync Wizard Modal */}
            {showSyncWizard && (
                <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[150] flex items-start justify-center overflow-y-auto p-4 pt-12">
                    <div className="w-full max-w-3xl relative animate-in zoom-in-95 duration-300">
                        <button
                            onClick={() => setShowSyncWizard(false)}
                            className="absolute -top-4 -right-4 z-[160] bg-white dark:bg-slate-800 rounded-full p-3 shadow-2xl border border-slate-200 dark:border-slate-700 hover:rotate-90 transition-all"
                        >
                            <XMarkIcon className="w-6 h-6 text-slate-600 dark:text-slate-400" />
                        </button>
                        <SystemInitWizard onComplete={() => { setShowSyncWizard(false); fetchAllData() }} />
                    </div>
                </div>
            )}
        </div>
    )
}
