import { useState, useEffect } from 'react'
import {
    ShieldCheckIcon,
    MagnifyingGlassIcon,
    ChevronLeftIcon,
    ChevronRightIcon
} from '@heroicons/react/24/outline'
import { reportsApi } from '../../../services/api'
import { formatDateTime } from '../../../utils/formatters'
import toast from 'react-hot-toast'

export default function BoardAuditLogs() {
    const [logs, setLogs] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchLogs()
    }, [])

    const fetchLogs = async () => {
        try {
            const res = await reportsApi.getAuditLogs({ limit: 50 })
            setLogs(res.data)
        } catch (err) {
            toast.error('Failed to fetch system logs')
        } finally {
            setLoading(false)
        }
    }

    const getActionColor = (action: string) => {
        if (action.includes('FAILED')) return 'text-rose-500 bg-rose-500/10 border-rose-500/20'
        if (action.includes('CREATE')) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
        if (action.includes('DELETE')) return 'text-rose-600 bg-rose-600/10 border-rose-600/20'
        if (action.includes('LOGIN')) return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
        return 'text-slate-400 bg-slate-800 border-slate-700'
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
            </div>
        )
    }

    return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden backdrop-blur-sm animate-fade-in">
            <div className="p-8 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0 sticky top-0 bg-slate-900/80 backdrop-blur z-10">
                <div className="flex items-center space-x-4">
                    <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
                        <ShieldCheckIcon className="h-6 w-6 text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">System Oversight</h3>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Real-time immutable audit trail</p>
                    </div>
                </div>
                <div className="relative">
                    <MagnifyingGlassIcon className="h-4 w-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search events..."
                        className="bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-6 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all w-full md:w-64"
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="text-left bg-slate-950/30">
                            <th className="px-8 py-5 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Timestamp</th>
                            <th className="px-8 py-5 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Principal</th>
                            <th className="px-8 py-5 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Operation</th>
                            <th className="px-8 py-5 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Description</th>
                            <th className="px-8 py-5 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Node/IP</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                        {logs.map((log) => (
                            <tr key={log.id} className="group hover:bg-slate-800/30 transition-colors">
                                <td className="px-8 py-6 text-xs text-slate-400 font-medium">{formatDateTime(log.created_at)}</td>
                                <td className="px-8 py-6">
                                    <div className="flex items-center space-x-2">
                                        <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-300">
                                            {log.username.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="text-sm font-bold text-white">{log.username}</span>
                                    </div>
                                </td>
                                <td className="px-8 py-6">
                                    <span className={`px-2.5 py-1 rounded text-[10px] font-black border uppercase tracking-tighter ${getActionColor(log.action)}`}>
                                        {log.action.replace(/_/g, ' ')}
                                    </span>
                                </td>
                                <td className="px-8 py-6 text-sm text-slate-300 font-medium max-w-xs truncate">{log.description || '-'}</td>
                                <td className="px-8 py-6 text-xs text-slate-500 font-mono">{log.ip_address}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="p-6 border-t border-slate-800 bg-slate-950/20 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Showing last 50 events</span>
                <div className="flex space-x-2">
                    <button className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-500 hover:text-white disabled:opacity-30" disabled>
                        <ChevronLeftIcon className="h-4 w-4" />
                    </button>
                    <button className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-500 hover:text-white disabled:opacity-30" disabled>
                        <ChevronRightIcon className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}
