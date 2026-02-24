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
import { usersApi, loansApi, transactionsApi, reportsApi, queueApi, opsApi, eodApi } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { formatCurrency } from '../../utils/formatters'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import LoanProductsConfig from './LoanProductsConfig'
import EODWizard from './EODWizard'

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

    // Zone 2: Liquidity Data
    const [liquidity, setLiquidity] = useState<any>(null)
    const [liquidityRatio, setLiquidityRatio] = useState<any>({ ratio: 104.5, status: 'COMPLIANT' })

    // Zone 3: Health & Queue
    const [queueStats, setQueueStats] = useState<any>(null)
    const [branchStatus, setBranchStatus] = useState<string>('OPEN')

    // State UI
    const [loading, setLoading] = useState(true)
    const [showEODWizard, setShowEODWizard] = useState(false)
    const [showConfig, setShowConfig] = useState(false)
    const [overrideModal, setOverrideModal] = useState<OverrideRequest | null>(null)
    const [managerPin, setManagerPin] = useState('')
    const [limit, setLimit] = useState(0)
    const [selectedUser, setSelectedUser] = useState<any>(null)

    const wsRef = useRef<WebSocket | null>(null)

    const fetchAllData = async () => {
        try {
            const [usersRes, loansRes, overridesRes, liqRes, qRes, eodRes] = await Promise.all([
                usersApi.getAll(),
                loansApi.getAll({ status: 'PENDING_REVIEW' }),
                opsApi.getOverrideRequests({ branch_id: branchId }),
                opsApi.getLiquidity(branchId),
                queueApi.getStats().catch(() => ({ data: null })),
                eodApi.getStatus()
            ])

            setPendingUsers(usersRes.data.filter((u: any) => u.approval_status === 'PENDING') || [])
            setLoanApplications(loansRes.data?.applications || loansRes.data || [])
            setOverrideRequests(overridesRes.data || [])
            setLiquidity(liqRes.data || null)
            setQueueStats(qRes.data || null)
            setBranchStatus(eodRes.data?.is_closed ? 'CLOSED' : (eodRes.data?.eod_locked ? 'EOD_IN_PROGRESS' : 'OPEN'))

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

        // WebSocket for live override alerts — backend endpoint: /ws/branch/{branch_id}
        let ws: WebSocket | null = null
        try {
            const wsUrl = opsApi.getOpsInboxWebSocketUrl(branchId)
            ws = new WebSocket(wsUrl)
            wsRef.current = ws

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    if (data.type === 'TELLER_OVERRIDE_REQUEST' || data.type === 'TELLER_OVERRIDE_RESOLVED' || data.type === 'TELLER_OVERRIDE_APPROVED' || data.type === 'TELLER_OVERRIDE_REJECTED') {
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
            if (wsRef.current) {
                wsRef.current.close()
                wsRef.current = null
            }
        }
    }, [branchId])

    const handleApproveOverride = async () => {
        if (!overrideModal || !managerPin) return
        try {
            await opsApi.approveOverride(overrideModal.id, { manager_pin: managerPin })
            toast.success('Transaction Approved Remotely')
            setOverrideModal(null)
            setManagerPin('')
            fetchAllData()
        } catch (e: any) {
            toast.error(e.response?.data?.detail || 'Approval failed')
        }
    }

    const handleRejectOverride = async (id: number) => {
        try {
            await opsApi.rejectOverride(id)
            toast.success('Override Rejected')
            fetchAllData()
        } catch (e) {
            toast.error('Failed to reject')
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
                                {overrideRequests.length + pendingUsers.length + loanApplications.length} Items
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
                                                    onClick={() => setOverrideModal(req)}
                                                    className="bg-red-600 text-white px-6 py-2 rounded-2xl font-bold text-sm hover:bg-red-700 shadow-lg shadow-red-500/20"
                                                >
                                                    Approve REMOTELY
                                                </button>
                                                <button
                                                    onClick={() => handleRejectOverride(req.id)}
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
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-xl">
                                    <BanknotesIcon className="h-5 w-5 text-green-600" />
                                </div>
                                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Liquidity Matrix</h2>
                            </div>
                            <div className="space-y-6">
                                <div className="p-8 bg-slate-900 dark:bg-indigo-950 rounded-[2rem] text-white shadow-2xl shadow-indigo-500/10">
                                    <p className="text-[10px] font-black uppercase text-indigo-300 tracking-widest mb-1">Branch Vault</p>
                                    <p className="text-4xl font-black tracking-tighter">{formatCurrency(liquidity?.main_vault || 0)}</p>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between">
                                        <span>Teller Drawers</span>
                                        <button onClick={fetchAllData} className="p-1 hover:bg-slate-100 rounded-full"><ArrowPathIcon className="h-3 w-3" /></button>
                                    </h4>
                                    {liquidity?.teller_drawers?.map((drawer: any) => (
                                        <div key={drawer.teller_id} className={`p-5 rounded-[1.5rem] border transition-all ${drawer.approaching_limit
                                            ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/10'
                                            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'
                                            }`}>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="text-xs font-bold text-slate-500">{drawer.counter}</p>
                                                    <p className="text-xl font-black text-slate-900 dark:text-white">{formatCurrency(drawer.balance)}</p>
                                                </div>
                                                {drawer.approaching_limit && (
                                                    <div className="h-8 w-8 bg-amber-100 rounded-full flex items-center justify-center animate-bounce">
                                                        <ExclamationTriangleIcon className="h-4 w-4 text-amber-600" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
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
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Remote Approval</h3>
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
                            <button onClick={handleApproveOverride} className="flex-1 bg-red-600 text-white rounded-[1.5rem] font-black py-4 shadow-xl shadow-red-600/20 active:scale-95 transition-all">SIGN & APPROVE</button>
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
        </div>
    )
}
