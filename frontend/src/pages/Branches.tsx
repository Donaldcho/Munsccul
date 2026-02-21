import { useState, useEffect } from 'react'
import {
    PlusIcon,
    BuildingOfficeIcon,
    KeyIcon,
    BanknotesIcon
} from '@heroicons/react/24/outline'
import { branchesApi } from '../services/api'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/authStore'

interface Branch {
    id: number
    code: string
    name: string
    address: string
    city: string
    region: string
    phone: string
    email: string
    is_active: boolean
    server_api_key: string
    gl_vault_code: string
}

export default function Branches() {
    const { user } = useAuthStore()
    const [branches, setBranches] = useState<Branch[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null)

    const [formData, setFormData] = useState({
        code: '',
        name: '',
        address: '',
        city: '',
        region: '',
        phone: '',
        email: '',
        server_api_key: '',
        gl_vault_code: ''
    })

    const isSuperAdmin = user?.role === 'SYSTEM_ADMIN'
    const isOpsManager = user?.role === 'OPS_MANAGER' || user?.role === 'SYSTEM_ADMIN'

    useEffect(() => {
        fetchBranches()
    }, [])

    const fetchBranches = async () => {
        try {
            setLoading(true)
            const response = await branchesApi.getAll()
            setBranches(response.data)
        } catch (error) {
            console.error('Error fetching branches:', error)
            toast.error('Failed to load branches')
        } finally {
            setLoading(false)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            if (isEditing && selectedBranch) {
                await branchesApi.update(selectedBranch.id, formData)
                toast.success('Branch updated successfully')
            } else {
                await branchesApi.create(formData)
                toast.success('Branch created successfully')
            }
            setShowModal(false)
            resetForm()
            fetchBranches()
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to save branch')
        }
    }

    const resetForm = () => {
        setFormData({
            code: '',
            name: '',
            address: '',
            city: '',
            region: '',
            phone: '',
            email: '',
            server_api_key: '',
            gl_vault_code: ''
        })
        setIsEditing(false)
        setSelectedBranch(null)
    }

    const handleEdit = (branch: Branch) => {
        setSelectedBranch(branch)
        setFormData({
            code: branch.code,
            name: branch.name,
            address: branch.address || '',
            city: branch.city,
            region: branch.region,
            phone: branch.phone || '',
            email: branch.email || '',
            server_api_key: branch.server_api_key || '',
            gl_vault_code: branch.gl_vault_code || ''
        })
        setIsEditing(true)
        setShowModal(true)
    }

    return (
        <div className="card">
            <div className="card-header flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-medium text-gray-900">Branch Management</h3>
                    <p className="text-sm text-gray-500">Manage banking branches and configurations</p>
                </div>
                {isSuperAdmin && (
                    <button
                        onClick={() => {
                            resetForm()
                            setShowModal(true)
                        }}
                        className="btn btn-primary flex items-center"
                    >
                        <PlusIcon className="h-5 w-5 mr-2" />
                        New Branch
                    </button>
                )}
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vault GL</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan={6} className="px-6 py-4 text-center">Loading...</td></tr>
                        ) : branches.length === 0 ? (
                            <tr><td colSpan={6} className="px-6 py-4 text-center">No branches found</td></tr>
                        ) : (
                            branches.map((branch) => (
                                <tr key={branch.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{branch.code}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{branch.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{branch.city}, {branch.region}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {branch.gl_vault_code ? (
                                            <span className="font-mono bg-gray-100 px-2 py-1 rounded">{branch.gl_vault_code}</span>
                                        ) : (
                                            <span className="text-red-400 italic">Unconfigured</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${branch.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {branch.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <button
                                            onClick={() => handleEdit(branch)}
                                            className="text-primary-600 hover:text-primary-900 mr-4"
                                        >
                                            Configure
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div className="fixed z-10 inset-0 overflow-y-auto">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowModal(false)}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
                        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-xl sm:w-full">
                            <form onSubmit={handleSubmit}>
                                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center">
                                        <BuildingOfficeIcon className="h-6 w-6 mr-2 text-primary-600" />
                                        {isEditing ? 'Configure Branch' : 'Register New Branch'}
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="label">Branch Code</label>
                                            <input
                                                type="text"
                                                required
                                                disabled={!isSuperAdmin}
                                                className="input disabled:bg-gray-50"
                                                value={formData.code}
                                                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                                placeholder="e.g. DLA-001"
                                            />
                                        </div>
                                        <div>
                                            <label className="label">Branch Name</label>
                                            <input
                                                type="text"
                                                required
                                                disabled={!isSuperAdmin}
                                                className="input disabled:bg-gray-50"
                                                value={formData.name}
                                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                                placeholder="e.g. Douala-Bonaberi"
                                            />
                                        </div>
                                        <div>
                                            <label className="label">City</label>
                                            <input
                                                type="text"
                                                required
                                                disabled={!isSuperAdmin}
                                                className="input disabled:bg-gray-50"
                                                value={formData.city}
                                                onChange={e => setFormData({ ...formData, city: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="label">Region</label>
                                            <input
                                                type="text"
                                                required
                                                disabled={!isSuperAdmin}
                                                className="input disabled:bg-gray-50"
                                                value={formData.region}
                                                onChange={e => setFormData({ ...formData, region: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-6 border-t pt-4">
                                        <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center">
                                            <KeyIcon className="h-4 w-4 mr-2" />
                                            Administrative Configuration (Level 1: IT Admin)
                                        </h4>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="label">Server API Key (Hybrid Sync)</label>
                                                <input
                                                    type="password"
                                                    disabled={!isSuperAdmin}
                                                    className="input disabled:bg-gray-50 font-mono"
                                                    value={formData.server_api_key}
                                                    onChange={e => setFormData({ ...formData, server_api_key: e.target.value })}
                                                    placeholder="Branch Local Server Secret"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6 border-t pt-4">
                                        <h4 className="text-sm font-semibold text-gray-700 mb-4 flex items-center">
                                            <BanknotesIcon className="h-4 w-4 mr-2" />
                                            Financial Setup (Level 2: Ops Manager)
                                        </h4>
                                        <div>
                                            <label className="label">Vault Cash GL Account Code</label>
                                            <input
                                                type="text"
                                                disabled={!isOpsManager}
                                                className="input disabled:bg-gray-50 font-mono"
                                                value={formData.gl_vault_code}
                                                onChange={e => setFormData({ ...formData, gl_vault_code: e.target.value })}
                                                placeholder="e.g. 521001"
                                            />
                                            <p className="mt-1 text-xs text-gray-500">OHADA compliant Chart of Accounts code for branch vault.</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                                    <button
                                        type="submit"
                                        className="btn btn-primary sm:ml-3"
                                    >
                                        {isEditing ? 'Save Configuration' : 'Provision Branch'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowModal(false)}
                                        className="btn btn-secondary mt-3 sm:mt-0"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
