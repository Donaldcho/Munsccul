import { useState, useEffect } from 'react'
import {
    CheckCircleIcon,
    ExclamationCircleIcon,
    ArrowPathIcon,
    BanknotesIcon,
    ShieldCheckIcon,
    LockClosedIcon,
    ChevronRightIcon
} from '@heroicons/react/24/outline'
import { eodApi } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'
import { getErrorMessage } from '../../utils/errorUtils'
import toast from 'react-hot-toast'

interface EODWizardProps {
    onClose: () => void
    onComplete: () => void
}

export default function EODWizard({ onClose, onComplete }: EODWizardProps) {
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [status, setStatus] = useState<any>(null)

    const fetchStatus = async () => {
        setLoading(true)
        try {
            const res = await eodApi.getStatus()
            setStatus(res.data)
            // Auto-advance if steps are already done? 
            // For now, let the user click through
        } catch (e) {
            toast.error("Failed to fetch EOD status")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStatus()
    }, [])

    const handleAccrue = async () => {
        setLoading(true)
        try {
            const res = await eodApi.accrueInterest()
            toast.success(`Interest posted: ${formatCurrency(res.data.total_interest)}`)
            fetchStatus()
            setStep(4)
        } catch (e: any) {
            toast.error(getErrorMessage(e, "Interest accrual failed"))
        } finally {
            setLoading(false)
        }
    }

    const handleFinalize = async () => {
        setLoading(true)
        try {
            const res = await eodApi.finalize()
            toast.success(res.data.message)
            onComplete()
        } catch (e: any) {
            toast.error(getErrorMessage(e, "Final closure failed"))
        } finally {
            setLoading(false)
        }
    }

    if (loading && !status) return <div className="p-8 text-center text-gray-500">Wait... Loading System State</div>

    const checklist = [
        { id: 1, name: 'Teller Reconciliation', status: status?.step_status?.step1_reconciliation },
        { id: 2, name: 'Transaction Overrides', status: status?.step_status?.step2_overrides },
        { id: 3, name: 'Interest Accrual', status: status?.step_status?.step3_interest },
        { id: 4, name: 'Final Validation & Lock', status: status?.is_closed }
    ]

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 dark:border-slate-800">
                <div className="flex">
                    {/* Left: Steps Sidebar */}
                    <div className="w-1/3 bg-slate-50 dark:bg-slate-950 p-8 border-r border-slate-200 dark:border-slate-800">
                        <h2 className="text-xl font-black text-slate-900 dark:text-white mb-8">EOD Closure Wizard</h2>
                        <nav className="space-y-6">
                            {checklist.map((s) => (
                                <div key={s.id} className={`flex items-center gap-3 ${step === s.id ? 'opacity-100' : 'opacity-40'}`}>
                                    <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm ${s.status ? 'bg-green-500 text-white' : (step === s.id ? 'bg-primary-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500')
                                        }`}>
                                        {s.status ? <CheckCircleIcon className="h-5 w-5" /> : s.id}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{s.name}</p>
                                        <p className="text-[10px] text-slate-500 uppercase">{s.status ? 'Ready' : (step === s.id ? 'In Progress' : 'Pending')}</p>
                                    </div>
                                </div>
                            ))}
                        </nav>
                        <div className="mt-12 pt-12 border-t border-slate-200 dark:border-slate-800">
                            <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800 font-bold">Cancel & Exit</button>
                        </div>
                    </div>

                    {/* Right: Active Step Workspace */}
                    <div className="flex-1 p-12">
                        {step === 1 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                <div className="h-12 w-12 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mb-4">
                                    <BanknotesIcon className="h-6 w-6 text-amber-600" />
                                </div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white">Step 1: Teller Reconciliation</h3>
                                <p className="text-slate-600 dark:text-slate-400">
                                    Ensuring all tellers have physically counted their drawers and submitted reconciliations.
                                </p>
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">System Alerts</h4>
                                    {status?.messages?.filter((m: string) => m.toLowerCase().includes('teller')).length === 0 ? (
                                        <div className="flex items-center gap-2 text-green-600 font-bold">
                                            <CheckCircleIcon className="h-5 w-5" /> All tellers reconciled
                                        </div>
                                    ) : (
                                        <ul className="space-y-2">
                                            {status?.messages?.filter((m: string) => m.toLowerCase().includes('teller')).map((m: string, i: number) => (
                                                <li key={i} className="text-sm text-red-600 font-medium flex items-center gap-2">
                                                    <ExclamationCircleIcon className="h-4 w-4" /> {m}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                <button
                                    disabled={!status?.step_status?.step1_reconciliation}
                                    onClick={() => setStep(2)}
                                    className="btn-primary w-full py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    Confirm & Continue <ChevronRightIcon className="h-4 w-4" />
                                </button>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                <div className="h-12 w-12 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mb-4">
                                    <ShieldCheckIcon className="h-6 w-6 text-red-600" />
                                </div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white">Step 2: Transaction Overrides</h3>
                                <p className="text-slate-600 dark:text-slate-400">
                                    All pending manager override requests must be either Approved or Rejected before closure.
                                </p>
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                                        Pending Overrides: {status?.step_status?.step2_overrides ? 0 : 'Resolve in Inbox first'}
                                    </p>
                                    {!status?.step_status?.step2_overrides && (
                                        <p className="text-xs text-red-500 mt-1">Found unresolved overrides block step completion.</p>
                                    )}
                                </div>
                                <div className="flex gap-4">
                                    <button onClick={() => setStep(1)} className="flex-1 py-4 text-slate-500 font-bold border rounded-2xl">Back</button>
                                    <button
                                        disabled={!status?.step_status?.step2_overrides}
                                        onClick={() => setStep(3)}
                                        className="flex-[2] btn-primary py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        Continue <ChevronRightIcon className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mb-4">
                                    <ArrowPathIcon className="h-6 w-6 text-blue-600" />
                                </div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white">Step 3: Interest Accrual</h3>
                                <p className="text-slate-600 dark:text-slate-400">
                                    System will now calculate and post daily interest for all active member savings accounts.
                                </p>
                                <div className="bg-blue-50 dark:bg-blue-900/10 p-6 rounded-2xl border border-blue-200 dark:border-blue-800">
                                    <p className="text-sm text-blue-800 dark:text-blue-300">
                                        This action is final and will generate General Ledger entries for interest expense.
                                    </p>
                                </div>
                                <div className="flex gap-4">
                                    <button onClick={() => setStep(2)} className="flex-1 py-4 text-slate-500 font-bold border rounded-2xl">Back</button>
                                    <button
                                        disabled={loading}
                                        onClick={handleAccrue}
                                        className="flex-[2] btn-primary py-4 rounded-2xl flex items-center justify-center gap-2"
                                    >
                                        {loading ? 'Processing...' : 'Accrue Interest & Post'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                <div className="h-12 w-12 bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center mb-4">
                                    <LockClosedIcon className="h-6 w-6 text-green-600" />
                                </div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white">Step 4: Finalize & Lock</h3>
                                <p className="text-slate-600 dark:text-slate-400">
                                    Branch is balanced and ready to close. Signing this will lock all financial operations for {status?.date}.
                                </p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                                        <p className="text-xs text-slate-500 font-bold uppercase">Total Debits</p>
                                        <p className="text-xl font-black">{formatCurrency(status?.total_debits)}</p>
                                    </div>
                                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                                        <p className="text-xs text-slate-500 font-bold uppercase">Total Credits</p>
                                        <p className="text-xl font-black">{formatCurrency(status?.total_credits)}</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <button onClick={() => setStep(3)} className="flex-1 py-4 text-slate-500 font-bold border rounded-2xl">Back</button>
                                    <button
                                        disabled={loading || !status?.can_close}
                                        onClick={handleFinalize}
                                        className="flex-[2] bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-4 rounded-2xl flex items-center justify-center gap-2 font-black"
                                    >
                                        {loading ? 'Locking...' : 'Sign Off & Close Day'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
