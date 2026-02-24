import { useState, useEffect } from 'react'
import {
    DocumentTextIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    PlusIcon,
    MagnifyingGlassIcon,
    UserIcon,
    ClipboardDocumentCheckIcon,
    ShieldCheckIcon,
    XCircleIcon,
    ArrowPathIcon,
    UserGroupIcon,
    TrashIcon,
    MegaphoneIcon,
    HandRaisedIcon,
    CheckBadgeIcon as VerifiedIcon
} from '@heroicons/react/24/outline'
import { loansApi, membersApi, queueApi } from '../../services/api'
import { njangiApi } from '../../services/njangiApi'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

interface CreditDashboardProps {
    loanStats: any
}

interface EligibilityCheck {
    passed: boolean
    label: string
    detail: string
}

interface EligibilityResult {
    eligible: boolean
    checks: Record<string, EligibilityCheck>
    max_loan_amount: number
    total_savings: number
    monthly_income: number | null
    member_name: string
    member_since: string
}

interface Guarantor {
    member_id: number
    member_name: string
    guarantee_amount: string
}

const WIZARD_STEPS = [
    { num: 1, label: 'Member' },
    { num: 2, label: 'Eligibility' },
    { num: 3, label: 'Loan Details' },
    { num: 4, label: 'Guarantors' },
    { num: 5, label: 'Review' },
]

