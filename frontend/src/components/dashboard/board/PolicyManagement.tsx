import LoanProductsConfig from '../LoanProductsConfig'
import {
    CalculatorIcon,
    BanknotesIcon,
    QueueListIcon,
    ShieldExclamationIcon
} from '@heroicons/react/24/outline'

export default function PolicyManagement() {
    return (
        <div className="space-y-10 pb-20">
            {/* Page Header */}
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Policy & Governance</h1>
                <p className="text-slate-400">Manage financial products, interest rates, and regulatory constraints</p>
            </div>

            {/* Quick Stats / Summary for Policy */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl">
                    <div className="flex items-center space-x-3 mb-2">
                        <CalculatorIcon className="h-5 w-5 text-indigo-400" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Products</span>
                    </div>
                    <p className="text-2xl font-bold text-white">8</p>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl">
                    <div className="flex items-center space-x-3 mb-2">
                        <BanknotesIcon className="h-5 w-5 text-emerald-400" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Base Savings Rate</span>
                    </div>
                    <p className="text-2xl font-bold text-white">3.5%</p>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl">
                    <div className="flex items-center space-x-3 mb-2">
                        <QueueListIcon className="h-5 w-5 text-amber-400" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pending Changes</span>
                    </div>
                    <p className="text-2xl font-bold text-white">0</p>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl border-l-4 border-l-rose-500">
                    <div className="flex items-center space-x-3 mb-2">
                        <ShieldExclamationIcon className="h-5 w-5 text-rose-400" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Risk Threshold</span>
                    </div>
                    <p className="text-2xl font-bold text-white">High</p>
                </div>
            </div>

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
                    <div className="p-6 bg-white/5 dark:bg-transparent">
                        <LoanProductsConfig />
                    </div>
                </div>
            </div>

            {/* Accounting & Fee Policies (Placeholder) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-8 opacity-60">
                    <h2 className="text-lg font-bold text-white mb-2">Fee Configuration</h2>
                    <p className="text-sm text-slate-500 mb-6">Service charges, membership fees, and transaction commissions</p>
                    <div className="flex items-center justify-center h-40 border-2 border-dashed border-slate-800 rounded-xl text-slate-600 text-sm italic">
                        Fee Configuration Module Coming Soon
                    </div>
                </div>
                <div className="bg-slate-900/30 border border-slate-800 rounded-2xl p-8 opacity-60">
                    <h2 className="text-lg font-bold text-white mb-2">Accounting Rules</h2>
                    <p className="text-sm text-slate-500 mb-6">General Ledger mapping for automated financial postings</p>
                    <div className="flex items-center justify-center h-40 border-2 border-dashed border-slate-800 rounded-xl text-slate-600 text-sm italic">
                        GL Mapping Rules Module Coming Soon
                    </div>
                </div>
            </div>
        </div>
    )
}
