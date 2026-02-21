import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    ArrowLeftIcon,
    DocumentCheckIcon,
    UserIcon,
    BanknotesIcon,
    CheckCircleIcon,
    XCircleIcon,
    ArrowPathIcon,
    PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import { loansApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { formatCurrency, formatDate } from '../utils/formatters'
import toast from 'react-hot-toast'

type ModalAction = 'approve' | 'reject' | 'return' | 'submit' | 'disburse' | null

export default function LoanDetail() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { user } = useAuthStore()
    const [loan, setLoan] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [activeModal, setActiveModal] = useState<ModalAction>(null)
    const [reason, setReason] = useState('')

    const fetchLoan = async () => {
        try {
            if (!id) return
            const res = await loansApi.getApplication(parseInt(id))
            setLoan(res.data)
        } catch (error) {
            toast.error('Failed to load loan details.')
            navigate('/loans')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchLoan()
    }, [id])

    // ── Role helpers ──
    const role = user?.role || ''
    const isCreditOfficer = role === 'CREDIT_OFFICER'
    const isManager = ['BRANCH_MANAGER', 'OPS_MANAGER', 'OPS_DIRECTOR'].includes(role)
    const isDirector = role === 'OPS_DIRECTOR'
    const isBoardMember = role === 'BOARD_MEMBER'
    const isTeller = role === 'TELLER'

    // ── Unified action handler ──
    const executeAction = async () => {
        if (!activeModal || !loan) return

        // Require reason for reject and return
        if ((activeModal === 'reject' || activeModal === 'return') && !reason.trim()) {
            toast.error('A reason is required.')
            return
        }

        setActionLoading(true)
        try {
            switch (activeModal) {
                case 'submit':
                    await loansApi.submit(loan.id)
                    toast.success('Loan submitted for review. Guarantor liens placed.')
                    break
                case 'approve':
                    await loansApi.approve(loan.id, { approved: true, reason: 'Approved' })
                    toast.success('Loan approved successfully!')
                    break
                case 'reject':
                    await loansApi.approve(loan.id, { approved: false, reason })
                    toast.success('Loan rejected.')
                    break
                case 'return':
                    await loansApi.returnApplication(loan.id, reason)
                    toast.success('Loan returned to Credit Officer for correction.')
                    break
                case 'disburse':
                    await loansApi.disburse(loan.id, 1)
                    toast.success('Loan disbursed! Member can now withdraw funds.')
                    break
            }
            setActiveModal(null)
            setReason('')
            await fetchLoan()
        } catch (error: any) {
            const msg = error?.response?.data?.detail
            toast.error(typeof msg === 'string' ? msg : `Failed to ${activeModal} loan`)
        } finally {
            setActionLoading(false)
        }
    }

    // ── Modal config per action ──
    const modalConfig: Record<string, { title: string; description: string; color: string; btnText: string; needsReason: boolean }> = {
        approve: {
            title: 'Approve Loan Application',
            description: `Are you sure you want to approve this loan for ${loan ? formatCurrency(loan.principal_amount) : ''}? This action will advance the loan to the next approval tier or mark it ready for disbursement.`,
            color: 'green',
            btnText: 'Confirm Approval',
            needsReason: false,
        },
        reject: {
            title: 'Reject Loan Application',
            description: 'This will permanently reject the application. Guarantor liens will be released.',
            color: 'red',
            btnText: 'Confirm Rejection',
            needsReason: true,
        },
        return: {
            title: 'Return for Correction',
            description: 'This will send the application back to the Credit Officer for correction. Guarantor liens will be released.',
            color: 'yellow',
            btnText: 'Confirm Return',
            needsReason: true,
        },
        submit: {
            title: 'Submit for Manager Review',
            description: 'This will submit the loan application for manager review. Guarantor savings will be placed on hold (lien).',
            color: 'blue',
            btnText: 'Confirm Submission',
            needsReason: false,
        },
        disburse: {
            title: 'Disburse Loan',
            description: `Are you sure you want to disburse ${loan ? formatCurrency(loan.principal_amount) : ''} to the member's savings account? This action cannot be undone.`,
            color: 'emerald',
            btnText: 'Confirm Disbursement',
            needsReason: false,
        },
    }

    // ── Determine which action buttons to show ──
    const renderActionButtons = () => {
        if (!loan) return null
        const loanStatus = loan.status

        // Credit Officer: Submit DRAFT or RETURNED loans
        if (isCreditOfficer && (loanStatus === 'DRAFT' || loanStatus === 'RETURNED')) {
            return (
                <button
                    onClick={() => setActiveModal('submit')}
                    disabled={actionLoading}
                    className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-all disabled:opacity-50"
                >
                    <PaperAirplaneIcon className="h-5 w-5 mr-2" />
                    Submit for Review
                </button>
            )
        }

        // Manager: Approve / Reject / Return for PENDING_REVIEW loans
        if (isManager && loanStatus === 'PENDING_REVIEW') {
            // Prevent users from approving their own loans (Four-Eyes Principle)
            if (loan.applied_by === user?.id) {
                return (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-300 flex items-center">
                        <span className="font-bold mr-2">Four-Eyes Principle:</span>
                        You cannot approve or review this loan because you are the applicant. Another manager must review it.
                    </div>
                )
            }

            const amount = loan.principal_amount || 0
            const needsTier2 = amount > 1000000
            const needsTier3 = amount > 5000000 || loan.is_insider_loan
            const canApprove = needsTier2 ? isDirector : true
            const tier3AppliedButNotComplete = needsTier3 && !(loan.board_approval_1_by && loan.board_approval_2_by)

            return (
                <div className="flex flex-wrap gap-3">
                    {canApprove && !tier3AppliedButNotComplete && (
                        <button
                            onClick={() => setActiveModal('approve')}
                            disabled={actionLoading}
                            className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-green-600 hover:bg-green-700 shadow-md transition-all disabled:opacity-50"
                        >
                            <CheckCircleIcon className="h-5 w-5 mr-2" />
                            Approve
                        </button>
                    )}
                    {needsTier2 && !isDirector && (
                        <span className="inline-flex items-center px-4 py-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                            ⚠️ Tier 2 loan — requires Ops Director approval
                        </span>
                    )}
                    {needsTier3 && (
                        <span className="inline-flex items-center px-4 py-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            🔒 Tier 3 — requires Board multi-signature
                        </span>
                    )}
                    <button
                        onClick={() => { setActiveModal('return'); setReason('') }}
                        disabled={actionLoading}
                        className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-yellow-500 hover:bg-yellow-600 shadow-md transition-all disabled:opacity-50"
                    >
                        <ArrowPathIcon className="h-5 w-5 mr-2" />
                        Return for Correction
                    </button>
                    <button
                        onClick={() => { setActiveModal('reject'); setReason('') }}
                        disabled={actionLoading}
                        className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 shadow-md transition-all disabled:opacity-50"
                    >
                        <XCircleIcon className="h-5 w-5 mr-2" />
                        Reject
                    </button>
                </div>
            )
        }

        // Board Member: Multi-sig approve for Tier 3 / Insider loans
        if (isBoardMember && loanStatus === 'PENDING_REVIEW') {
            const amount = loan.principal_amount || 0
            const needsTier3 = amount > 5000000 || loan.is_insider_loan
            if (!needsTier3) return null

            return (
                <button
                    onClick={() => setActiveModal('approve')}
                    disabled={actionLoading}
                    className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-md transition-all disabled:opacity-50"
                >
                    <CheckCircleIcon className="h-5 w-5 mr-2" />
                    Board Approve (Digital Signature)
                </button>
            )
        }

        // Teller: Disburse approved loans
        if (isTeller && loanStatus === 'APPROVED_AWAITING_DISBURSEMENT') {
            return (
                <button
                    onClick={() => setActiveModal('disburse')}
                    disabled={actionLoading}
                    className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all disabled:opacity-50"
                >
                    <BanknotesIcon className="h-5 w-5 mr-2" />
                    Disburse to Member Savings
                </button>
            )
        }

        return null
    }

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600"></div>
            </div>
        )
    }

    if (!loan) return null

    const colorMap: Record<string, string> = {
        green: 'bg-green-600 hover:bg-green-700',
        red: 'bg-red-600 hover:bg-red-700',
        yellow: 'bg-yellow-500 hover:bg-yellow-600',
        blue: 'bg-blue-600 hover:bg-blue-700',
        emerald: 'bg-emerald-600 hover:bg-emerald-700',
    }

    return (
        <div className="space-y-6">
            {/* Header with Status Badge */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => navigate(-1)}
                        className="rounded-full p-2 text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-500 dark:hover:text-slate-300 transition-colors"
                    >
                        <ArrowLeftIcon className="h-5 w-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Loan #{loan.loan_number}
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-slate-400">
                            Applied on {formatDate(loan.application_date)}
                        </p>
                    </div>
                </div>
                <div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${loan.status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                        loan.status === 'DRAFT' ? 'bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-300' :
                            loan.status === 'PENDING_REVIEW' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400' :
                                loan.status === 'APPROVED_AWAITING_DISBURSEMENT' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' :
                                    loan.status === 'RETURNED' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300' :
                                        loan.status === 'REJECTED' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
                                            'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                        }`}>
                        {loan.status}
                    </span>
                </div>
            </div>

            {/* ── ACTION BUTTONS (role-based) ── */}
            {renderActionButtons() && (
                <div className="card bg-gradient-to-r from-gray-50 to-white dark:from-slate-800 dark:to-slate-900 border-l-4 border-l-primary-500">
                    <div className="card-body">
                        <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase mb-3">
                            Action Required — {role.replace(/_/g, ' ')}
                        </p>
                        {renderActionButtons()}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Loan Overview */}
                <div className="card md:col-span-2">
                    <div className="card-header border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
                            <BanknotesIcon className="h-5 w-5 mr-2 text-primary-500 dark:text-primary-400" />
                            Financial Summary
                        </h3>
                    </div>
                    <div className="card-body">
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                            <div>
                                <dt className="text-sm font-medium text-gray-500 dark:text-slate-400">Principal Requested</dt>
                                <dd className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(loan.principal_amount || loan.amount)}</dd>
                            </div>
                            <div>
                                <dt className="text-sm font-medium text-gray-500 dark:text-slate-400">Interest Rate</dt>
                                <dd className="mt-1 text-lg font-medium text-gray-900 dark:text-white">{loan.interest_rate}% Annually</dd>
                            </div>
                            <div>
                                <dt className="text-sm font-medium text-gray-500 dark:text-slate-400">Term</dt>
                                <dd className="mt-1 text-lg font-medium text-gray-900 dark:text-white">{loan.term_months} Months</dd>
                            </div>
                            <div>
                                <dt className="text-sm font-medium text-gray-500 dark:text-slate-400">COBAC Insider Lending</dt>
                                <dd className="mt-1 text-lg font-medium text-gray-900 dark:text-white">
                                    {loan.is_insider_loan ? (
                                        <span className="text-red-600 dark:text-red-400 font-bold">YES (Rule A applies)</span>
                                    ) : (
                                        <span className="text-green-600 dark:text-green-400">No</span>
                                    )}
                                </dd>
                            </div>
                            {(loan.status === 'ACTIVE' || loan.status === 'DELINQUENT') && (
                                <>
                                    <div>
                                        <dt className="text-sm font-medium text-gray-500 dark:text-slate-400">Total Due</dt>
                                        <dd className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(loan.total_due)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-sm font-medium text-gray-500 dark:text-slate-400">Amount Paid</dt>
                                        <dd className="mt-1 text-lg font-medium text-green-700 dark:text-green-400">{formatCurrency(loan.amount_paid)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-sm font-medium text-gray-500 dark:text-slate-400">Outstanding</dt>
                                        <dd className="mt-1 text-lg font-bold text-red-700 dark:text-red-400">{formatCurrency(loan.amount_outstanding)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-sm font-medium text-gray-500 dark:text-slate-400">Delinquency</dt>
                                        <dd className={`mt-1 text-lg font-medium ${loan.delinquency_days > 0 ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
                                            {loan.delinquency_days || 0} days
                                        </dd>
                                    </div>
                                </>
                            )}
                            <div className="sm:col-span-2">
                                <dt className="text-sm font-medium text-gray-500 dark:text-slate-400">Purpose</dt>
                                <dd className="mt-1 text-sm text-gray-900 dark:text-slate-200">{loan.purpose || 'N/A'}</dd>
                            </div>
                        </dl>
                    </div>
                </div>

                {/* Applicant Info */}
                <div className="card">
                    <div className="card-header border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
                            <UserIcon className="h-5 w-5 mr-2 text-primary-500 dark:text-primary-400" />
                            Applicant
                        </h3>
                    </div>
                    <div className="card-body">
                        <div className="flex items-center space-x-3 mb-4">
                            <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold text-lg">
                                {loan.member_name ? loan.member_name.charAt(0) : 'M'}
                            </div>
                            <div>
                                <p className="font-medium text-gray-900 dark:text-white">{loan.member_name}</p>
                                <p className="text-xs text-gray-500 dark:text-slate-400">Member #{loan.member_id}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => navigate(`/members/${loan.member_id}`)}
                            className="w-full text-center text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium py-2 rounded border border-primary-200 dark:border-slate-700 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-colors"
                        >
                            View Full Member Profile
                        </button>
                    </div>
                </div>

                {/* Approvals Tracking */}
                <div className="card md:col-span-3">
                    <div className="card-header border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
                            <DocumentCheckIcon className="h-5 w-5 mr-2 text-primary-500 dark:text-primary-400" />
                            COBAC Tiered Approval Matrix
                        </h3>
                    </div>
                    <div className="card-body">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className={`p-4 rounded border transition-colors ${loan.approved_by ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10' : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40'}`}>
                                <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Tier 1: Branch Manager</p>
                                <p className="text-xs text-gray-400 dark:text-slate-500 mb-2">Up to FCFA 1,000,000</p>
                                <p className="font-bold text-gray-900 dark:text-white">
                                    {loan.approved_by ? '✅ Approved' : 'Pending'}
                                </p>
                            </div>
                            <div className={`p-4 rounded border transition-colors ${loan.tier2_approved_by ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10' : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40'}`}>
                                <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Tier 2: Ops Director</p>
                                <p className="text-xs text-gray-400 dark:text-slate-500 mb-2">FCFA 1,000,001 – 5,000,000</p>
                                <p className="font-bold text-gray-900 dark:text-white">
                                    {loan.tier2_approved_by ? '✅ Approved' : (loan.principal_amount || loan.amount) > 1000000 ? 'Pending' : 'Not Required'}
                                </p>
                            </div>
                            <div className={`p-4 rounded border transition-colors ${loan.board_approval_1_by && loan.board_approval_2_by ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10' : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40'}`}>
                                <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Tier 3: Board Multi-Sig</p>
                                <p className="text-xs text-gray-400 dark:text-slate-500 mb-2">Above FCFA 5,000,000 or Insider Loan</p>
                                <p className="font-bold text-gray-900 dark:text-white">
                                    {loan.board_approval_1_by && loan.board_approval_2_by ? '✅ Signed (2/2)' :
                                        loan.board_approval_1_by ? '⏳ Pending 2nd Signature (1/2)' :
                                            ((loan.principal_amount || loan.amount) > 5000000 || loan.is_insider_loan) ? 'Pending (0/2)' : 'Not Required'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Guarantors */}
                {loan.guarantors && loan.guarantors.length > 0 && (
                    <div className="card md:col-span-3">
                        <div className="card-header border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Guarantors (Account Holds)</h3>
                        </div>
                        <div className="card-body p-0">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                                <thead className="bg-gray-50 dark:bg-slate-800/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Guarantor</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Guarantee Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-slate-700">
                                    {loan.guarantors.map((g: any, i: number) => (
                                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-slate-200">Member #{g.member_id}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400 font-bold">{formatCurrency(g.guarantee_amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Unified Confirmation Modal ── */}
            {activeModal && modalConfig[activeModal] && (
                <div className="fixed inset-0 bg-gray-600 dark:bg-black bg-opacity-50 dark:bg-opacity-70 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
                    <div className="relative p-6 border dark:border-slate-700 w-full max-w-md shadow-2xl rounded-xl bg-white dark:bg-slate-900 mx-4">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                            {modalConfig[activeModal].title}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
                            {modalConfig[activeModal].description}
                        </p>
                        {modalConfig[activeModal].needsReason && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Reason *</label>
                                <textarea
                                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg p-3 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
                                    rows={3}
                                    placeholder={activeModal === 'reject' ? 'e.g. Member has active defaults...' : 'e.g. Collateral photo is blurry, please re-upload...'}
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        )}
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => { setActiveModal(null); setReason('') }}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={executeAction}
                                disabled={actionLoading || (modalConfig[activeModal].needsReason && !reason.trim())}
                                className={`px-4 py-2 text-sm font-bold text-white rounded-lg transition-all disabled:opacity-50 ${colorMap[modalConfig[activeModal].color] || 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                                {actionLoading ? 'Processing...' : modalConfig[activeModal].btnText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
