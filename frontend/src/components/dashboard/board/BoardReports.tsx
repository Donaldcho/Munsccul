import { useState } from 'react'
import {
    DocumentArrowDownIcon,
    TableCellsIcon,
    DocumentTextIcon,
    CalendarDaysIcon,
    ArrowDownTrayIcon,
    ArchiveBoxIcon
} from '@heroicons/react/24/outline'
import { reportsApi } from '../../../services/api'
import toast from 'react-hot-toast'

type ReportMetric = {
    id: string
    name: string
    description: string
    icon: any
    type: 'trial-balance' | 'balance-sheet' | 'income-statement' | 'par' | 'daily-cash-flow' | 'summary-pack'
}

const reports: ReportMetric[] = [
    { id: 'dcf', name: 'Daily Cash Flow', description: 'Monitor liquidity ins and outs for the current operational cycle.', icon: TableCellsIcon, type: 'daily-cash-flow' },
    { id: 'tb', name: 'Trial Balance', description: 'Full general ledger verification (Balance Générale) for the period.', icon: DocumentTextIcon, type: 'trial-balance' },
    { id: 'is', name: 'Income Statement', description: 'Profit and loss overview including interest income vs expenses.', icon: DocumentArrowDownIcon, type: 'income-statement' },
    { id: 'pack', name: 'Board Summary Pack', description: 'Consolidated executive summary containing all key financial ratios.', icon: ArchiveBoxIcon, type: 'summary-pack' },
]

export default function BoardReports() {
    const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().split('T')[0])
    const [loading, setLoading] = useState<string | null>(null)

    const handleDownload = async (type: string, format: 'pdf' | 'excel') => {
        setLoading(`${type}-${format}`)
        try {
            const params = { as_of_date: targetDate, end_date: targetDate, start_date: '2024-01-01', target_date: targetDate, format }

            let response
            if (type === 'summary-pack') {
                response = await reportsApi.getSummaryPack({ as_of_date: targetDate })
                toast.success('Summary Pack data retrieved')
                // For now, since it returns JSON, we just alert. 
                // Future: Generate PDF on the fly or download consolidated report.
                console.log('Summary Pack Data:', response.data)
                setLoading(null)
                return
            }

            switch (type) {
                case 'trial-balance': response = await reportsApi.getTrialBalance(params); break
                case 'balance-sheet': response = await reportsApi.getBalanceSheet(params); break
                case 'income-statement': response = await reportsApi.getIncomeStatement({ start_date: '2024-01-01', end_date: targetDate, format }); break
                case 'par': response = await reportsApi.getParReport(params); break
                case 'daily-cash-flow': response = await reportsApi.getDailyCashFlow(params); break
                default: toast.error('Unknown report type')
            }

            if (response?.data) {
                const url = window.URL.createObjectURL(new Blob([response.data]))
                const link = document.createElement('a')
                link.href = url
                const ext = format === 'pdf' ? '.pdf' : '.xlsx'
                link.setAttribute('download', `${type}_${targetDate}${ext}`)
                document.body.appendChild(link)
                link.click()
                link.remove()
                toast.success(`${type.toUpperCase()} downloaded successfully`)
            }
        } catch (err) {
            toast.error('Export failed. Please check server status.')
        } finally {
            setLoading(null)
        }
    }

    return (
        <div className="space-y-10 animate-fade-in">
            {/* Date Configuration */}
            <div className="p-8 bg-slate-900/40 border border-slate-800 rounded-3xl flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
                <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                        <CalendarDaysIcon className="h-6 w-6 text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Reporting Period</h3>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Select target snapshot date</p>
                    </div>
                </div>
                <div className="relative group">
                    <input
                        type="date"
                        value={targetDate}
                        onChange={(e) => setTargetDate(e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-xl px-6 py-4 text-white font-bold focus:outline-none focus:border-indigo-500 transition-all appearance-none cursor-pointer group-hover:bg-slate-900"
                    />
                </div>
            </div>

            {/* Report Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {reports.map((report) => (
                    <div key={report.id} className="group bg-slate-900/40 border border-slate-800 rounded-3xl p-8 hover:bg-slate-900/60 transition-all duration-300 transform hover:-translate-y-1">
                        <div className="flex items-start justify-between mb-8">
                            <div className="p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 group-hover:border-indigo-500/40 transition-colors">
                                <report.icon className="h-8 w-8 text-indigo-400" />
                            </div>
                            <div className="flex space-x-3">
                                <button
                                    onClick={() => handleDownload(report.type, 'pdf')}
                                    disabled={!!loading}
                                    className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white rounded-lg transition-all duration-300 border border-slate-700 hover:border-rose-500 disabled:opacity-50"
                                >
                                    <ArrowDownTrayIcon className="h-4 w-4" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">PDF</span>
                                </button>
                                <button
                                    onClick={() => handleDownload(report.type, 'excel')}
                                    disabled={!!loading}
                                    className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-lg transition-all duration-300 border border-slate-700 hover:border-emerald-500 disabled:opacity-50"
                                >
                                    <ArrowDownTrayIcon className="h-4 w-4" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">XLS</span>
                                </button>
                            </div>
                        </div>

                        <h4 className="text-xl font-bold text-white mb-3">{report.name}</h4>
                        <p className="text-sm text-slate-500 leading-relaxed font-medium">
                            {report.description}
                        </p>

                        <div className="mt-8 pt-8 border-t border-slate-800 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Verified Snapshot</span>
                            <div className="flex items-center text-emerald-500 text-[10px] font-bold">
                                <div className="h-2 w-2 rounded-full bg-emerald-500 mr-2 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                                Ready for Export
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Additional Compliance Note */}
            <div className="p-8 bg-amber-500/5 border border-amber-500/20 rounded-3xl">
                <p className="text-xs text-amber-500/80 leading-relaxed font-bold uppercase tracking-tighter">
                    ⚠️ Note: All reports exported from the Governance Portal are digitally timestamped and logged for COBAC compliance. Do not share raw exports outside of authorized board channels.
                </p>
            </div>
        </div>
    )
}
