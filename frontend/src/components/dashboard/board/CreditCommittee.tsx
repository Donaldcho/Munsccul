import { useState, useEffect } from 'react'
import {
    UserIcon,
    HomeIcon,
    ClipboardDocumentCheckIcon,
    ChatBubbleLeftEllipsisIcon,
    PhotoIcon,
    CheckCircleIcon,
    XCircleIcon,
    QuestionMarkCircleIcon,
    ClockIcon
} from '@heroicons/react/24/outline'
import { loansApi } from '../../../services/api'
import { formatCurrency, formatDate } from '../../../utils/formatters'
import toast from 'react-hot-toast'

export default function CreditCommittee() {
    const [loans, setLoans] = useState<any[]>([])
    const [selectedLoan, setSelectedLoan] = useState<any>(null)
    const [dossier, setDossier] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [dossierLoading, setDossierLoading] = useState(false)
    const [pinModal, setPinModal] = useState(false)
    const [rejectModal, setRejectModal] = useState(false)
    const [infoModal, setInfoModal] = useState(false)
    const [comment, setComment] = useState('')

    useEffect(() => {
        fetchLoans()
    }, [])

    useEffect(() => {
        if (selectedLoan && selectedLoan.id) {
            fetchDossier(selectedLoan.id)
        }
    }, [selectedLoan])

    const fetchLoans = async () => {
        setLoading(true)
        try {
            const res = await loansApi.getAll({ status: 'PENDING_REVIEW' })
            // Filter for Tier 3 (Principal > 5M or Insider)
            const tier3 = res.data.filter((l: any) =>
                (l.principal_amount || l.amount) > 5000000 || l.is_insider_loan
            )
            setLoans(tier3)
            if (tier3.length > 0) setSelectedLoan(tier3[0])
        } catch (err) {
            toast.error('Failed to fetch loan applications')
        } finally {
            setLoading(false)
        }
    }

    const fetchDossier = async (id: number) => {
        setDossierLoading(true)
        try {
            const res = await loansApi.getDossier(id)
            setDossier(res.data)
        } catch (err) {
            toast.error('Failed to fetch dossier details')
        } finally {
            setDossierLoading(false)
        }
    }

    // Action Handlers
    const handleApprove = () => setPinModal(true)
    const handleReject = () => setRejectModal(true)
    const handleRequestInfo = () => setInfoModal(true)

    const confirmAction = async (action: 'approve' | 'reject' | 'info') => {
        try {
            if (action === 'approve') {
                await loansApi.approve(selectedLoan.id, { approved: true, reason: 'Board Approved' })
                toast.success('Signature cast successfully')
            } else if (action === 'reject') {
                await loansApi.approve(selectedLoan.id, { approved: false, reason: comment })
                toast.success('Application rejected')
            } else {
                toast.success('Information requested from Ops Manager')
            }
            setPinModal(false)
            setRejectModal(false)
            setInfoModal(false)
            setComment('')
            fetchLoans()
        } catch (err) {
            toast.error('Failed to process action')
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
            </div>
        )
    }

    return (
        <div className="flex h-[calc(100vh-14rem)] bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            {/* List Pane */}
            <div className="w-1/3 border-r border-slate-800 overflow-y-auto custom-scrollbar bg-slate-900/50">
                <div className="p-6 border-b border-slate-800 sticky top-0 bg-slate-900/80 backdrop-blur z-10">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Pending Review ({loans.length})</h3>
                </div>
                <div className="divide-y divide-slate-800/50">
                    {loans.map((loan) => (
                        <button
                            key={loan.id}
                            onClick={() => setSelectedLoan(loan)}
                            className={`w-full text-left p-6 transition-all border-l-4 ${selectedLoan?.id === loan.id ? 'bg-indigo-600/10 border-indigo-500' : 'hover:bg-slate-800/30 border-transparent'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-sm font-bold text-white">#{loan.loan_number}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                                    {formatDate(loan.application_date)}
                                </span>
                            </div>
                            <p className="text-lg font-bold text-white mb-1">{formatCurrency(loan.principal_amount || loan.amount)}</p>
                            <p className="text-xs text-slate-400 truncate">{loan.member_name}</p>
                            <div className="mt-3 flex items-center text-[10px] font-bold text-amber-500 space-x-1">
                                <ClockIcon className="h-3 w-3" />
                                <span>3 DAYS WAITING</span>
                            </div>
                        </button>
                    ))}
                    {loans.length === 0 && (
                        <div className="p-10 text-center text-slate-500">
                            <ClipboardDocumentCheckIcon className="h-10 w-10 mx-auto mb-4 opacity-20" />
                            <p className="text-sm">Inbox cleared. No Tier 3 loans pending signature.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Dossier Pane */}
            {selectedLoan ? (
                <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
                    <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                        {/* Dossier Header */}
                        <div className="flex items-center justify-between mb-10 pb-10 border-b border-slate-800">
                            <div>
                                <h2 className="text-2xl font-bold text-white mb-2">Loan Dossier</h2>
                                <div className="flex items-center space-x-4">
                                    <span className="text-xs font-bold text-indigo-400 px-2 py-1 bg-indigo-500/10 rounded uppercase tracking-tighter">Tier 3 Review</span>
                                    <span className="h-1 w-1 bg-slate-700 rounded-full"></span>
                                    <span className="text-xs text-slate-500 font-medium">Ref: {selectedLoan.loan_number}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-slate-500 font-bold uppercase mb-1">Status</p>
                                <span className="px-3 py-1 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-500 border border-amber-500/30 uppercase tracking-widest">Awaiting Board Vote</span>
                            </div>
                        </div>

                        <div className="space-y-12">
                            {/* Section A: Applicant Scorecard */}
                            <div>
                                <div className="flex items-center space-x-3 mb-6">
                                    <UserIcon className="h-5 w-5 text-indigo-500" />
                                    <h3 className="text-lg font-bold text-white uppercase tracking-wider">A. Applicant Scorecard</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div className="p-5 bg-slate-900/50 rounded-2xl border border-slate-800">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-2">Member Tenure</p>
                                        <p className="text-lg font-bold text-white">
                                            {dossierLoading ? '...' :
                                                dossier ? `${Math.floor(dossier.member_tenure_months / 12)}Y, ${dossier.member_tenure_months % 12}M` : 'N/A'}
                                        </p>
                                    </div>
                                    <div className="p-5 bg-slate-900/50 rounded-2xl border border-slate-800">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-2">Total Savings</p>
                                        <p className="text-lg font-bold text-emerald-400">
                                            {dossierLoading ? '...' : formatCurrency(dossier?.total_savings || 0)}
                                        </p>
                                    </div>
                                    <div className="p-5 bg-slate-900/50 rounded-2xl border border-slate-800">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-2">Credit History</p>
                                        <div className="flex items-center space-x-2">
                                            {dossier?.loan_history?.delinquency_history ? (
                                                <XCircleIcon className="h-4 w-4 text-rose-500" />
                                            ) : (
                                                <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
                                            )}
                                            <p className="text-sm font-bold text-white">
                                                {dossierLoading ? '...' : `${dossier?.loan_history?.fully_repaid || 0} Repaid`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="p-5 bg-slate-900/50 rounded-2xl border border-slate-800">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-2">Applicant Role</p>
                                        <p className="text-lg font-bold text-white group-hover:text-indigo-400">
                                            {selectedLoan.is_insider_loan ? 'INSIDER' : 'STANDARD'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Section B: Collateral */}
                            <div>
                                <div className="flex items-center space-x-3 mb-6">
                                    <PhotoIcon className="h-5 w-5 text-indigo-500" />
                                    <h3 className="text-lg font-bold text-white uppercase tracking-wider">B. Collateral Portfolio</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {dossier?.collateral?.map((col: any, idx: number) => (
                                        <div key={idx} className="group relative rounded-2xl overflow-hidden h-48 bg-slate-900 border border-slate-800 cursor-pointer">
                                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent flex items-end p-4">
                                                <p className="text-xs font-bold text-white">{col.type}: {col.description}</p>
                                            </div>
                                            <div className="w-full h-full flex items-center justify-center text-slate-700">
                                                <HomeIcon className="h-12 w-12" />
                                            </div>
                                        </div>
                                    ))}
                                    <div className="p-6 bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col justify-center">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-2">Total Value</p>
                                        <p className="text-2xl font-bold text-white">
                                            {formatCurrency(dossier?.collateral?.reduce((acc: number, c: any) => acc + c.value, 0) || 0)}
                                        </p>
                                    </div>
                                    <div className="p-6 bg-slate-900/50 rounded-2xl border border-amber-500/20 flex flex-col justify-center">
                                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-2">LTV Ratio</p>
                                        <p className="text-2xl font-bold text-amber-500">
                                            {dossier ?
                                                ((selectedLoan.principal_amount / dossier.total_savings) * 10).toFixed(1) : '---'}%
                                        </p>
                                        <p className="text-xs text-amber-500/60 mt-2 font-medium">Automatic Lien Placement</p>
                                    </div>
                                </div>
                            </div>

                            {/* Section C: Recommendation */}
                            <div>
                                <div className="flex items-center space-x-3 mb-6">
                                    <ChatBubbleLeftEllipsisIcon className="h-5 w-5 text-indigo-500" />
                                    <h3 className="text-lg font-bold text-white uppercase tracking-wider">C. Management Recommendation</h3>
                                </div>
                                <div className="p-8 bg-indigo-950/20 border border-indigo-500/20 rounded-2xl">
                                    <div className="flex items-start space-x-4">
                                        <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0">OM</div>
                                        <div>
                                            <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Ops Manager Memo</p>
                                            <p className="text-sm text-slate-300 leading-relaxed italic">
                                                "The applicant is a long-standing member with a impeccable track record. The loan is intended for business expansion in the agriculture sector. Given the strong collateral coverage and steady cash flows, I highly recommend approval for the full amount."
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Voting mechanism */}
                    <div className="h-24 bg-slate-900/80 backdrop-blur-xl border-t border-slate-800 flex items-center justify-center space-x-6 px-10">
                        <button
                            onClick={handleReject}
                            className="px-8 py-3.5 flex items-center bg-rose-500/10 text-rose-500 rounded-2xl border border-rose-500/20 hover:bg-rose-500 hover:text-white transition-all duration-300 font-bold text-sm uppercase tracking-widest min-w-[140px]"
                        >
                            <XCircleIcon className="h-5 w-5 mr-3" />
                            Reject
                        </button>
                        <button
                            onClick={handleRequestInfo}
                            className="px-8 py-3.5 flex items-center bg-slate-800 text-slate-300 rounded-2xl border border-slate-700 hover:bg-slate-700 transition-all duration-300 font-bold text-sm uppercase tracking-widest min-w-[140px]"
                        >
                            <QuestionMarkCircleIcon className="h-5 w-5 mr-3" />
                            Request Info
                        </button>
                        <button
                            onClick={handleApprove}
                            className="px-8 py-3.5 flex items-center bg-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all duration-300 font-bold text-sm uppercase tracking-widest min-w-[140px]"
                        >
                            <CheckCircleIcon className="h-5 w-5 mr-3" />
                            Approve
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 bg-slate-950/30">
                    <ClipboardDocumentCheckIcon className="h-20 w-20 mb-6 opacity-10" />
                    <p className="text-lg font-medium">Select a dossier to review</p>
                </div>
            )}

            {/* Approval Modal (PIN) */}
            {pinModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-2 text-center text-rose-300">Secure Digital Signature</h3>
                        <p className="text-xs text-slate-500 text-center mb-8 uppercase tracking-widest font-bold">Board Authorization Required</p>
                        <div className="space-y-4">
                            <input
                                type="password"
                                placeholder="Enter 4-Digit Digital PIN"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-4 text-center text-2xl tracking-[1em] text-white focus:outline-none focus:border-indigo-500 transition-colors"
                                autoFocus
                            />
                            <button
                                onClick={() => confirmAction('approve')}
                                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-all"
                            >
                                Sign & Authorize
                            </button>
                            <button
                                onClick={() => setPinModal(false)}
                                className="w-full py-2 text-slate-500 font-medium hover:text-slate-300"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Modal */}
            {rejectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-2 text-center text-red-100">Confirm Rejection</h3>
                        <p className="text-xs text-slate-500 text-center mb-8 font-bold uppercase tracking-tighter">Please provide a legal justification</p>
                        <div className="space-y-4">
                            <textarea
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="e.g. Collateral coverage insufficient for principal amount."
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-4 text-sm text-white focus:outline-none focus:border-rose-500 transition-colors h-32 resize-none"
                                autoFocus
                            />
                            <button
                                onClick={() => confirmAction('reject')}
                                disabled={!comment.trim()}
                                className="w-full py-4 bg-rose-600 text-white rounded-xl font-bold shadow-lg shadow-rose-500/20 hover:bg-rose-500 transition-all disabled:opacity-50"
                            >
                                Confirm Rejection
                            </button>
                            <button
                                onClick={() => setRejectModal(false)}
                                className="w-full py-2 text-slate-500 font-medium hover:text-slate-300"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Info Modal */}
            {infoModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
                        <h3 className="text-xl font-bold text-white mb-2 text-center text-indigo-100">Query Ops Manager</h3>
                        <p className="text-xs text-slate-500 text-center mb-8 font-bold uppercase tracking-tighter">The application will be pending info</p>
                        <div className="space-y-4">
                            <textarea
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="e.g. Please upload actual land title document instead of receipt."
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-4 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors h-32 resize-none"
                                autoFocus
                            />
                            <button
                                onClick={() => confirmAction('info')}
                                disabled={!comment.trim()}
                                className="w-full py-4 bg-slate-700 text-white rounded-xl font-bold shadow-md hover:bg-slate-600 transition-all disabled:opacity-50"
                            >
                                Send Request
                            </button>
                            <button
                                onClick={() => setInfoModal(false)}
                                className="w-full py-2 text-slate-500 font-medium hover:text-slate-300"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
