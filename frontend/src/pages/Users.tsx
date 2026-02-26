import { useState, useEffect } from 'react'
import {
    PlusIcon,
    MagnifyingGlassIcon,
    KeyIcon
} from '@heroicons/react/24/outline'
import { usersApi, branchesApi } from '../services/api'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/authStore'

interface User {
    id: number
    username: string
    full_name: string
    email: string
    role: string
    branch_id: number
    is_active: boolean
    approval_status: string
    transaction_limit: number
    last_login: string
    created_at: string
}

interface Branch {
    id: number
    name: string
    code: string
}

export default function Users() {
    const { user } = useAuthStore()
    const [users, setUsers] = useState<User[]>([])
    const [branches, setBranches] = useState<Branch[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [showApprovalModal, setShowApprovalModal] = useState(false)
    const [selectedUser, setSelectedUser] = useState<User | null>(null)
    const [approvalLimit, setApprovalLimit] = useState('0')

    // Form state
    const [formData, setFormData] = useState({
        username: '',
        full_name: '',
        email: '',
        password: '',
        role: 'TELLER',
        branch_id: ''
    })

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        try {
            setLoading(true)
            const [usersResponse, branchesResponse] = await Promise.all([
                usersApi.getAll(),
                branchesApi.getAll()
            ])
            setUsers(usersResponse.data)
            setBranches(branchesResponse.data)
        } catch (error) {
            console.error('Error fetching data:', error)
            toast.error('Failed to load users')
        } finally {
            setLoading(false)
        }
    }

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await usersApi.create({
                ...formData,
                branch_id: parseInt(formData.branch_id),
                is_active: true
            })
            toast.success('User created successfully')
            setShowModal(false)
            setFormData({
                username: '',
                full_name: '',
                email: '',
                password: '',
                role: 'TELLER',
                branch_id: ''
            })
            fetchData()
        } catch (error: any) {
            const detail = error.response?.data?.detail
            let message = 'Failed to create user'
            if (typeof detail === 'string') {
                message = detail
            } else if (Array.isArray(detail)) {
                message = detail.map((err: any) => err.msg).join(', ')
            }
            toast.error(message)
        }
    }

    const handleApproveUser = async (userId: number, approve: boolean) => {
        try {
            await usersApi.approve(userId, {
                approve,
                transaction_limit: parseFloat(approvalLimit)
            })
            toast.success(`User ${approve ? 'approved' : 'rejected'} successfully`)
            setShowApprovalModal(false)
            setApprovalLimit('0')
            fetchData()
        } catch (error: any) {
            const detail = error.response?.data?.detail
            let message = 'Failed to update user status'
            if (typeof detail === 'string') {
                message = detail
            } else if (Array.isArray(detail)) {
                message = detail.map((err: any) => err.msg).join(', ')
            }
            toast.error(message)
        }
    }

    const handleSuspendUser = async (userId: number) => {
        if (!confirm('Are you sure you want to suspend this user? They will be locked out immediately.')) return
        try {
            await usersApi.update(userId, { is_active: false })
            toast.success('User suspended successfully')
            fetchData()
        } catch (error: any) {
            const detail = error.response?.data?.detail
            let message = 'Failed to suspend user'
            if (typeof detail === 'string') {
                message = detail
            } else if (Array.isArray(detail)) {
                message = detail.map((err: any) => err.msg).join(', ')
            }
            toast.error(message)
        }
    }

    const handleRestoreUser = async (userId: number) => {
        if (!confirm('Are you sure you want to restore this user? They will regain access.')) return
        try {
            await usersApi.update(userId, { is_active: true })
            toast.success('User restored successfully')
            fetchData()
        } catch (error: any) {
            const detail = error.response?.data?.detail
            let message = 'Failed to restore user'
            if (typeof detail === 'string') {
                message = detail
            } else if (Array.isArray(detail)) {
                message = detail.map((err: any) => err.msg).join(', ')
            }
            toast.error(message)
        }
    }

    const handleRevokeAccess = async (userId: number, fullName: string) => {
        if (!confirm(`Are you sure you want to revoke access for ${fullName}? They will be locked out immediately. This should be used when a staff member leaves the institution.`)) return
        try {
            await usersApi.update(userId, { is_active: false })
            toast.success(`Access revoked for ${fullName}`)
            fetchData()
        } catch (error: any) {
            const detail = error.response?.data?.detail
            toast.error(typeof detail === 'string' ? detail : 'Failed to revoke access')
        }
    }

    const handleTriggerPinReset = async (userId: number, username: string) => {
        if (!confirm(`Are you sure you want to trigger a PIN reset for ${username}? They will receive a link to set a new PIN.`)) return
        try {
            await usersApi.triggerPinReset(userId)
            toast.success(`PIN reset triggered for ${username}`)
        } catch (error: any) {
            toast.error('Failed to trigger PIN reset')
        }
    }

    const filteredUsers = users.filter(user =>
        user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.role.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const getBranchName = (branchId: number) => {
        const branch = branches.find(b => b.id === branchId)
        return branch ? branch.name : 'Unknown'
    }

    return (
        <div className="card">
            <div className="card-header flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-lg font-medium text-gray-900">User Management</h3>
                    <p className="text-sm text-gray-500">Manage system users and their roles</p>
                </div>
                {user?.role === 'SYSTEM_ADMIN' && (
                    <button
                        onClick={() => setShowModal(true)}
                        className="btn btn-primary flex items-center"
                    >
                        <PlusIcon className="h-5 w-5 mr-2" />
                        Add User
                    </button>
                )}
            </div>

            <div className="p-4 border-b border-gray-200">
                <div className="relative rounded-md shadow-sm max-w-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                    </div>
                    <input
                        type="text"
                        className="input pl-10"
                        placeholder="Search users..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                User
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Role
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Branch
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Limit (FCFA)
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Last Login
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                                    Loading users...
                                </td>
                            </tr>
                        ) : filteredUsers.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                                    No users found
                                </td>
                            </tr>
                        ) : (
                            filteredUsers.map((user) => (
                                <tr key={user.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold">
                                                {user.full_name.charAt(0)}
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-medium text-gray-900">{user.full_name}</div>
                                                <div className="text-sm text-gray-500">{user.username}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 capitalize">
                                            {user.role.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {getBranchName(user.branch_id)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                                        {new Intl.NumberFormat().format(user.transaction_limit)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {user.is_active ? (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                                Active
                                            </span>
                                        ) : (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                                Inactive
                                            </span>
                                        )}
                                        {user.approval_status === 'PENDING' && (
                                            <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                                Pending Approval
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        {/* PENDING: OPS_MANAGER approves/rejects; Admin sees status */}
                                        {user.approval_status === 'PENDING' && (
                                            <div className="flex space-x-2 items-center">
                                                {(useAuthStore.getState().user?.role === 'OPS_MANAGER' || useAuthStore.getState().user?.role === 'OPS_DIRECTOR') && (
                                                    <>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedUser(user)
                                                                setShowApprovalModal(true)
                                                            }}
                                                            className="text-green-600 hover:text-green-900 text-xs bg-green-50 px-2 py-1 rounded border border-green-200"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={() => handleApproveUser(user.id, false)}
                                                            className="text-red-600 hover:text-red-900 text-xs bg-red-50 px-2 py-1 rounded border border-red-200"
                                                        >
                                                            Reject
                                                        </button>
                                                    </>
                                                )}
                                                {useAuthStore.getState().user?.role === 'SYSTEM_ADMIN' && (
                                                    <span className="text-yellow-600 text-xs italic flex items-center gap-1">
                                                        ⏳ Awaiting Ops Manager Approval
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* APPROVED: OPS_MANAGER suspends/restores; Admin can revoke if staff leaves */}
                                        {user.approval_status === 'APPROVED' && (
                                            <div className="flex items-center space-x-2 flex-wrap gap-1">
                                                {/* Status badge */}
                                                {user.is_active
                                                    ? <span className="text-green-700 text-xs font-medium">✓ Active</span>
                                                    : <span className="text-gray-500 text-xs font-medium">Suspended</span>
                                                }

                                                {/* OPS_MANAGER controls */}
                                                {user.is_active && (useAuthStore.getState().user?.role === 'OPS_MANAGER' || useAuthStore.getState().user?.role === 'OPS_DIRECTOR') && (
                                                    <button
                                                        onClick={() => handleSuspendUser(user.id)}
                                                        className="text-orange-600 hover:text-orange-900 text-xs bg-orange-50 px-2 py-1 rounded border border-orange-200"
                                                    >
                                                        Suspend
                                                    </button>
                                                )}
                                                {!user.is_active && (useAuthStore.getState().user?.role === 'OPS_MANAGER' || useAuthStore.getState().user?.role === 'OPS_DIRECTOR') && (
                                                    <button
                                                        onClick={() => handleRestoreUser(user.id)}
                                                        className="text-green-600 hover:text-green-900 text-xs bg-green-50 px-2 py-1 rounded border border-green-200"
                                                    >
                                                        Restore
                                                    </button>
                                                )}

                                                {/* SYSTEM_ADMIN: Revoke Access (for staff who've left) + PIN Reset */}
                                                {useAuthStore.getState().user?.role === 'SYSTEM_ADMIN' && user.is_active && (
                                                    <>
                                                        <button
                                                            onClick={() => handleTriggerPinReset(user.id, user.username)}
                                                            className="text-primary-600 hover:text-primary-900 flex items-center gap-1 text-xs bg-primary-50 px-2 py-1 rounded border border-primary-200"
                                                            title="Trigger Secure PIN Reset"
                                                        >
                                                            <KeyIcon className="h-3 w-3" />
                                                            Reset PIN
                                                        </button>
                                                        <button
                                                            onClick={() => handleRevokeAccess(user.id, user.full_name)}
                                                            className="text-red-600 hover:text-red-900 text-xs bg-red-50 px-2 py-1 rounded border border-red-200"
                                                            title="Revoke access — use when staff leaves the institution"
                                                        >
                                                            Revoke Access
                                                        </button>
                                                    </>
                                                )}
                                                {useAuthStore.getState().user?.role === 'SYSTEM_ADMIN' && !user.is_active && (
                                                    <span className="text-gray-400 text-xs italic">Access revoked</span>
                                                )}
                                            </div>
                                        )}

                                        {user.approval_status === 'REJECTED' && (
                                            <span className="text-red-600 text-xs">Rejected</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add User Modal */}
            {showModal && (
                <div className="fixed z-10 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setShowModal(false)}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                            <form onSubmit={handleCreateUser}>
                                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4" id="modal-title">
                                        Create New User
                                    </h3>
                                    <div className="space-y-4">
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
                                        <div>
                                            <label className="label">Email (Optional)</label>
                                            <input
                                                type="email"
                                                className="input"
                                                value={formData.email}
                                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                            />
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
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="label">Role</label>
                                                <select
                                                    className="input"
                                                    value={formData.role}
                                                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                                                >
                                                    <option value="TELLER">Teller</option>
                                                    <option value="BRANCH_MANAGER">Branch Manager</option>
                                                    <option value="CREDIT_OFFICER">Credit Officer</option>
                                                    <option value="OPS_MANAGER">Operations Manager</option>
                                                    <option value="OPS_DIRECTOR">Operations Director</option>
                                                    <option value="BOARD_MEMBER">Board Member</option>
                                                    <option value="SYSTEM_ADMIN">System Admin</option>
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
                                                    <option value="">Select Branch</option>
                                                    {branches.map(branch => (
                                                        <option key={branch.id} value={branch.id}>
                                                            {branch.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="bg-blue-50 p-3 rounded border border-blue-100 italic text-[10px] text-blue-800">
                                            Note: Security PINs are self-service. The user will be prompted to set their private PIN during their first login.
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                                    <button
                                        type="submit"
                                        className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm"
                                    >
                                        Create
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowModal(false)}
                                        className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
            {/* Approval Modal */}
            {showApprovalModal && selectedUser && (
                <div className="fixed z-20 inset-0 overflow-y-auto">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={() => setShowApprovalModal(false)}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
                        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <h3 className="text-lg font-medium text-gray-900 mb-4">Activate User: {selectedUser.full_name}</h3>
                                <p className="text-sm text-gray-500 mb-4">Set the transaction limit for this {selectedUser.role.replace('_', ' ')}.</p>
                                <div>
                                    <label className="label">Transaction Limit (FCFA)</label>
                                    <input
                                        type="number"
                                        className="input"
                                        value={approvalLimit}
                                        onChange={e => setApprovalLimit(e.target.value)}
                                        placeholder="e.g. 500000"
                                    />
                                </div>
                            </div>
                            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                                <button
                                    onClick={() => handleApproveUser(selectedUser.id, true)}
                                    className="btn btn-primary sm:ml-3"
                                >
                                    Activate Account
                                </button>
                                <button
                                    onClick={() => setShowApprovalModal(false)}
                                    className="btn btn-secondary mt-3 sm:mt-0"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
