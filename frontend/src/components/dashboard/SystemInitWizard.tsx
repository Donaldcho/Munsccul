import { useState } from 'react'
import {
    CheckCircleIcon,
    ExclamationTriangleIcon,
    ArrowRightIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    BanknotesIcon,
    BuildingLibraryIcon,
    DevicePhoneMobileIcon,
    UsersIcon,
    SparklesIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { api } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'

interface StepStatus {
    state: 'idle' | 'running' | 'done' | 'error'
    result?: any
    error?: string
}

const INIT_STEPS = [
    {
        id: 'sync-accounts',
        number: 1,
        title: 'Seed Member Equity (2020 & 2010)',
        subtitle: 'Backfills Share Capital and Savings into the General Ledger',
        icon: UsersIcon,
        color: 'indigo',
        description: 'Scans ALL active member accounts with a non-zero balance and creates opening balance journal entries in the GL. Ledger 2020 (Share Capital) and 2010 (Member Savings) will be populated automatically.',
        whatHappens: [
            'SHARES accounts → Credit GL 2020 (Member Share Capital)',
            'SAVINGS accounts → Credit GL 2010 (Member Savings Deposits)',
            'All entries Debit GL 1010 (Main Vault) to balance the sheet',
            'Previously synced accounts are automatically skipped'
        ],
        apiCall: () => api.post('/treasury/sync-accounts-to-gl'),
        confirm: true,
    },
    {
        id: 'vault-injection',
        number: 2,
        title: 'Reconcile Physical Vault (1010)',
        subtitle: 'Posts your actual physical cash balance to the digital ledger',
        icon: BanknotesIcon,
        color: 'emerald',
        description: 'Input your actual physical vault cash. This action posts a Genesis Deposit: DR 1010 (Main Vault) / CR 3010 (Retained Earnings).',
        fields: [
            { key: 'amount', label: 'Vault Cash Balance (FCFA)', default: 2500000, type: 'number' },
            { key: 'description', label: 'Description', default: 'Historical Vault Opening Balance - Feb 2026', type: 'text' },
        ],
        apiCall: (values: any) => api.post('/treasury/vault-adjustment', values),
        confirm: true,
    },
    {
        id: 'external-placements',
        number: 3,
        title: 'Seed External Bank & MoMo Placements',
        subtitle: 'Posts Afriland, BALICO, MTN MoMo, and Orange Money balances',
        icon: BuildingLibraryIcon,
        color: 'amber',
        description: 'Posts the historical balances held at commercial banks and mobile money wallets. These are the "Brought Forward" figures from your Daily Cash Flow Statement.',
        placements: [
            { gl: '1031', name: 'Afriland First Bank', default: 3000000, icon: '🏦', color: 'blue' },
            { gl: '1032', name: 'BALICO / CCA Bank', default: 2000000, icon: '🏦', color: 'blue' },
            { gl: '1041', name: 'MTN Mobile Money', default: 1000000, icon: '📱', color: 'yellow' },
            { gl: '1042', name: 'Orange Money', default: 500000, icon: '📱', color: 'orange' },
        ],
        apiCall: (entries: any[]) => api.post('/treasury/gl-opening-balances', entries),
        confirm: true,
    }
]

const colorMap: Record<string, { bg: string; border: string; text: string; badge: string; ring: string }> = {
    indigo: { bg: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'border-indigo-200 dark:border-indigo-800', text: 'text-indigo-700 dark:text-indigo-300', badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200', ring: 'ring-indigo-500' },
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200', ring: 'ring-emerald-500' },
    amber: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', ring: 'ring-amber-500' },
}

export default function SystemInitWizard({ onComplete }: { onComplete?: () => void }) {
    const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>({
        'sync-accounts': { state: 'idle' },
        'vault-injection': { state: 'idle' },
        'external-placements': { state: 'idle' },
    })
    const [expanded, setExpanded] = useState<string>('sync-accounts')
    const [fieldValues, setFieldValues] = useState<Record<string, any>>({
        'vault-injection': { amount: 2500000, description: 'Historical Vault Opening Balance - Feb 2026' },
    })
    const [placementValues, setPlacementValues] = useState<Record<string, number>>({
        '1031': 3000000,
        '1032': 2000000,
        '1041': 1000000,
        '1042': 500000,
    })

    const setStatus = (id: string, status: StepStatus) =>
        setStepStatuses(prev => ({ ...prev, [id]: status }))

    const runStep = async (step: typeof INIT_STEPS[0]) => {
        setStatus(step.id, { state: 'running' })
        try {
            let result: any
            if (step.id === 'sync-accounts') {
                const res = await (step.apiCall as any)()
                result = res.data
            } else if (step.id === 'vault-injection') {
                const vals = fieldValues['vault-injection'] || {}
                const res = await step.apiCall!(vals)
                result = res.data
            } else if (step.id === 'external-placements') {
                const entries = Object.entries(placementValues)
                    .filter(([, amt]) => amt > 0)
                    .map(([gl, amt]) => {
                        const pl = INIT_STEPS[2].placements!.find(p => p.gl === gl)
                        return {
                            debit_gl_code: gl,
                            credit_gl_code: '3010',
                            amount: amt,
                            description: `Opening Balance: ${pl?.name ?? gl}`
                        }
                    })
                const res = await step.apiCall!(entries)
                result = res.data
            }
            setStatus(step.id, { state: 'done', result })
            toast.success(`Step ${step.number} complete!`)

            // Auto-expand next step
            const idx = INIT_STEPS.findIndex(s => s.id === step.id)
            if (idx < INIT_STEPS.length - 1) {
                setExpanded(INIT_STEPS[idx + 1].id)
            }
        } catch (err: any) {
            const msg = err?.response?.data?.detail || 'An error occurred'
            setStatus(step.id, { state: 'error', error: typeof msg === 'string' ? msg : JSON.stringify(msg) })
            toast.error(`Step ${step.number} failed`)
        }
    }

    const allDone = Object.values(stepStatuses).every(s => s.state === 'done')

    return (
        <div className="space-y-4 max-w-3xl mx-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 text-white">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <SparklesIcon className="w-5 h-5 text-yellow-400" />
                            <span className="text-xs font-bold tracking-widest uppercase text-slate-400">SOP v1.1 – Audit Post-Fix</span>
                        </div>
                        <h1 className="text-2xl font-bold mb-1">System Synchronization Wizard</h1>
                        <p className="text-slate-400 text-sm">Execute the 3-step procedure to align the Trial Balance and Liquidity Matrix with reality.</p>
                    </div>
                    {allDone && (
                        <div className="bg-emerald-500 rounded-full p-2">
                            <CheckCircleIcon className="w-6 h-6 text-white" />
                        </div>
                    )}
                </div>

                {/* Progress bar */}
                <div className="mt-5 flex items-center gap-2">
                    {INIT_STEPS.map((step, i) => {
                        const s = stepStatuses[step.id]
                        return (
                            <div key={step.id} className="flex items-center gap-2 flex-1">
                                <div className={`h-2 flex-1 rounded-full transition-all duration-500 ${s.state === 'done' ? 'bg-emerald-400' :
                                    s.state === 'running' ? 'bg-amber-400 animate-pulse' :
                                        s.state === 'error' ? 'bg-red-400' : 'bg-slate-600'
                                    }`} />
                                {i < INIT_STEPS.length - 1 && <ArrowRightIcon className="w-3 h-3 text-slate-600 flex-shrink-0" />}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Steps */}
            {INIT_STEPS.map((step) => {
                const status = stepStatuses[step.id]
                const isExpanded = expanded === step.id
                const colors = colorMap[step.color]
                const Icon = step.icon

                return (
                    <div key={step.id} className={`rounded-2xl border-2 overflow-hidden transition-all ${status.state === 'done' ? 'border-emerald-400 dark:border-emerald-600' :
                        status.state === 'error' ? 'border-red-400 dark:border-red-600' :
                            isExpanded ? `border-2 ${colors.border.replace('border-', 'border-')} ring-1 ${colors.ring} ring-offset-0` :
                                'border-gray-200 dark:border-gray-700'
                        } bg-white dark:bg-gray-800`}>
                        {/* Step Header */}
                        <button
                            className="w-full text-left p-5 flex items-center gap-4"
                            onClick={() => setExpanded(isExpanded ? '' : step.id)}
                        >
                            <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${status.state === 'done' ? 'bg-emerald-100 dark:bg-emerald-900/40' :
                                status.state === 'error' ? 'bg-red-100 dark:bg-red-900/40' :
                                    colors.bg
                                }`}>
                                {status.state === 'done' ? (
                                    <CheckCircleIcon className="w-6 h-6 text-emerald-600" />
                                ) : status.state === 'error' ? (
                                    <ExclamationTriangleIcon className="w-6 h-6 text-red-500" />
                                ) : (
                                    <Icon className={`w-6 h-6 ${colors.text}`} />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>Step {step.number}</span>
                                    {status.state === 'running' && <span className="text-xs text-amber-500 font-bold animate-pulse">Processing…</span>}
                                    {status.state === 'done' && <span className="text-xs text-emerald-600 font-bold">✓ Complete</span>}
                                    {status.state === 'error' && <span className="text-xs text-red-500 font-bold">✗ Failed</span>}
                                </div>
                                <p className="font-bold text-gray-900 dark:text-white mt-0.5">{step.title}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{step.subtitle}</p>
                            </div>
                            {isExpanded ? (
                                <ChevronUpIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            ) : (
                                <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            )}
                        </button>

                        {/* Expanded Body */}
                        {isExpanded && (
                            <div className={`px-5 pb-5 border-t ${colors.border}`}>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 mb-4 leading-relaxed">{step.description}</p>

                                {/* What Happens bullets */}
                                {step.whatHappens && (
                                    <div className={`${colors.bg} rounded-xl p-4 mb-4`}>
                                        <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">What happens</p>
                                        <ul className="space-y-1.5">
                                            {step.whatHappens.map((item, i) => (
                                                <li key={i} className={`text-sm flex items-start gap-2 ${colors.text}`}>
                                                    <span className="mt-0.5 font-bold">→</span> {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Fields for vault injection */}
                                {step.fields && (
                                    <div className="space-y-3 mb-4">
                                        {step.fields.map(field => (
                                            <div key={field.key}>
                                                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">{field.label}</label>
                                                <input
                                                    type={field.type}
                                                    value={fieldValues[step.id]?.[field.key] ?? field.default}
                                                    onChange={e => setFieldValues(prev => ({
                                                        ...prev,
                                                        [step.id]: { ...prev[step.id], [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value }
                                                    }))}
                                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* External placements table */}
                                {step.placements && (
                                    <div className="space-y-2 mb-4">
                                        {step.placements.map(placement => (
                                            <div key={placement.gl} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700">
                                                <span className="text-2xl">{placement.icon}</span>
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-gray-900 dark:text-white">{placement.name}</p>
                                                    <p className="text-xs text-gray-500">GL {placement.gl}</p>
                                                </div>
                                                <div>
                                                    <input
                                                        type="number"
                                                        value={placementValues[placement.gl] ?? placement.default}
                                                        onChange={e => setPlacementValues(prev => ({ ...prev, [placement.gl]: Number(e.target.value) }))}
                                                        className="w-40 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-right font-mono"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                        <p className="text-xs text-gray-500 mt-2 flex items-center justify-end gap-1">
                                            Total: <span className="font-bold text-gray-900 dark:text-white ml-1">
                                                {formatCurrency(Object.values(placementValues).reduce((a, b) => a + b, 0))}
                                            </span>
                                        </p>
                                    </div>
                                )}

                                {/* Error message */}
                                {status.state === 'error' && (
                                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4">
                                        <p className="text-sm text-red-700 dark:text-red-400">{status.error}</p>
                                    </div>
                                )}

                                {/* Success result */}
                                {status.state === 'done' && status.result && (
                                    <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 mb-4">
                                        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">Result</p>
                                        {status.result.synced_count !== undefined && (
                                            <p className="text-sm text-emerald-800 dark:text-emerald-200">
                                                ✓ {status.result.synced_count} accounts synced, {status.result.skipped_count} skipped
                                            </p>
                                        )}
                                        {status.result.posted_count !== undefined && (
                                            <p className="text-sm text-emerald-800 dark:text-emerald-200">
                                                ✓ {status.result.posted_count} GL entries posted
                                            </p>
                                        )}
                                        {status.result.transfer_ref && (
                                            <p className="text-sm text-emerald-800 dark:text-emerald-200">
                                                ✓ Vault adjustment posted (ref: {status.result.transfer_ref})
                                            </p>
                                        )}
                                        {status.result.message && (
                                            <p className="text-xs text-emerald-600 dark:text-emerald-300 mt-1">{status.result.message}</p>
                                        )}
                                    </div>
                                )}

                                {/* Action button */}
                                <button
                                    onClick={() => runStep(step)}
                                    disabled={status.state === 'running' || status.state === 'done'}
                                    className={`w-full py-3 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 ${status.state === 'done'
                                        ? 'bg-emerald-100 text-emerald-700 cursor-not-allowed dark:bg-emerald-900/30 dark:text-emerald-400'
                                        : status.state === 'running'
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700'
                                            : `bg-gray-900 hover:bg-gray-700 text-white dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200`
                                        }`}
                                >
                                    {status.state === 'running' ? (
                                        <><div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Executing…</>
                                    ) : status.state === 'done' ? (
                                        <><CheckCircleIcon className="w-4 h-4" /> Completed</>
                                    ) : (
                                        <>Execute Step {step.number} <ArrowRightIcon className="w-4 h-4" /></>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                )
            })}

            {/* Verification Checklist */}
            {allDone && (
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-xl">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <CheckCircleIcon className="w-6 h-6" /> Verification Checklist
                    </h2>
                    <ul className="space-y-3">
                        {[
                            'Trial Balance Totals: Debits and Credits must be equal and non-zero',
                            'Liquidity Matrix: Must show sum of Vault + Tellers + MoMo + Banks',
                            'Equity Ratio: Member Shares (2020) must be visible — union is solvent',
                        ].map((item, i) => (
                            <li key={i} className="flex items-start gap-3 bg-white/10 rounded-xl p-3">
                                <CheckCircleIcon className="w-5 h-5 text-emerald-200 flex-shrink-0 mt-0.5" />
                                <span className="text-sm">{item}</span>
                            </li>
                        ))}
                    </ul>
                    {onComplete && (
                        <button
                            onClick={onComplete}
                            className="mt-5 w-full bg-white text-emerald-700 font-bold py-3 rounded-xl hover:bg-emerald-50 transition"
                        >
                            Go to Trial Balance Report →
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
