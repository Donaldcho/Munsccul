import { useEffect, useState } from 'react'
import LoanProductsConfig from '../LoanProductsConfig'
import {
    CalculatorIcon,
    BanknotesIcon,
    QueueListIcon,
    ShieldExclamationIcon,
    CheckBadgeIcon,
    DocumentPlusIcon,
    ClockIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline'
import { policiesApi } from '../../../services/api'
import { formatCurrency, formatDate } from '../../../utils/formatters'
import { getErrorMessage } from '../../../utils/errorUtils'
import toast from 'react-hot-toast'

interface Policy {
    id: number
    policy_key: string
    policy_value: string
    status: 'ACTIVE' | 'PROPOSED' | 'ARCHIVED'
    version: number
    proposed_by_id: number
    approved_by_id?: number
    change_reason?: string
    effective_date: string
    created_at: string
}

export default function PolicyManagement() {
    const [activePolicies, setActivePolicies] = useState<Policy[]>([])
    const [proposals, setProposals] = useState<Policy[]>([])
    const [loading, setLoading] = useState(true)
    const [isProposing, setIsProposing] = useState(false)
    const [newProposal, setNewProposal] = useState({
        policy_key: 'share_unit_price',
        policy_value: '',
        change_reason: '',
        effective_date: new Date().toISOString().split('T')[0]
    })

    const fetchData = async () => {
        setLoading(true)
        try {
            const [activeRes, proposalsRes] = await Promise.all([
                policiesApi.getActive(),
                policiesApi.getProposals()
            ])
            setActivePolicies(activeRes.data)
            setProposals(proposalsRes.data)
        } catch (error) {
            console.error('Failed to fetch policies:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const handlePropose = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await policiesApi.propose(newProposal)
            toast.success('Policy proposal submitted for Board seconding.')
            setIsProposing(false)
            setNewProposal({ ...newProposal, policy_value: '', change_reason: '' })
            fetchData()
        } catch (error: any) {
            toast.error(getErrorMessage(error, 'Failed to submit proposal.'))
        }
    }

    const handleApprove = async (id: number) => {
        try {
            await policiesApi.approve(id, { reason: 'Board Meeting Resolution' })
            toast.success('Policy activated successfully.')
            fetchData()
        } catch (error: any) {
            toast.error(getErrorMessage(error, 'Approval failed.'))
        }
    }

    const policyDefinitions = [
        { key: 'share_unit_price', label: 'Share Unit Price', category: 'Financial', unit: 'FCFA', description: 'Face value of a single member share (Ledger 2020)' },
        { key: 'max_borrowing_ratio', label: 'Max Borrowing Ratio', category: 'Lending', unit: 'x', description: 'Multiplier (Stake : Loan) - Level 3:1' },
        { key: 'min_share_capital', label: 'Min Share Capital', category: 'Financial', unit: 'FCFA', description: 'Threshold for Full Membership status' },
        { key: 'ctr_threshold', label: 'CTR Threshold (AML)', category: 'Reporting', unit: 'FCFA', description: 'Cash Transaction Reporting limit for COBAC/ANIF' },
        { key: 'cooling_off_days', label: 'Cooling-Off Period', category: 'Lending', unit: 'Days', description: 'Wait time after joining before loan eligibility' },
        { key: 'account_opening_fee', label: 'Account Opening Fee', category: 'Financial', unit: 'FCFA', description: 'One-time registration fee for new members (Ledger 4210)' },
    ]

    return (
        <div className="space-y-10 pb-20">
            {/* Page Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Policy & Governance</h1>
                    <p className="text-slate-400">Manage financial products, regulatory constraints, and Board-level overrides</p>
                </div>
                <button
                    onClick={() => setIsProposing(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-indigo-500/20"
                >
                    <DocumentPlusIcon className="h-5 w-5" />
                    Propose Policy Change
                </button>
            </div>

            {/* Maker-Checker Workflow Alert if proposals exist */}
            {proposals.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-2xl flex items-start gap-4 animate-pulse">
                    <ShieldExclamationIcon className="h-6 w-6 text-amber-500 mt-1" />
                    <div>
                        <h3 className="font-bold text-amber-500">Action Required: Pending Policy Changes</h3>
                        <p className="text-sm text-slate-400">There are {proposals.length} policy updates awaiting seconding from a second Board Member.</p>
                    </div>
                </div>
            )}

            {/* Active Policies Table */}
            <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-8 backdrop-blur-md">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-xl font-bold text-white flex items-center">
                        <CheckBadgeIcon className="h-6 w-6 text-emerald-400 mr-2" />
                        Active Board Policies
                    </h2>
                    <button onClick={fetchData} className="text-slate-500 hover:text-white transition-colors">
                        <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {policyDefinitions.map(def => {
                        const active = activePolicies.find(p => p.policy_key === def.key)
                        return (
                            <div key={def.key} className="bg-slate-900/50 border border-slate-800/50 p-6 rounded-xl hover:border-slate-700 transition-all group">
                                <div className="flex justify-between mb-4">
                                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">{def.category}</span>
                                    {active && <span className="text-[10px] text-slate-600 font-mono">v{active.version}</span>}
                                </div>
                                <h3 className="text-white font-bold mb-1">{def.label}</h3>
                                <p className="text-xs text-slate-500 mb-4 h-8">{def.description}</p>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black text-white">
                                        {active ? (def.unit === 'FCFA' ? formatCurrency(parseFloat(active.policy_value)) : active.policy_value) : '---'}
                                    </span>
                                    <span className="text-xs text-slate-500 font-semibold">{def.unit}</span>
                                </div>
                                {active && (
                                    <div className="mt-4 pt-4 border-t border-slate-800/50 flex items-center justify-between text-[10px] text-slate-500">
                                        <div className="flex items-center gap-1">
                                            <ClockIcon className="h-3 w-3" />
                                            Active since {formatDate(active.effective_date)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Pending Proposals Section */}
            {proposals.length > 0 && (
                <div className="bg-slate-900/30 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="p-8 border-b border-slate-800">
                        <h2 className="text-xl font-bold text-white flex items-center">
                            <QueueListIcon className="h-6 w-6 text-amber-400 mr-2" />
                            Policy Change Proposals (Maker-Checker)
                        </h2>
                    </div>
                    <div className="divide-y divide-slate-800">
                        {proposals.map(prop => (
                            <div key={prop.id} className="p-8 flex justify-between items-center group hover:bg-white/5 transition-colors">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg font-bold text-white">
                                            {prop.policy_key} → <span className="text-amber-400 font-black">{prop.policy_value}</span>
                                        </span>
                                        <span className="bg-amber-400/10 text-amber-400 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Awaiting Seconding</span>
                                    </div>
                                    <p className="text-sm text-slate-400 max-w-xl italic">"{prop.change_reason}"</p>
                                    <p className="text-xs text-slate-500">Proposed by Board Member #{prop.proposed_by_id} on {formatDate(prop.created_at)}</p>
                                </div>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => handleApprove(prop.id)}
                                        className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white px-6 py-2 rounded-lg text-sm font-bold transition-all border border-emerald-600/30"
                                    >
                                        Approve & Activate
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Proposal Modal */}
            {isProposing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl p-8 shadow-2xl">
                        <h2 className="text-2xl font-bold text-white mb-6">Propose Policy Change</h2>
                        <form onSubmit={handlePropose} className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-400 mb-2 uppercase tracking-wide">Select Policy</label>
                                <select
                                    value={newProposal.policy_key}
                                    onChange={e => setNewProposal({ ...newProposal, policy_key: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    {policyDefinitions.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-400 mb-2 uppercase tracking-wide">New Value</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. 2000 or 14"
                                    value={newProposal.policy_value}
                                    onChange={e => setNewProposal({ ...newProposal, policy_value: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-400 mb-2 uppercase tracking-wide">Reasoning (Board Resolution)</label>
                                <textarea
                                    required
                                    rows={3}
                                    placeholder="Explain the reason for this change..."
                                    value={newProposal.change_reason}
                                    onChange={e => setNewProposal({ ...newProposal, change_reason: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsProposing(false)}
                                    className="px-6 py-3 rounded-xl border border-slate-800 text-slate-400 font-bold hover:bg-slate-800 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20"
                                >
                                    Submit Proposal
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Loan Product Configuration Section */}
            <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-8 backdrop-blur-md">
                <div className="mb-8">
                    <h2 className="text-xl font-bold text-white flex items-center">
                        <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center mr-3">
                            <BanknotesIcon className="h-5 w-5 text-indigo-400" />
                        </div>
                        Loan Product Governance
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">Configure interest rates, terms, and eligibility rules for loan offerings</p>
                </div>

                <div className="bg-slate-900/50 rounded-xl overflow-hidden border border-slate-800/50">
                    <div className="p-6">
                        <LoanProductsConfig />
                    </div>
                </div>
            </div>
        </div>
    )
}
