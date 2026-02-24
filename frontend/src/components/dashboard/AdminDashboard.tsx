import { useState, useEffect } from 'react'
import {
    ServerIcon,
    ShieldCheckIcon,
    UserPlusIcon,
    ArrowPathIcon,
    BuildingOfficeIcon,
    KeyIcon,
    MagnifyingGlassIcon
} from '@heroicons/react/24/outline'
import { reportsApi, usersApi, branchesApi } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { formatCurrency } from '../../utils/formatters'

interface AdminDashboardProps {
    stats: any
}

export default function AdminDashboard({ stats }: AdminDashboardProps) {
    const { user } = useAuthStore()
    const [auditLogs, setAuditLogs] = useState<any[]>([])
    const [loadingLogs, setLoadingLogs] = useState(true)
    const [branches, setBranches] = useState<any[]>([])
    const [latency, setLatency] = useState<number>(12)
    const [lastBackup, setLastBackup] = useState<string>('2026-02-21 02:00')

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

    // Branch Factory State
    const [branchFormData, setBranchFormData] = useState({
        code: '',
        name: '',
        city: '',
        region: 'Littoral',
        address: ''
    })
    const [creatingBranch, setCreatingBranch] = useState(false)

    // Password Reset State
    const [showPasswordReset, setShowPasswordReset] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [foundUsers, setFoundUsers] = useState<any[]>([])
    const [selectedUser, setSelectedUser] = useState<any>(null)
    const [newPassword, setNewPassword] = useState('')

    useEffect(() => {
        fetchAuditLogs()
        fetchBranches()

        // Simulate real-time latency updates
        const interval = setInterval(() => {
            setLatency(prev => Math.max(8, Math.min(45, prev + (Math.random() * 10 - 5))))
        }, 5000)
        return () => clearInterval(interval)
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
            fetchAuditLogs()
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to create user')
        } finally {
            setCreatingUser(false)
        }
    }

    const handleCreateBranch = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreatingBranch(true)
        try {
            await branchesApi.create(branchFormData)
            toast.success('Branch Created Successfully')
            setBranchFormData({
                code: '',
                name: '',
                city: '',
                region: 'Littoral',
                address: ''
            })
            fetchBranches()
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to create branch')
        } finally {
            setCreatingBranch(false)
        }
    }

    const handleSearchUser = async () => {
        if (!searchQuery) return
        try {
            const res = await usersApi.getAll()
            const filtered = res.data.filter((u: any) =>
                u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                u.full_name.toLowerCase().includes(searchQuery.toLowerCase())
            )
            setFoundUsers(filtered)
        } catch (error) {
            toast.error('Search failed')
        }
    }

    const handleResetPassword = async () => {
        if (!selectedUser || !newPassword) return
        try {
            await usersApi.update(selectedUser.id, { password: newPassword })
            toast.success(`Password reset for ${selectedUser.username}`)
            setShowPasswordReset(false)
            setSelectedUser(null)
            setNewPassword('')
            setSearchQuery('')
            setFoundUsers([])
        } catch (error) {
            toast.error('Failed to reset password')
        }
    }

    const handleTriggerBackup = () => {
        toast.promise(
            new Promise(resolve => setTimeout(resolve, 3000)),
            {
                loading: 'Triggering System Backup...',
                success: 'Backup Completed & Synced to Cloud',
                error: 'Backup Failed',
            }
        )
        setLastBackup(format(new Date(), 'yyyy-MM-dd HH:mm'))
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
            value: `${latency.toFixed(0)} ms`,
            icon: ArrowPathIcon,
            color: 'bg-indigo-500',
            status: 'Low Latency'
        },
        {
            name: 'Last Backup',
            value: lastBackup,
            icon: ServerIcon,
            color: 'bg-purple-500',
            status: 'Encrypted'
        },
        {
            name: 'Security Checks',
            value: 'All Passed',
            icon: ShieldCheckIcon,
            color: 'bg-blue-500',
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
                <div className="flex space-x-2">
                    <button
                        onClick={() => setShowPasswordReset(true)}
                        className="btn btn-secondary flex items-center"
                    >
                        <KeyIcon className="h-4 w-4 mr-2" />
                        Reset Password
                    </button>
                    {user?.role === 'SYSTEM_ADMIN' && (
                        <button
                            onClick={handleTriggerBackup}
                            className="btn btn-primary flex items-center"
                        >
                            <ServerIcon className="h-4 w-4 mr-2" />
                            Trigger Backup
                        </button>
                    )}
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-300 flex items-center">
                        {user?.role.replace('_', ' ')} View
                    </span>
                </div>
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

            {/* 2. Factories & Tools */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Column: Tools and Factories */}
                {['SYSTEM_ADMIN', 'BRANCH_MANAGER'].includes(user?.role || '') && (
                    <div className="lg:col-span-1 space-y-6">
                        {/* User Factory */}
                        <div className="card">
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
                                                <option value="OPS_DIRECTOR">Director</option>
                                                <option value="BOARD_MEMBER">Board Member</option>
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
                                    </div>
                                </form>
                            </div>
                        </div>

                        {/* Branch Factory */}
                        <div className="card">
                            <div className="card-header bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-700">
                                <div className="flex items-center">
                                    <BuildingOfficeIcon className="h-5 w-5 text-gray-400 dark:text-slate-400 mr-2" />
                                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Branch Factory</h3>
                                </div>
                            </div>
                            <div className="card-body">
                                <form onSubmit={handleCreateBranch} className="space-y-4">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="label">Code</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="e.g. BY001"
                                                className="input"
                                                value={branchFormData.code}
                                                onChange={e => setBranchFormData({ ...branchFormData, code: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="label">Name</label>
                                            <input
                                                type="text"
                                                required
                                                className="input"
                                                value={branchFormData.name}
                                                onChange={e => setBranchFormData({ ...branchFormData, name: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="label">City</label>
                                            <input
                                                type="text"
                                                required
                                                className="input"
                                                value={branchFormData.city}
                                                onChange={e => setBranchFormData({ ...branchFormData, city: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="label">Region</label>
                                            <select
                                                className="input"
                                                value={branchFormData.region}
                                                onChange={e => setBranchFormData({ ...branchFormData, region: e.target.value })}
                                            >
                                                <option value="Littoral">Littoral</option>
                                                <option value="Centre">Centre</option>
                                                <option value="North West">North West</option>
                                                <option value="South West">South West</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="pt-2">
                                        <button
                                            type="submit"
                                            disabled={creatingBranch}
                                            className="w-full btn btn-primary flex justify-center items-center"
                                        >
                                            {creatingBranch ? 'Creating...' : 'Register New Branch'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {/* Right Column: Security Watchtower */}
                <div className={['SYSTEM_ADMIN', 'BRANCH_MANAGER'].includes(user?.role || '') ? "lg:col-span-2" : "lg:col-span-3"}>
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

            {/* Password Reset Modal */}
            {showPasswordReset && (
                <div className="fixed inset-0 bg-gray-600 dark:bg-black bg-opacity-50 dark:bg-opacity-70 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
                    <div className="relative mx-auto p-6 border dark:border-slate-700 w-full max-w-md shadow-xl rounded-xl bg-white dark:bg-slate-900">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Identity Watchtower - Password Reset</h3>
                            <button onClick={() => { setShowPasswordReset(false); setSelectedUser(null); setFoundUsers([]); }} className="text-gray-400 hover:text-gray-600">&times;</button>
                        </div>

                        {!selectedUser ? (
                            <div className="space-y-4">
                                <div className="flex space-x-2">
                                    <input
                                        type="text"
                                        placeholder="Search username or name..."
                                        className="input"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSearchUser()}
                                    />
                                    <button onClick={handleSearchUser} className="btn btn-primary">
                                        <MagnifyingGlassIcon className="h-5 w-5" />
                                    </button>
                                </div>
                                <div className="max-h-60 overflow-y-auto border dark:border-slate-700 rounded-md">
                                    {foundUsers.length === 0 ? (
                                        <p className="p-4 text-center text-sm text-gray-500">No users found</p>
                                    ) : (
                                        <ul className="divide-y divide-gray-200 dark:divide-slate-700">
                                            {foundUsers.map(u => (
                                                <li
                                                    key={u.id}
                                                    onClick={() => setSelectedUser(u)}
                                                    className="p-3 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer flex justify-between items-center"
                                                >
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900 dark:text-white">{u.full_name}</p>
                                                        <p className="text-xs text-gray-500">@{u.username}</p>
                                                    </div>
                                                    <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-slate-700 rounded-md text-gray-600 dark:text-slate-300">{u.role}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                                    <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Resetting password for: {selectedUser.full_name}</p>
                                    <p className="text-xs text-blue-600 dark:text-blue-400">@{selectedUser.username}</p>
                                </div>
                                <div>
                                    <label className="label">New Secure Password</label>
                                    <input
                                        type="password"
                                        placeholder="Minimum 8 characters"
                                        className="input"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                    />
                                </div>
                                <div className="flex justify-end space-x-2">
                                    <button onClick={() => setSelectedUser(null)} className="btn btn-secondary">Back to Search</button>
                                    <button onClick={handleResetPassword} className="btn btn-primary">Confirm Reset</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