export default function CreditDashboard({ loanStats }: CreditDashboardProps) {
    const [view, setView] = useState<'pipeline' | 'new-application' | 'njangi-genesis'>('pipeline')
    const [applications, setApplications] = useState<any[]>([])
    const [njangiGroups, setNjangiGroups] = useState<any[]>([])

    // Wizard State
    const [wizardStep, setWizardStep] = useState(1)
    const [memberQuery, setMemberQuery] = useState('')
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [selectedMember, setSelectedMember] = useState<any>(null)
    const [loanProducts, setLoanProducts] = useState<any[]>([])
    const [selectedProduct, setSelectedProduct] = useState<any>(null)
    const [amount, setAmount] = useState('')
    const [purpose, setPurpose] = useState('')
    const [termMonths, setTermMonths] = useState('')
    const [submitting, setSubmitting] = useState(false)

    // KYC / Clean Room State
    const [cleanRoom, setCleanRoom] = useState(false)
    const [pendingCount, setPendingCount] = useState({ members: 5, loans: 12 })

    // Eligibility State
    const [eligibility, setEligibility] = useState<EligibilityResult | null>(null)
    const [checkingEligibility, setCheckingEligibility] = useState(false)

    // Queue State
    const [currentTicket, setCurrentTicket] = useState<any>(null)
    const [queueLoading, setQueueLoading] = useState(false)
    const [guarantors, setGuarantors] = useState<Guarantor[]>([])
    const [guarantorQuery, setGuarantorQuery] = useState('')
    const [guarantorResults, setGuarantorResults] = useState<any[]>([])

    useEffect(() => {
        fetchApplications()
        fetchProducts()
        fetchNjangiGroups()
    }, [])

    const fetchApplications = async () => {
        try {
            const res = await loansApi.getAll()
            setApplications(res.data)
        } catch (error) {
            console.error('Failed to fetch applications')
        }
    }

    const fetchNjangiGroups = async () => {
        try {
            const res = await njangiApi.getGroups()
            setNjangiGroups(res.data)
        } catch (error) {
            console.error('Failed to fetch njangi groups')
        }
    }

    const fetchProducts = async () => {
        try {
            const res = await loansApi.getProducts()
            setLoanProducts(res.data)
        } catch (error) {
            console.error('Failed to fetch loan products')
        }
    }

    const handleCallNext = async () => {
        setQueueLoading(true)
        try {
            const counter = localStorage.getItem('credit_counter') || 'Office'
            const res = await queueApi.callNext({
                service_type: 'LOAN',
                counter_number: counter
            })
            setCurrentTicket(res.data)
            toast.success(`Called Ticket ${res.data.ticket_number}`)
        } catch (err: any) {
            // Handled by global interceptor
        } finally {
            setQueueLoading(false)
        }
    }

    const handleRecall = async () => {
        if (!currentTicket) return
        try {
            await queueApi.recall(currentTicket.id)
            toast.success('Ticket Recalled on Display')
        } catch (err) {
            toast.error('Recall failed')
        }
    }

    const handleNoShow = async () => {
        if (!currentTicket) return
        if (!confirm('Mark member as no-show?')) return
        try {
            await queueApi.noShow(currentTicket.id)
            setCurrentTicket(null)
            toast('Ticket cleared')
        } catch (err) {
            toast.error('Failed to update ticket')
        }
    }

    const handleComplete = async () => {
        if (!currentTicket) return
        try {
            await queueApi.complete(currentTicket.id)
            setCurrentTicket(null)
            toast.success('Member served')
        } catch (err) {
            toast.error('Failed to complete ticket')
        }
    }

    const handleSubmitDraft = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation()
        try {
            await loansApi.submit(id)
            toast.success('Loan submitted to Committee for review!')
            fetchApplications()
        } catch (error: any) {
            // generic error handler takes care of displaying it
        }
    }

    const handleSearchMember = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!memberQuery.trim()) return
        try {
            const res = await membersApi.search(memberQuery)
            setSearchResults(res.data)
        } catch (error) {
            toast.error('Search failed')
        }
    }

    const handleSelectMember = (member: any) => {
        setSelectedMember(member)
        setEligibility(null) // reset
        setSearchResults([])
    }

    const handleCheckEligibility = async () => {
        if (!selectedMember) return
        setCheckingEligibility(true)
        setEligibility(null)
        try {
            const res = await loansApi.checkEligibility(selectedMember.id)
            setEligibility(res.data)
        } catch (error: any) {
            toast.error('Failed to check eligibility')
        } finally {
            setCheckingEligibility(false)
        }
    }

    const handleSearchGuarantor = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!guarantorQuery.trim()) return
        try {
            const res = await membersApi.search(guarantorQuery)
            // Exclude the applicant and already-added guarantors
            const excluded = [selectedMember?.id, ...guarantors.map((g: Guarantor) => g.member_id)]
            setGuarantorResults(res.data.filter((m: any) => !excluded.includes(m.id)))
        } catch (error) {
            toast.error('Search failed')
        }
    }

    const addGuarantor = (member: any) => {
        setGuarantors((prev: Guarantor[]) => [...prev, {
            member_id: member.id,
            member_name: member.full_name || `${member.first_name} ${member.last_name}`,
            guarantee_amount: ''
        }])
        setGuarantorResults([])
        setGuarantorQuery('')
    }

    const removeGuarantor = (idx: number) => {
        setGuarantors((prev: Guarantor[]) => prev.filter((_: any, i: number) => i !== idx))
    }

    const updateGuarantorAmount = (idx: number, val: string) => {
        setGuarantors((prev: Guarantor[]) => prev.map((g: Guarantor, i: number) => i === idx ? { ...g, guarantee_amount: val } : g))
    }

    const handleSubmitApplication = async () => {
        if (!selectedMember || !selectedProduct || !amount) return
        setSubmitting(true)
        try {
            await loansApi.apply({
                member_id: selectedMember.id,
                product_id: selectedProduct.id,
                principal_amount: parseFloat(amount),
                term_months: parseInt(termMonths),
                purpose: purpose,
                guarantors: guarantors.map((g: Guarantor) => ({
                    member_id: g.member_id,
                    guarantee_amount: parseFloat(g.guarantee_amount) || 0
                }))
            })
            toast.success('Application Draft created. Please review and submit from pipeline.')
            resetWizard()
            setView('pipeline')
            fetchApplications()
        } catch (error: any) {
            // COBAC structured errors handled by api.ts interceptor
        } finally {
            setSubmitting(false)
        }
    }

    const resetWizard = () => {
        setWizardStep(1)
        setSelectedMember(null)
        setSelectedProduct(null)
        setAmount('')
        setPurpose('')
        setTermMonths('')
        setEligibility(null)
        setGuarantors([])
        setMemberQuery('')
        setGuarantorQuery('')
    }

    // ==================== RENDER: KANBAN PIPELINE ====================
    const renderKanban = () => {
        const columns = {
            draft: applications.filter(a => a.status === 'DRAFT'),
            pending: applications.filter(a => a.status === 'PENDING_REVIEW'),
            approved: applications.filter(a => ['APPROVED_AWAITING_DISBURSEMENT', 'ACTIVE', 'APPROVED'].includes(a.status)),
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full overflow-hidden">
                {/* Pending & Drafts */}
                <div className="bg-gray-100 dark:bg-slate-900/50 p-4 rounded-lg flex flex-col h-[calc(100vh-300px)] border dark:border-slate-800">
                    <h3 className="font-bold text-gray-700 dark:text-slate-300 mb-4 flex justify-between">
                        PENDING <span className="bg-yellow-200 dark:bg-yellow-900/30 px-2 rounded-full text-sm dark:text-yellow-400">{columns.draft.length + columns.pending.length}</span>
                    </h3>
                    <div className="space-y-4 overflow-y-auto flex-1 pr-2">
                        {columns.draft.map(app => (
                            <div key={app.id} className="bg-white dark:bg-slate-800 p-4 rounded shadow-sm border-l-4 border-gray-400 dark:border-slate-600 cursor-pointer hover:shadow-md transition-shadow">
                                <h4 className="font-bold text-gray-900 dark:text-white">{app.member_name || `Member #${app.member_id}`}</h4>
                                <p className="text-sm text-gray-600 dark:text-slate-400">{formatCurrency(app.principal_amount || app.amount)}</p>
                                <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">{app.application_date && format(new Date(app.application_date), 'dd MMM yyyy')}</p>
                                <span className="text-xs bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-slate-300 px-2 py-1 rounded-full mt-2 inline-block">Draft</span>
                                <button onClick={(e) => handleSubmitDraft(e, app.id)} className="mt-3 w-full btn btn-primary py-1.5 text-sm font-medium">Submit for Review</button>
                            </div>
                        ))}
                        {columns.pending.map(app => (
                            <div key={app.id} className="bg-white dark:bg-slate-800 p-4 rounded shadow-sm border-l-4 border-yellow-500 cursor-pointer hover:shadow-md transition-shadow">
                                <h4 className="font-bold text-gray-900 dark:text-white">{app.member_name || `Member #${app.member_id}`}</h4>
                                <p className="text-sm text-gray-600 dark:text-slate-400">{formatCurrency(app.principal_amount || app.amount)}</p>
                                <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">{app.application_date && format(new Date(app.application_date), 'dd MMM yyyy')}</p>
                                <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 px-2 py-1 rounded-full mt-2 inline-block">Pending Committee</span>
                            </div>
                        ))}
                        {(columns.draft.length + columns.pending.length) === 0 && (
                            <p className="text-gray-400 dark:text-slate-600 text-sm text-center py-8">No pending applications</p>
                        )}
                    </div>
                </div>

                {/* Active/Disbursed */}
                <div className="bg-gray-100 dark:bg-slate-900/50 p-4 rounded-lg flex flex-col h-[calc(100vh-300px)] border dark:border-slate-800">
                    <h3 className="font-bold text-gray-700 dark:text-slate-300 mb-4 flex justify-between">
                        ACTIVE / DISBURSED <span className="bg-green-200 dark:bg-green-900/30 px-2 rounded-full text-sm dark:text-green-400">{columns.approved.length}</span>
                    </h3>
                    <div className="space-y-4 overflow-y-auto flex-1 pr-2">
                        {columns.approved.map(app => (
                            <div key={app.id} className="bg-white dark:bg-slate-800 p-4 rounded shadow-sm border-l-4 border-green-500 cursor-pointer hover:shadow-md transition-shadow">
                                <h4 className="font-bold text-gray-900 dark:text-white">{app.member_name || `Member #${app.member_id}`}</h4>
                                <p className="text-sm text-gray-600 dark:text-slate-400">{formatCurrency(app.principal_amount || app.amount)}</p>
                                <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 px-2 py-1 rounded-full mt-2 inline-block">Active</span>
                            </div>
                        ))}
                        {columns.approved.length === 0 && (
                            <p className="text-gray-400 dark:text-slate-600 text-sm text-center py-8">No active loans</p>
                        )}
                    </div>
                </div>

                {/* Coming Soon */}
                <div className="bg-gray-100 dark:bg-slate-900/40 p-4 rounded-lg flex flex-col justify-center items-center h-[calc(100vh-300px)] border-2 border-dashed border-gray-300 dark:border-slate-700">
                    <ClipboardDocumentCheckIcon className="h-12 w-12 text-gray-300 dark:text-slate-700 mb-3" />
                    <p className="text-gray-400 dark:text-slate-600 text-center text-sm">
                        Workflow Management<br />
                        <span className="text-xs">Drag & drop coming soon</span>
                    </p>
                </div>
            </div>
        )
    }

    // ==================== RENDER: 5-STEP WIZARD ====================
    const renderWizard = () => (
        <div className="max-w-3xl mx-auto">
            {/* Wizard Header */}
            <div className="bg-white dark:bg-slate-900 rounded-t-xl border border-gray-200 dark:border-slate-800 p-5 flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">New Loan Application</h2>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Credit Officer origination wizard</p>
                </div>
                <button onClick={() => { resetWizard(); setView('pipeline') }} className="text-sm text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 px-3 py-1 rounded border border-gray-200 dark:border-slate-700 hover:border-gray-400 dark:hover:border-slate-500 transition-colors">
                    Cancel
                </button>
            </div>

            {/* Step Indicator */}
            <div className="bg-gray-50 dark:bg-slate-800/40 border-x border-gray-200 dark:border-slate-800 px-6 py-4">
                <div className="flex justify-between items-center">
                    {WIZARD_STEPS.map((step, idx) => (
                        <div key={step.num} className="flex items-center">
                            <div className={`flex flex-col items-center ${step.num <= wizardStep ? 'text-primary-600' : 'text-gray-400'}`}>
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${step.num < wizardStep ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' :
                                    step.num === wizardStep ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300' :
                                        'border-gray-300 dark:border-slate-700 text-gray-400 dark:text-slate-600'
                                    }`}>
                                    {step.num < wizardStep ? <CheckCircleIcon className="h-5 w-5 text-green-500" /> : step.num}
                                </div>
                                <span className="text-xs mt-1 font-medium">{step.label}</span>
                            </div>
                            {idx < WIZARD_STEPS.length - 1 && (
                                <div className={`w-12 h-0.5 mx-1 mt-[-12px] ${step.num < wizardStep ? 'bg-green-400 dark:bg-green-600' : 'bg-gray-300 dark:bg-slate-700'}`} />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Step Content */}
            <div className="bg-white dark:bg-slate-900 border-x border-b border-gray-200 dark:border-slate-800 rounded-b-xl p-6">

                {/* ===== STEP 1: MEMBER SEARCH ===== */}
                {wizardStep === 1 && (
                    <div className="space-y-4">
                        <h3 className="font-semibold text-gray-800 dark:text-slate-200 mb-2">Select Member</h3>
                        <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">Search for the member who is requesting the loan.</p>

                        {!selectedMember ? (
                            <>
                                <form onSubmit={handleSearchMember} className="flex gap-2">
                                    <div className="relative flex-1">
                                        <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-5 w-5 text-gray-400 dark:text-slate-500" />
                                        <input
                                            type="text"
                                            className="input pl-10"
                                            placeholder="Search by name or member ID..."
                                            value={memberQuery}
                                            onChange={e => setMemberQuery(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                    <button type="submit" className="btn btn-primary">Search</button>
                                </form>
                                {searchResults.length > 0 && (
                                    <ul className="border dark:border-slate-700 rounded-lg divide-y dark:divide-slate-700 max-h-52 overflow-y-auto shadow-sm">
                                        {searchResults.map(m => (
                                            <li key={m.id} className="p-3 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer flex justify-between items-center transition-colors" onClick={() => handleSelectMember(m)}>
                                                <div className="flex items-center">
                                                    <UserIcon className="h-5 w-5 text-gray-400 dark:text-slate-500 mr-3" />
                                                    <div>
                                                        <p className="font-medium text-gray-900 dark:text-slate-200">{m.full_name || `${m.first_name} ${m.last_name}`}</p>
                                                        <p className="text-xs text-gray-500 dark:text-slate-400">{m.email || m.phone_number}</p>
                                                    </div>
                                                </div>
                                                <span className="text-xs text-gray-500 dark:text-slate-500 font-mono">{m.member_id || m.member_number}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {searchResults.length === 0 && memberQuery && (
                                    <p className="text-sm text-gray-400 dark:text-slate-600 text-center py-4">No results. Try a different search term.</p>
                                )}
                            </>
                        ) : (
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg flex justify-between items-center">
                                <div className="flex items-center">
                                    <div className="bg-blue-100 dark:bg-blue-900/40 p-2 rounded-full mr-3">
                                        <UserIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-900 dark:text-white">{selectedMember.full_name || `${selectedMember.first_name} ${selectedMember.last_name}`}</p>
                                        <p className="text-sm text-blue-700 dark:text-blue-300">{selectedMember.member_id || selectedMember.member_number}</p>
                                    </div>
                                </div>
                                <button onClick={() => { setSelectedMember(null); setEligibility(null) }} className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">Change</button>
                            </div>
                        )}

                        <div className="flex justify-end pt-4">
                            <button
                                onClick={() => { setWizardStep(2); handleCheckEligibility() }}
                                disabled={!selectedMember}
                                className="btn btn-primary disabled:opacity-50"
                            >
                                Next — Check Eligibility
                            </button>
                        </div>
                    </div>
                )}

                {/* ===== STEP 2: ELIGIBILITY AUTO-CHECK ===== */}
                {wizardStep === 2 && (
                    <div className="space-y-4">
                        <div className="flex items-center mb-2">
                            <ShieldCheckIcon className="h-6 w-6 text-primary-600 dark:text-primary-400 mr-2" />
                            <h3 className="font-semibold text-gray-800 dark:text-slate-200">COBAC Eligibility Check</h3>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
                            The system is automatically verifying this member against COBAC regulations.
                        </p>

                        {checkingEligibility ? (
                            <div className="space-y-3">
                                {['Membership Status', 'Cooling-Off Period', 'Savings Rule', 'Delinquency', 'Dormancy'].map((label, i) => (
                                    <div key={i} className="flex items-center p-3 bg-gray-50 dark:bg-slate-800/40 rounded-lg animate-pulse">
                                        <ArrowPathIcon className="h-5 w-5 text-gray-400 dark:text-slate-500 mr-3 animate-spin" />
                                        <span className="text-gray-500 dark:text-slate-400">{label}...</span>
                                    </div>
                                ))}
                            </div>
                        ) : eligibility ? (
                            <div className="space-y-3">
                                {Object.entries(eligibility.checks).map(([key, check]) => (
                                    <div key={key} className={`flex items-start p-3 rounded-lg border ${check.passed ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'}`}>
                                        {check.passed ? (
                                            <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                                        ) : (
                                            <XCircleIcon className="h-5 w-5 text-red-600 dark:text-red-500 mr-3 mt-0.5 flex-shrink-0" />
                                        )}
                                        <div>
                                            <p className={`font-medium text-sm ${check.passed ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>{check.label}</p>
                                            <p className={`text-xs mt-0.5 ${check.passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{check.detail}</p>
                                        </div>
                                    </div>
                                ))}

                                {/* Summary Banner */}
                                {eligibility.eligible ? (
                                    <div className="mt-4 p-4 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-800 rounded-lg text-center">
                                        <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
                                        <p className="font-bold text-green-800 dark:text-green-300">Member is eligible for a loan</p>
                                        <p className="text-sm text-green-700 dark:text-green-400">Maximum amount: <strong>{formatCurrency(eligibility.max_loan_amount)}</strong></p>
                                    </div>
                                ) : (
                                    <div className="mt-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 rounded-lg text-center">
                                        <XCircleIcon className="h-8 w-8 text-red-600 dark:text-red-400 mx-auto mb-2" />
                                        <p className="font-bold text-red-800 dark:text-red-300">Member is NOT eligible</p>
                                        <p className="text-sm text-red-700 dark:text-red-400">One or more COBAC requirements have failed. Application cannot proceed.</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <button onClick={handleCheckEligibility} className="btn btn-primary">
                                    Run Eligibility Check
                                </button>
                            </div>
                        )}

                        <div className="flex justify-between pt-4">
                            <button onClick={() => setWizardStep(1)} className="btn btn-secondary">Back</button>
                            <button
                                onClick={() => setWizardStep(3)}
                                disabled={!eligibility?.eligible}
                                className="btn btn-primary disabled:opacity-50"
                            >
                                Next — Enter Loan Details
                            </button>
                        </div>
                    </div>
                )}

                {/* ===== STEP 3: LOAN DETAILS ===== */}
                {wizardStep === 3 && (
                    <div className="space-y-4">
                        <h3 className="font-semibold text-gray-800 dark:text-slate-200 mb-2">Loan Details</h3>
                        <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">Configure the loan product, amount, and term.</p>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="label">Loan Product *</label>
                                <select
                                    className="input"
                                    value={selectedProduct?.id || ''}
                                    onChange={(e) => {
                                        const prod = loanProducts.find(p => p.id === parseInt(e.target.value))
                                        setSelectedProduct(prod || null)
                                        if (prod) setTermMonths(String(prod.min_term_months || 12))
                                    }}
                                >
                                    <option value="">Select Product...</option>
                                    {loanProducts.map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} ({p.interest_rate}% — {p.interest_type === 'declining_balance' ? 'Declining' : 'Flat'})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="label">Amount (FCFA) *</label>
                                <input
                                    type="number"
                                    className="input"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    placeholder="e.g. 500000"
                                />
                                {eligibility && (
                                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                                        Max eligible: <strong>{formatCurrency(eligibility.max_loan_amount)}</strong>
                                    </p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="label">Term (Months) *</label>
                            <input
                                type="number"
                                className="input"
                                value={termMonths}
                                onChange={e => setTermMonths(e.target.value)}
                                placeholder="e.g. 12"
                            />
                            {selectedProduct && (
                                <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                                    Range: {selectedProduct.min_term_months} – {selectedProduct.max_term_months} months
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="label">Purpose *</label>
                            <textarea
                                className="input"
                                rows={2}
                                value={purpose}
                                onChange={e => setPurpose(e.target.value)}
                                placeholder="e.g. School fees for 2 children, Business expansion..."
                            ></textarea>
                        </div>

                        <SignaturePad />

                        {/* Amount Warning */}
                        {amount && eligibility && parseFloat(amount) > eligibility.max_loan_amount && (
                            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start">
                                <ExclamationTriangleIcon className="h-5 w-5 text-red-500 dark:text-red-400 mr-2 mt-0.5 flex-shrink-0" />
                                <p className="text-sm text-red-700 dark:text-red-300">
                                    Amount exceeds the 3× savings limit of {formatCurrency(eligibility.max_loan_amount)}.
                                    The application will be rejected by the system.
                                </p>
                            </div>
                        )}

                        <div className="flex justify-between pt-4">
                            <button onClick={() => setWizardStep(2)} className="btn btn-secondary">Back</button>
                            <button
                                onClick={() => setWizardStep(4)}
                                disabled={!selectedProduct || !amount || !purpose || !termMonths}
                                className="btn btn-primary disabled:opacity-50"
                            >
                                Next — Add Guarantors
                            </button>
                        </div>
                    </div>
                )}

                {/* ===== STEP 4: GUARANTORS ===== */}
                {wizardStep === 4 && (
                    <div className="space-y-4">
                        <div className="flex items-center mb-2">
                            <UserGroupIcon className="h-6 w-6 text-primary-600 dark:text-primary-400 mr-2" />
                            <h3 className="font-semibold text-gray-800 dark:text-slate-200">Guarantors</h3>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
                            Search for other members to serve as guarantors. Their savings will be temporarily locked.
                        </p>

                        {/* Guarantor Search */}
                        <form onSubmit={handleSearchGuarantor} className="flex gap-2">
                            <div className="relative flex-1">
                                <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-5 w-5 text-gray-400 dark:text-slate-500" />
                                <input
                                    type="text"
                                    className="input pl-10"
                                    placeholder="Search guarantor by name..."
                                    value={guarantorQuery}
                                    onChange={e => setGuarantorQuery(e.target.value)}
                                />
                            </div>
                            <button type="submit" className="btn btn-secondary">Search</button>
                        </form>

                        {/* Search Results */}
                        {guarantorResults.length > 0 && (
                            <ul className="border dark:border-slate-700 rounded-lg divide-y dark:divide-slate-700 max-h-36 overflow-y-auto shadow-sm">
                                {guarantorResults.map(m => (
                                    <li key={m.id} className="p-3 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer flex justify-between items-center transition-colors" onClick={() => addGuarantor(m)}>
                                        <span className="text-sm text-gray-900 dark:text-slate-200">{m.full_name || `${m.first_name} ${m.last_name}`}</span>
                                        <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">+ Add</span>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {/* Added Guarantors */}
                        {guarantors.length > 0 && (
                            <div className="space-y-2 mt-4">
                                <h4 className="text-sm font-medium text-gray-700 dark:text-slate-300">Linked Guarantors</h4>
                                {guarantors.map((g: Guarantor, idx: number) => (
                                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800/40 rounded-lg border dark:border-slate-700">
                                        <UserIcon className="h-5 w-5 text-gray-400 dark:text-slate-500 flex-shrink-0" />
                                        <span className="text-sm font-medium flex-1 text-gray-900 dark:text-slate-200">{g.member_name}</span>
                                        <input
                                            type="number"
                                            className="input w-36 text-sm"
                                            placeholder="Amount (FCFA)"
                                            value={g.guarantee_amount}
                                            onChange={e => updateGuarantorAmount(idx, e.target.value)}
                                        />
                                        <button onClick={() => removeGuarantor(idx)} className="text-red-400 hover:text-red-600 transition-colors">
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    </div>
                                ))}
                                <p className="text-xs text-gray-500 dark:text-slate-500 text-right">
                                    Total guarantee: <strong>{formatCurrency(guarantors.reduce((s: number, g: Guarantor) => s + (parseFloat(g.guarantee_amount) || 0), 0))}</strong>
                                </p>
                            </div>
                        )}

                        {guarantors.length === 0 && (
                            <p className="text-sm text-gray-400 dark:text-slate-600 text-center py-4">
                                No guarantors added yet. {selectedProduct?.requires_guarantor ? 'This product requires at least one guarantor.' : 'Optional for this product.'}
                            </p>
                        )}

                        <div className="flex justify-between pt-4">
                            <button onClick={() => setWizardStep(3)} className="btn btn-secondary">Back</button>
                            <button
                                onClick={() => setWizardStep(5)}
                                disabled={selectedProduct?.requires_guarantor && guarantors.length === 0}
                                className="btn btn-primary disabled:opacity-50"
                            >
                                Next — Review Application
                            </button>
                        </div>
                    </div>
                )}

                {/* ===== STEP 5: REVIEW & SUBMIT ===== */}
                {wizardStep === 5 && (
                    <div className="space-y-6">
                        <h3 className="font-semibold text-gray-800 dark:text-slate-200 mb-2">Review Application</h3>
                        <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">Verify all details before submitting to the Loan Committee.</p>

                        <div className="bg-gray-50 dark:bg-slate-800/40 p-5 rounded-lg space-y-3 border dark:border-slate-700">
                            <h4 className="font-bold text-gray-700 dark:text-slate-300 border-b dark:border-slate-700 pb-2 mb-3">Application Summary</h4>

                            <div className="flex justify-between py-1">
                                <span className="text-gray-500 dark:text-slate-500">Member</span>
                                <span className="font-medium text-gray-900 dark:text-slate-200">{selectedMember?.full_name || `${selectedMember?.first_name} ${selectedMember?.last_name}`}</span>
                            </div>
                            <div className="flex justify-between py-1">
                                <span className="text-gray-500 dark:text-slate-500">Eligibility</span>
                                <span className="text-green-600 dark:text-green-400 font-medium flex items-center">
                                    <CheckCircleIcon className="h-4 w-4 mr-1" /> Passed
                                </span>
                            </div>
                            <div className="flex justify-between py-1">
                                <span className="text-gray-500 dark:text-slate-500">Product</span>
                                <span className="font-medium text-gray-900 dark:text-slate-200">{selectedProduct?.name}</span>
                            </div>
                            <div className="flex justify-between py-1">
                                <span className="text-gray-500 dark:text-slate-500">Interest Rate</span>
                                <span className="font-medium text-gray-900 dark:text-slate-200">{selectedProduct?.interest_rate}% ({selectedProduct?.interest_type === 'declining_balance' ? 'Declining Balance' : 'Flat Rate'})</span>
                            </div>
                            <div className="flex justify-between py-1 border-t dark:border-slate-700 pt-2">
                                <span className="text-gray-500 dark:text-slate-500">Principal Amount</span>
                                <span className="font-bold text-xl text-primary-700 dark:text-primary-400">{formatCurrency(parseFloat(amount))}</span>
                            </div>
                            <div className="flex justify-between py-1">
                                <span className="text-gray-500 dark:text-slate-500">Term</span>
                                <span className="font-medium text-gray-900 dark:text-slate-200">{termMonths} Months</span>
                            </div>
                            <div className="flex justify-between py-1">
                                <span className="text-gray-500 dark:text-slate-500">Purpose</span>
                                <span className="font-medium text-right max-w-xs text-gray-900 dark:text-slate-200">{purpose}</span>
                            </div>

                            {guarantors.length > 0 && (
                                <>
                                    <div className="border-t dark:border-slate-700 pt-2 mt-2">
                                        <span className="text-gray-500 dark:text-slate-500 text-sm font-medium">Guarantors</span>
                                    </div>
                                    {guarantors.map((g: Guarantor, i: number) => (
                                        <div key={i} className="flex justify-between py-1 pl-4">
                                            <span className="text-gray-600 dark:text-slate-400 text-sm">{g.member_name}</span>
                                            <span className="text-sm font-medium text-gray-900 dark:text-slate-200">{formatCurrency(parseFloat(g.guarantee_amount) || 0)}</span>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>

                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 flex items-start">
                            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-yellow-800 dark:text-yellow-300">
                                By submitting, this application will be sent to the <strong>Loan Committee</strong> for review and approval.
                                The applicant's guarantor liens will be temporarily locked.
                            </p>
                        </div>

                        <div className="flex justify-between pt-4">
                            <button onClick={() => setWizardStep(4)} className="btn btn-secondary">Back</button>
                            <button
                                onClick={handleSubmitApplication}
                                disabled={submitting}
                                className="btn btn-primary disabled:opacity-50 text-base px-6 py-2.5"
                            >
                                {submitting ? (
                                    <span className="flex items-center">
                                        <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
                                        Submitting...
                                    </span>
                                ) : (
                                    '✅ Save Draft Application'
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )

    const SignaturePad = () => (
        <div className="mt-4">
            <label className="label text-[10px] font-black uppercase tracking-widest text-slate-400">Digital Signature Pad</label>
            <div className="h-48 w-full bg-slate-950 rounded-2xl border-2 border-slate-800 relative flex items-center justify-center group overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]" />
                <p className="text-slate-600 font-serif italic text-2xl select-none opacity-40 group-hover:opacity-60 transition-opacity">Capture Wet Signature Here</p>
                <div className="absolute bottom-4 right-4 flex space-x-2">
                    <button onClick={(e) => { e.preventDefault(); toast.success('Signature Captured') }} className="px-3 py-1 bg-primary-600 text-white text-[10px] font-black rounded-lg uppercase">Capture</button>
                    <button onClick={(e) => { e.preventDefault(); }} className="px-3 py-1 bg-slate-800 text-slate-400 text-[10px] font-black rounded-lg uppercase">Clear</button>
                </div>
                {/* Simulated signature stroke */}
                <div className="absolute inset-0 pointer-events-none">
                    <svg className="w-full h-full">
                        <path d="M 100 100 Q 150 50 200 120 T 300 100" fill="none" stroke="#3b82f6" strokeWidth="3" className="opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
                    </svg>
                </div>
            </div>
        </div>
    )

    const handleUploadKYC = async (groupId: number) => {
        try {
            await njangiApi.uploadKycDocuments(groupId, {
                bylaws_url: "https://example.com/bylaws.pdf",
                meeting_minutes_url: "https://example.com/minutes.pdf"
            });
            toast.success('KYC Documents Uploaded Successfully!');
            fetchNjangiGroups();
        } catch (error: any) {
            toast.error('Failed to upload KYC documents');
        }
    }

    const renderNjangiGenesis = () => {
        const draftGroups = njangiGroups.filter(g => g.status === 'DRAFT')

        return (
            <div className="max-w-4xl mx-auto">
                <div className="bg-white dark:bg-slate-900 rounded-t-xl border border-gray-200 dark:border-slate-800 p-5 flex justify-between items-center mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Njangi Group Genesis</h2>
                        <p className="text-sm text-gray-500 dark:text-slate-400">Upload physical KYC documents (Bylaws, Minutes) for DRAFT groups.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    {draftGroups.map(group => (
                        <div key={group.id} className="bg-white dark:bg-slate-800 p-5 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-white">{group.name}</h3>
                                <p className="text-sm text-gray-500 dark:text-slate-400">President ID: <span className="font-mono">{group.president_id}</span></p>
                                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Rule: {formatCurrency(group.cycle_amount)} / {group.cycle_frequency}</p>
                            </div>
                            <div className="flex space-x-3">
                                <button
                                    onClick={() => handleUploadKYC(group.id)}
                                    className="btn btn-primary flex items-center"
                                >
                                    <ClipboardDocumentCheckIcon className="h-5 w-5 mr-2" />
                                    Simulate Upload KYC Docs
                                </button>
                            </div>
                        </div>
                    ))}
                    {draftGroups.length === 0 && (
                        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg border border-dashed border-gray-300 dark:border-slate-700">
                            <DocumentTextIcon className="h-12 w-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                            <p className="text-gray-500 dark:text-slate-400">No Njangi groups pending genesis document upload.</p>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    if (!loanStats) return <div>Loading...</div>

    return (
        <div className={`transition-all duration-500 ${cleanRoom ? 'bg-slate-950 p-12 -m-8 min-h-screen' : ''}`}>
            {/* Top Bar: Pending Applications Ticker */}
            {!cleanRoom && (
                <div className="bg-slate-900 -mx-8 -mt-8 mb-8 px-8 py-2 overflow-hidden whitespace-nowrap border-b border-slate-800 relative">
                    <div className="absolute left-0 top-0 h-full w-24 bg-gradient-to-r from-slate-900 to-transparent z-10" />
                    <div className="absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-slate-900 to-transparent z-10" />
                    <div className="inline-block animate-marquee">
                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mr-12">
                            ⚠️ PENDING KYC APPROVALS: {pendingCount.members} MEMBERS AWAITING VERIFICATION
                        </span>
                        <span className="text-[10px] font-black text-primary-400 uppercase tracking-[0.2em] mr-12">
                            🚀 CREDIT PIPELINE: {pendingCount.loans} LOAN APPLICATIONS IN REVIEW
                        </span>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mr-12">
                            STRICT COMPLIANCE MODE ACTIVE — ALL DOCUMENTS MUST BE SCANNED AT 300DPI
                        </span>
                        {/* Repeat for seamless loop */}
                        <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mr-12">
                            ⚠️ PENDING KYC APPROVALS: {pendingCount.members} MEMBERS AWAITING VERIFICATION
                        </span>
                        <span className="text-[10px] font-black text-primary-400 uppercase tracking-[0.2em] mr-12">
                            🚀 CREDIT PIPELINE: {pendingCount.loans} LOAN APPLICATIONS IN REVIEW
                        </span>
                    </div>
                </div>
            )}

            <div className={`mb-8 flex justify-between items-start gap-4 ${cleanRoom ? 'hidden' : ''}`}>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Credit Dashboard</h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                        Loan Portfolio & Pipeline
                    </p>
                </div>

                {/* Live Queue Control */}
                <div className="flex-1 max-w-2xl bg-white dark:bg-slate-900 shadow-sm border dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center">
                        <div className={`p-3 rounded-xl mr-4 ${currentTicket ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-slate-100 dark:bg-slate-800'}`}>
                            <HandRaisedIcon className={`h-6 w-6 ${currentTicket ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} />
                        </div>
                        {currentTicket ? (
                            <div>
                                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">In Service</span>
                                <h4 className="text-xl font-black text-slate-900 dark:text-white leading-tight">Member: {currentTicket.ticket_number}</h4>
                            </div>
                        ) : (
                            <div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Queue Status</span>
                                <h4 className="text-lg font-bold text-slate-400 leading-tight italic">Waiting for next...</h4>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center space-x-2">
                        {currentTicket ? (
                            <>
                                <button onClick={handleRecall} className="p-2 text-slate-400 hover:text-primary-600 transition-colors" title="Recall on screen">
                                    <MegaphoneIcon className="h-5 w-5" />
                                </button>
                                <button onClick={handleNoShow} className="p-2 text-slate-400 hover:text-red-600 transition-colors" title="Member No-Show">
                                    <XCircleIcon className="h-5 w-5" />
                                </button>
                                <button onClick={handleComplete} className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95">
                                    <VerifiedIcon className="h-4 w-4 mr-2" />
                                    DONE
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handleCallNext}
                                disabled={queueLoading}
                                className="flex items-center px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl text-sm font-black shadow-lg shadow-primary-500/20 transition-all active:scale-95"
                            >
                                {queueLoading ? (
                                    <ArrowPathIcon className="h-5 w-5 animate-spin mr-2" />
                                ) : (
                                    <MegaphoneIcon className="h-5 w-5 mr-2" />
                                )}
                                CALL NEXT LOAN APPLICANT
                            </button>
                        )}
                    </div>
                </div>

                {view === 'pipeline' && (
                    <div className="flex space-x-2">
                        <button
                            onClick={() => setCleanRoom(!cleanRoom)}
                            className={`flex items-center px-4 py-2 rounded-xl text-sm font-bold border-2 transition-all ${cleanRoom ? 'bg-primary-600 border-primary-600 text-white shadow-lg' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary-500'}`}
                        >
                            <ShieldCheckIcon className="h-5 w-5 mr-2" />
                            {cleanRoom ? 'EXIT CLEAN ROOM' : 'KYC CLEAN ROOM'}
                        </button>
                        <button
                            onClick={() => setView('njangi-genesis')}
                            className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-primary-500 text-slate-600 dark:text-slate-400 btn flex items-center h-fit border-2"
                        >
                            <UserGroupIcon className="h-5 w-5 mr-2" />
                            Njangi Genesis
                        </button>
                        <button
                            onClick={() => setView('new-application')}
                            className="btn btn-primary flex items-center h-fit"
                        >
                            <PlusIcon className="h-5 w-5 mr-2" />
                            New Application
                        </button>
                    </div>
                )}
            </div>

            {cleanRoom && (
                <div className="max-w-6xl mx-auto">
                    <div className="flex justify-between items-center mb-12">
                        <div>
                            <h1 className="text-4xl font-black text-white tracking-widest uppercase mb-2 leading-none">KYC Documentation Clean Room</h1>
                            <p className="text-primary-500 font-mono text-sm tracking-widest uppercase">High-Focus Verification Mode — ISO 27001 Compliant</p>
                        </div>
                        <button onClick={() => setCleanRoom(false)} className="px-6 py-2 border-2 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 rounded-full font-black text-xs tracking-widest uppercase transition-all">EXIT MODE [ESC]</button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 h-[70vh]">
                        <div className="glass-card bg-slate-900 flex flex-col items-center justify-center border-slate-800 border-2">
                            <DocumentTextIcon className="h-24 w-24 text-slate-800 mb-6" />
                            <p className="text-slate-500 font-black uppercase tracking-widest text-xs">Awaiting Document Upload...</p>
                        </div>
                        <div className="space-y-6">
                            <div className="glass-card bg-slate-900 p-8 border-slate-800 border-2">
                                <h3 className="text-xl font-black text-white uppercase tracking-widest mb-6 border-b border-slate-800 pb-4">Verification Checklist</h3>
                                <div className="space-y-4">
                                    {['ID Validity Check', 'Utility Bill Address Match', 'Proof of Income Authenticity', 'AML/CFT Screening', 'Signature Match Scan'].map((item, i) => (
                                        <div key={i} className="flex items-center group cursor-pointer">
                                            <div className="h-6 w-6 rounded border-2 border-slate-700 mr-4 group-hover:border-primary-500 transition-colors flex items-center justify-center">
                                                <div className="h-2 w-2 bg-primary-500 rounded-sm opacity-0 group-hover:opacity-40" />
                                            </div>
                                            <span className="text-slate-400 font-bold uppercase text-[11px] tracking-widest">{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="glass-card bg-primary-900/10 p-8 border-primary-900/20 border-2">
                                <h3 className="text-xl font-black text-primary-400 uppercase tracking-widest mb-4">Final Verdict</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <button onClick={() => { toast.success('Document Verified'); setCleanRoom(false); }} className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-green-900/40">VERIFY & PASS</button>
                                    <button onClick={() => { toast.error('Document Rejected'); setCleanRoom(false); }} className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-red-900/40">REJECT & RETURN</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Top Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="card p-4 flex items-center border-l-4 border-l-blue-500 dark:bg-slate-900/40">
                    <div>
                        <p className="text-sm text-gray-500 dark:text-slate-400">Total Portfolio</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(loanStats.total_portfolio)}</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center border-l-4 border-l-green-500 dark:bg-slate-900/40">
                    <div>
                        <p className="text-sm text-gray-500 dark:text-slate-400">Active Loans</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-white">{loanStats.active_loans}</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center border-l-4 border-l-red-500 dark:bg-slate-900/40">
                    <div>
                        <p className="text-sm text-gray-500 dark:text-slate-400">Delinquent</p>
                        <p className="text-xl font-bold text-red-700 dark:text-red-400">{loanStats.delinquent_loans}</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center border-l-4 border-l-orange-500 dark:bg-slate-900/40">
                    <div>
                        <p className="text-sm text-gray-500 dark:text-slate-400">PAR (Ratio)</p>
                        <p className="text-xl font-bold text-orange-700 dark:text-orange-400">{loanStats.par_rate?.toFixed(2) || '0.00'}%</p>
                    </div>
                </div>
            </div>

            {view === 'pipeline' ? (!cleanRoom && renderKanban()) : view === 'new-application' ? renderWizard() : renderNjangiGenesis()}
        </div>
    )
}
