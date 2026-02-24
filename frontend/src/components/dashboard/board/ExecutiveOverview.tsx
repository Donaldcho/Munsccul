import { useState, useEffect } from 'react'
import {
    PieChart, Pie, Cell, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts'
import {
    ArrowUpIcon,
    ArrowDownIcon,
    ExclamationTriangleIcon,
    BanknotesIcon,
    ArrowTrendingUpIcon,
    ChartPieIcon
} from '@heroicons/react/24/solid'
import { reportsApi, loansApi } from '../../../services/api'
import { formatCurrency } from '../../../utils/formatters'

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b']

export default function ExecutiveOverview() {
    const [stats, setStats] = useState<any>(null)
    const [liquidity, setLiquidity] = useState<any>(null)
    const [parStats, setParStats] = useState<any>(null)
    const [boardMetrics, setBoardMetrics] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchData() {
            try {
                const [dashRes, liqRes, parRes, metricsRes] = await Promise.all([
                    reportsApi.getDashboard(),
                    reportsApi.getCobacLiquidity('daily'),
                    reportsApi.getParReport(),
                    reportsApi.getBoardMetrics()
                ])
                setStats(dashRes.data)
                setLiquidity(liqRes.data)
                setParStats(parRes.data)
                setBoardMetrics(metricsRes.data)
            } catch (err) {
                console.error('Failed to fetch board metrics', err)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
            </div>
        )
    }

    const sectorData = boardMetrics?.sector_data || []
    const branchData = boardMetrics?.branch_data || []
    const anomalies = boardMetrics?.anomalies || []

    return (
        <div className="space-y-10 animate-fade-in">
            {/* Row 1: COBAC Traffic Lights */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* KPI 1: Liquidity */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">COBAC Liquidity</span>
                        <div className={`h-3 w-3 rounded-full animate-pulse ${(liquidity?.ratio || 0) >= 100 ? 'bg-emerald-500 box-shadow-emerald' :
                            (liquidity?.ratio || 0) >= 80 ? 'bg-amber-500 box-shadow-amber' : 'bg-rose-500 box-shadow-rose'
                            }`}></div>
                    </div>
                    <div className="flex items-end justify-between">
                        <div>
                            <p className="text-4xl font-bold text-white">{(liquidity?.ratio || 0).toFixed(1)}%</p>
                            <p className={`text-xs font-bold mt-2 ${(liquidity?.ratio || 0) >= 100 ? 'text-emerald-400' : 'text-rose-400'
                                }`}>
                                {(liquidity?.ratio || 0) >= 100 ? 'COMPLIANT' : 'NON-COMPLIANT'}
                            </p>
                        </div>
                        <div className="h-16 w-16 relative">
                            <svg className="h-full w-full" viewBox="0 0 36 36">
                                <path className="text-slate-800 stroke-current" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                <path className={`${(liquidity?.ratio || 0) >= 100 ? 'text-emerald-500' : 'text-rose-500'} stroke-current`} strokeWidth="3" strokeDasharray={`${Math.min(liquidity?.ratio || 0, 100)}, 100`} fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* KPI 2: PAR 30+ */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Portfolio At Risk (30+)</span>
                        <div className={`h-3 w-3 rounded-full animate-pulse ${(parStats?.par_ratio_percentage || 0) < 5 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                    </div>
                    <div>
                        <p className="text-4xl font-bold text-white">{(parStats?.par_ratio_percentage || 0).toFixed(2)}%</p>
                        <div className="flex items-center mt-2">
                            {(parStats?.par_ratio_percentage || 0) < 5 ? (
                                <ArrowDownIcon className="h-4 w-4 text-emerald-400 mr-1" />
                            ) : (
                                <ArrowUpIcon className="h-4 w-4 text-rose-400 mr-1" />
                            )}
                            <span className={`text-xs font-bold ${(parStats?.par_ratio_percentage || 0) < 5 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {(parStats?.par_ratio_percentage || 0) < 5 ? 'Strong' : 'Critical'} Oversight Required
                            </span>
                        </div>
                    </div>
                </div>

                {/* KPI 3: Assets vs Liabilities */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Net Position</span>
                        <BanknotesIcon className="h-5 w-5 text-indigo-400" />
                    </div>
                    <div>
                        <div className="flex flex-col">
                            <span className="text-xs text-slate-500 font-bold mb-1">Total Assets (XAF)</span>
                            <p className="text-2xl font-bold text-white">{formatCurrency(stats?.loans?.total_outstanding || 0)}</p>
                        </div>
                        <div className="mt-3 pt-3 border-t border-slate-800 flex flex-col">
                            <span className="text-xs text-slate-500 font-bold mb-1">Total Liabilities (Deposits)</span>
                            <p className="text-lg font-bold text-slate-300">{formatCurrency(stats?.accounts?.total_deposits || 0)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Row 2: Portfolio Visualizations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Chart 1: Sector Risk */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center space-x-3">
                            <ChartPieIcon className="h-5 w-5 text-indigo-400" />
                            <h3 className="text-lg font-bold text-white">Loan Distribution by Sector</h3>
                        </div>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Risk Allocation</span>
                    </div>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={sectorData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {sectorData.map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Chart 2: Branch Performance */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center space-x-3">
                            <ArrowTrendingUpIcon className="h-5 w-5 text-indigo-400" />
                            <h3 className="text-lg font-bold text-white">Branch Cash Performance</h3>
                        </div>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Growth Metrics</span>
                    </div>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={branchData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${v / 1000}M`} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Legend iconType="circle" />
                                <Bar dataKey="deposits" name="Net Deposits" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="loans" name="Loan Portfolio" fill="#ec4899" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Row 3: Anomaly Radar */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-3">
                        <ExclamationTriangleIcon className="h-5 w-5 text-rose-500" />
                        <h3 className="text-lg font-bold text-white">Audit & Anomaly Radar</h3>
                    </div>
                    <div className="flex space-x-2">
                        <span className="px-2 py-1 bg-rose-500/10 text-rose-500 text-[10px] font-bold rounded uppercase">Critical: 2</span>
                        <span className="px-2 py-1 bg-amber-500/10 text-amber-500 text-[10px] font-bold rounded uppercase">Warnings: 1</span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left border-b border-slate-800">
                                <th className="pb-4 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Severity</th>
                                <th className="pb-4 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Event Description</th>
                                <th className="pb-4 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Location</th>
                                <th className="pb-4 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Timestamp</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {anomalies.map((anno: any) => (
                                <tr key={anno.id} className="group hover:bg-slate-800/20 transition-colors">
                                    <td className="py-4">
                                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${anno.type === 'CRITICAL' ? 'bg-rose-500/20 text-rose-500' : 'bg-amber-500/20 text-amber-500'
                                            }`}>
                                            {anno.type}
                                        </span>
                                    </td>
                                    <td className="py-4 text-sm font-medium text-slate-200">{anno.msg}</td>
                                    <td className="py-4 text-sm text-slate-500">{anno.location}</td>
                                    <td className="py-4 text-sm text-slate-500 font-mono tracking-tighter">{anno.time}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
