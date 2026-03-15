import { useState, useEffect } from 'react'
import {
    SparklesIcon,
    ChartBarIcon,
    ShieldCheckIcon,
    UsersIcon,
    ClockIcon,
    CheckCircleIcon,
    ArrowRightIcon,
    CreditCardIcon,
    XMarkIcon
} from '@heroicons/react/24/outline'
import { njangiApi } from '../services/njangiApi'
import { mobileMoneyApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { formatCurrency } from '../utils/formatters'
import toast from 'react-hot-toast'

export default function NjangiDashboard() {
    const { user } = useAuthStore()
    const [groups, setGroups] = useState<any[]>([])
    const [selectedGroup, setSelectedGroup] = useState<any>(null)
    const [ledger, setLedger] = useState<any>(null)
    const [readiness, setReadiness] = useState<any>(null)
    const [insights, setInsights] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [isContributing, setIsContributing] = useState(false)

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        try {
            setLoading(true)
            const groupsRes = await njangiApi.getGroups()
            setGroups(groupsRes.data)

            if (groupsRes.data.length > 0) {
                const group = groupsRes.data[0]
                setSelectedGroup(group)

                const [ledgerRes, insightsRes, readinessRes] = await Promise.all([
                    njangiApi.getGroupLedger(group.id),
                    njangiApi.getGroupInsights(group.id),
                    njangiApi.getReadiness(group.president_id || 1) // Dynamic member ID
                ])

                setLedger(ledgerRes.data)
                setInsights(insightsRes.data)
                setReadiness(readinessRes.data)
            }
        } catch (error) {
            console.error('Error fetching Njangi data', error)
            toast.error('Could not load Njangi data')
        } finally {
            setLoading(false)
        }
    }

    const handleContribute = async (amount: number, channel: string) => {
        if (!selectedGroup || !ledger) return

        try {
            if (channel === 'MTN_MOMO' || channel === 'ORANGE_MONEY') {
                const phone = prompt(`Please enter your ${channel} phone number (e.g. 671234567):`)
                if (!phone) return

                await mobileMoneyApi.collect({
                    provider: channel,
                    phone_number: phone,
                    amount: amount,
                    account_id: 1, // Assume main or internal settling account
                    description: `Njangi contribution for Cycle ${ledger.cycle_id}`
                })
                toast.success(`${channel} Request Sent! Please check your phone to confirm the payment.`)
            } else {
                await njangiApi.recordContribution({
                    cycle_id: ledger.cycle_id || 1,
                    member_id: 1, // Placeholder
                    amount_paid: amount,
                    payment_channel: channel
                })
                toast.success('Contribution recorded successfully!')
            }
            setIsContributing(false)
            fetchData()
        } catch (error) {
            console.error('Contribution failed', error)
            toast.error('Payment failed. Please try again.')
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
            </div>
        )
    }

    // Empty state: user does not belong to any Njangi group yet
    if (groups.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
                <div className="bg-indigo-100 dark:bg-indigo-900/30 rounded-full p-6 mb-6">
                    <UsersIcon className="w-14 h-14 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">Smart Njangi Workspace</h1>
                <p className="text-gray-500 dark:text-gray-400 max-w-md mb-8 leading-relaxed">
                    You are not a member of any Njangi group yet. Ask your branch teller or Ops Manager to register your group and invite you to start building your credit score.
                </p>
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 max-w-sm w-full shadow-sm">
                    <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center">
                        <ShieldCheckIcon className="w-5 h-5 mr-2 text-indigo-500" />
                        Why Join Njangi?
                    </h3>
                    <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400 text-left">
                        <li className="flex items-start"><span className="text-indigo-400 font-bold mr-2">✓</span> Build a formal credit score through social savings</li>
                        <li className="flex items-start"><span className="text-indigo-400 font-bold mr-2">✓</span> Access preferential loan rates at Munimun Seamen's</li>
                        <li className="flex items-start"><span className="text-indigo-400 font-bold mr-2">✓</span> Pay dues via MTN MoMo or Orange Money</li>
                        <li className="flex items-start"><span className="text-indigo-400 font-bold mr-2">✓</span> Real-time group ledger and AI insights</li>
                    </ul>
                </div>
            </div>
        )
    }

    const stats = [
        {
            name: 'Total Group Savings',
            value: ledger?.current_pot ? formatCurrency(ledger.current_pot) : '0 XAF',
            icon: ChartBarIcon,
            color: 'text-green-600',
            bgColor: 'bg-green-100'
        },
        {
            name: 'My Trust Score',
            value: readiness ? `${readiness.avg_trust_score.toFixed(0)}/100` : '80/100',
            icon: ShieldCheckIcon,
            color: 'text-blue-600',
            bgColor: 'bg-blue-100'
        },
        {
            name: 'Active Members',
            value: ledger?.contributions?.length.toString() || '0',
            icon: UsersIcon,
            color: 'text-purple-600',
            bgColor: 'bg-purple-100'
        },
        {
            name: 'Next Payout',
            value: ledger?.due_date ? new Date(ledger.due_date).toLocaleDateString() : 'Dec 15',
            icon: ClockIcon,
            color: 'text-orange-600',
            bgColor: 'bg-orange-100'
        },
    ]

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <header className="mb-8 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Smart Njangi Workspace</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">Digitizing social trust into formal financial capital.</p>
                </div>
                <div className="flex space-x-3">
                    <button
                        onClick={() => fetchData()}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                    >
                        Refresh Data
                    </button>
                </div>
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {stats.map((stat) => (
                    <div key={stat.name} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center space-x-4">
                        <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                            <stat.icon className={`w-6 h-6 ${stat.color}`} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{stat.name}</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Ledger Section */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
                            <SparklesIcon className="w-5 h-5 mr-3 text-indigo-600" />
                            Live Ledger: {selectedGroup?.name || 'Loading group...'}
                        </h2>
                        <div className="flex items-center space-x-2">
                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                                Cycle #{ledger?.cycle_number || 1}
                            </span>
                            <span className="text-xs text-gray-500">
                                Pot Target: {ledger ? formatCurrency(ledger.pot_target) : '---'}
                            </span>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-50 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-900/10">
                                    <th className="px-6 py-4 font-medium">Member</th>
                                    <th className="px-6 py-4 font-medium">Status</th>
                                    <th className="px-6 py-4 font-medium">Amount</th>
                                    <th className="px-6 py-4 font-medium">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                {ledger?.contributions?.map((row: any, i: number) => (
                                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs mr-3">
                                                    M{i}
                                                </div>
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                    Member {row.member_id}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center text-green-600">
                                                <CheckCircleIcon className="w-4 h-4 mr-1.5" />
                                                <span className="text-xs font-bold uppercase tracking-tight">{row.status.replace(/_/g, ' ')}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm font-bold text-gray-900 dark:text-white">
                                                {formatCurrency(row.amount_paid)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(row.created_at).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}

                                {(!ledger || ledger.contributions.length === 0) && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500 italic">
                                            No contributions found for this cycle.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Sidebar */}
                <div className="space-y-6">
                    {/* Credit Bridge Card */}
                    <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl shadow-xl p-6 text-white border border-white/10">
                        <h2 className="text-xl font-bold mb-4 flex items-center">
                            <ShieldCheckIcon className="w-6 h-6 mr-2 text-blue-200" />
                            Credit Union Bridge
                        </h2>
                        <p className="text-blue-100 text-sm mb-6 leading-relaxed">
                            Your consistent Njangi behavior is building your formal credit score at Munimun Seamen's Cooperative.
                        </p>

                        <div className="bg-white/10 rounded-xl p-4 border border-white/10 mb-6">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium">Loan Readiness</span>
                                <span className="text-lg font-bold">{readiness ? `${readiness.readiness_score.toFixed(0)}%` : '0%'}</span>
                            </div>
                            <div className="w-full bg-white/20 rounded-full h-2">
                                <div className="bg-white h-2 rounded-full" style={{ width: readiness ? `${readiness.readiness_score}%` : '0%' }}></div>
                            </div>
                            <p className="text-[10px] text-blue-200 mt-2 font-bold uppercase tracking-widest">
                                Status: {readiness?.status || 'Calculating...'}
                            </p>
                        </div>

                        <button className="w-full bg-white text-indigo-700 py-3 rounded-xl font-bold text-sm hover:bg-blue-50 transition flex items-center justify-center group">
                            View Formal Loan Options
                            <ArrowRightIcon className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>

                    {/* AI Insights NewsFeed */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                        <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                            <SparklesIcon className="w-5 h-5 mr-2 text-amber-500" />
                            AI Group Insights
                        </h3>
                        <div className="space-y-4">
                            {insights.length > 0 ? insights.map((insight: any) => (
                                <div key={insight.id} className="flex space-x-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700">
                                    <div className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${insight.insight_type === 'DEFAULT_WARNING' ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
                                    <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                                        {insight.message}
                                    </p>
                                </div>
                            )) : (
                                <p className="text-xs text-gray-500 text-center py-4 italic">No recent alerts. High liquidity expected.</p>
                            )}
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                        <h3 className="font-bold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setIsContributing(true)}
                                className="flex flex-col items-center justify-center p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50/50 transition group"
                            >
                                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600 mb-2">
                                    <CreditCardIcon className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-bold text-gray-600 dark:text-gray-400">Pay Dues</span>
                            </button>

                            <button
                                onClick={() => toast.success('Add Member Portal Coming Soon')}
                                className="flex flex-col items-center justify-center p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 hover:bg-indigo-50/50 transition"
                            >
                                <div className="p-2 rounded-lg bg-green-100 text-green-600 mb-2">
                                    <UsersIcon className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-bold text-gray-600 dark:text-gray-400">Add Member</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Contribution Modal */}
            {isContributing && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full p-8 relative">
                        <button
                            onClick={() => setIsContributing(false)}
                            className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            <XMarkIcon className="w-6 h-6" />
                        </button>

                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Pay Njangi Dues</h2>
                        <p className="text-gray-500 text-sm mb-8">Select your payment method for this cycle's contribution.</p>

                        <div className="space-y-4 mb-8">
                            <div className="p-4 rounded-xl border-2 border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-between">
                                <div className="flex items-center">
                                    <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center font-bold text-yellow-900 mr-4">MTN</div>
                                    <div>
                                        <p className="font-bold text-gray-900 dark:text-white text-sm">MTN MoMo</p>
                                        <p className="text-[10px] text-gray-500">Fast & Integrated</p>
                                    </div>
                                </div>
                                <span className="text-sm font-bold text-indigo-600">Selected</span>
                            </div>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-6 mb-8">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-gray-500 uppercase font-bold tracking-widest">Amount Due</span>
                                <span className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(selectedGroup?.contribution_amount || 0)}</span>
                            </div>
                        </div>

                        <button
                            onClick={() => handleContribute(selectedGroup?.contribution_amount || 0, 'MTN_MOMO')}
                            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition shadow-lg"
                        >
                            Confirm Payment
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
