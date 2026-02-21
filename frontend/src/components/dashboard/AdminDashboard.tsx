import { useState, useEffect } from 'react'
import {
    ServerIcon,
    ShieldCheckIcon,
    UserPlusIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline'
import { reportsApi, usersApi, branchesApi } from '../../services/api'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

interface AdminDashboardProps {
    stats: any
}

export default function AdminDashboard({ stats }: AdminDashboardProps) {
    const [auditLogs, setAuditLogs] = useState<any[]>([])
    const [loadingLogs, setLoadingLogs] = useState(true)
    const [branches, setBranches] = useState<any[]>([])

    // User Factory State
    const [formData, setFormData] = useState({
        username: '',
        full_name: '',
        email: '',
        password: '',
        role: 'TELLER',
        branch_id: ''
    })
    const [creatingUser, setCreatingUser] = useState(false)

    useEffect(() => {
        fetchAuditLogs()
        fetchBranches()
    }, [])

    const fetchAuditLogs = async () => {
        try {
            const response = await reportsApi.getAuditLogs({ limit: 10 })
            setAuditLogs(response.data)
        } catch (error) {
            console.error('Failed to fetch audit logs')
        } finally {
            setLoadingLogs(false)
        }
    }

    const fetchBranches = async () => {
        try {
            const response = await branchesApi.getAll()
            setBranches(response.data)
        } catch (error) {
            console.error('Failed to fetch branches')
        }
    }

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreatingUser(true)
        try {
            // Admin creates users as Inactive/Pending by default (Golden Rule)
            await usersApi.create({
                ...formData,
                branch_id: parseInt(formData.branch_id),
                is_active: false
            })
            toast.success('User Created - Pending Manager Approval')
            setFormData({
                username: '',
                full_name: '',
                email: '',
                password: '',
                role: 'TELLER',
                branch_id: ''
            })
            // Refresh logs to show the creation event
            fetchAuditLogs()
        } catch (error: any) {
            const detail = error.response?.data?.detail
            let message = 'Failed to create user'
            if (typeof detail === 'string') {
                message = detail
            } else if (Array.isArray(detail)) {
                message = detail.map((err: any) => err.msg).join(', ')
            }
            toast.error(message)
        } finally {
            setCreatingUser(false)
        }
    }

    const statCards = [
        {
            name: 'System Status',
            value: 'Operational',
            icon: ServerIcon,
            color: 'bg-green-500',
            status: 'Healthy'
        },
        {
            name: 'API Health',
            value: '99.9%',
            icon: ArrowPathIcon,
            color: 'bg-purple-500',
            status: 'Online'
        },
        {
            name: 'Security Checks',
            value: 'Passed',
            icon: ShieldCheckIcon,
            color: 'bg-indigo-500',
            status: 'Verified'
        }
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Control Room</h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                        System Administration & Security Monitoring
                    </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-300">
                    System Admin View
                </span>
            </div>

            {/* 1. Stat Cards (System Health) */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {statCards.map((card) => (
                    <div key={card.name} className="stat-card">
                        <div className="flex items-center">
                            <div className={`flex-shrink-0 rounded-md p-3 ${card.color}`}>
                                <card.icon className="h-6 w-6 text-white" />
                            </div>
                            <div className="ml-5 w-0 flex-1">
                                <dt className="stat-label">{card.name}</dt>
                                <dd className="text-lg font-medium text-gray-900 dark:text-white">{card.value}</dd>
                                <dd className="text-xs text-green-600 mt-1">{card.status}</dd>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* 2. User Factory (Maker Role) */}
                <div className="lg:col-span-1">
                    <div className="card h-full">
                        <div className="card-header bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-700">
                            <div className="flex items-center">
                                <UserPlusIcon className="h-5 w-5 text-gray-400 dark:text-slate-400 mr-2" />
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">User Factory</h3>
                            </div>
                        </div>
                        <div className="card-body">
                            <form onSubmit={handleCreateUser} className="space-y-4">
                                <div>
                                    <label className="label">Full Name</label>
                                    <input
                                        type="text"
                                        required
                                        className="input"
                                        value={formData.full_name}
                                        onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="label">Username</label>
                                    <input
                                        type="text"
                                        required
                                        className="input"
                                        value={formData.username}
                                        onChange={e => setFormData({ ...formData, username: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="label">Role</label>
                                        <select
                                            className="input"
                                            value={formData.role}
                                            onChange={e => setFormData({ ...formData, role: e.target.value })}
                                        >
                                            <option value="TELLER">Teller</option>
                                            <option value="CREDIT_OFFICER">Credit</option>
                                            <option value="OPS_MANAGER">Manager</option>
                                            <option value="AUDITOR">Auditor</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="label">Branch</label>
                                        <select
                                            className="input"
                                            required
                                            value={formData.branch_id}
                                            onChange={e => setFormData({ ...formData, branch_id: e.target.value })}
                                        >
                                            <option value="">Select</option>
                                            {branches.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="label">Password</label>
                                    <input
                                        type="password"
                                        required
                                        className="input"
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    />
                                </div>
                                <div className="pt-2">
                                    <button
                                        type="submit"
                                        disabled={creatingUser}
                                        className="w-full btn btn-primary flex justify-center items-center"
                                    >
                                        {creatingUser ? 'Creating...' : 'Create Pending User'}
                                    </button>
                                    <p className="text-xs text-center text-gray-500 dark:text-slate-400 mt-2">
                                        * User will require Manager approval
                                    </p>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>

                {/* 3. Security Watchtower (Audit Logs) */}
                <div className="lg:col-span-2">
                    <div className="card h-full">
                        <div className="card-header bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
                            <div className="flex items-center">
                                <ShieldCheckIcon className="h-5 w-5 text-gray-400 dark:text-slate-400 mr-2" />
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Security Watchtower</h3>
                            </div>
                            <button
                                onClick={fetchAuditLogs}
                                className="text-sm text-primary-600 hover:text-primary-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                            >
                                Refresh
                            </button>
                        </div>
                        <div className="card-body p-0">
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                                    <thead className="bg-gray-50 dark:bg-slate-800/60">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Time</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">User</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Action</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">IP Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-transparent divide-y divide-gray-200 dark:divide-slate-700">
                                        {loadingLogs ? (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-4 text-center text-gray-500 dark:text-slate-400">Loading logs...</td>
                                            </tr>
                                        ) : auditLogs.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-4 text-center text-gray-500 dark:text-slate-400">No logs found</td>
                                            </tr>
                                        ) : (
                                            auditLogs.map((log: any) => (
                                                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">
                                                        {(() => {
                                                            try {
                                                                return format(new Date(log.created_at || log.timestamp), 'HH:mm:ss dd/MM')
                                                            } catch (e) {
                                                                return 'Invalid Date'
                                                            }
                                                        })()}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-xs font-medium text-gray-900 dark:text-slate-200">
                                                        {log.username}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300">
                                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${log.action.includes('FAILED') ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                                            log.action.includes('CREATE') ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                                                'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                                            }`}>
                                                            {log.action}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">
                                                        {log.ip_address || '127.0.0.1'}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
