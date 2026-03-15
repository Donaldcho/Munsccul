import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  PhoneIcon,
  MapPinIcon,
  CameraIcon,
  ExclamationCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import { membersApi, kycApi } from '../services/api'
import { formatDate, formatPhone } from '../utils/formatters'
import toast from 'react-hot-toast'
import { getErrorMessage } from '../utils/errorUtils'

interface Member {
  id: number
  member_id: string
  first_name: string
  last_name: string
  phone_primary: string
  email: string | null
  address: string | null
  is_active: boolean
  created_at: string
}

export default function Members() {
  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [newMember, setNewMember] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    phone_primary: '',
    email: '',
    address: '',
    national_id: '',
    next_of_kin_name: '',
    next_of_kin_phone: '',
    next_of_kin_relationship: '',
    branch_id: 1
  })

  useEffect(() => {
    fetchMembers()
  }, [searchQuery])

  const fetchMembers = async () => {
    try {
      setIsLoading(true)
      setLoadError(null)
      const response = await membersApi.getAll({
        search: searchQuery || undefined,
        limit: 100
      })
      setMembers(response.data)
    } catch (error: any) {
      const msg = getErrorMessage(error, 'Unable to load members. Please try again.')
      setLoadError(msg)
    } finally {
      setIsLoading(false)
    }
  }

  const handleScanID = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setIsScanning(true)
      const formData = new FormData()
      formData.append('file', file)

      const response = await kycApi.uploadDocument(formData)
      const data = response.data

      toast.success('ID Scanned successfully via Edge AI')

      // Update newMember state with extracted data
      setNewMember(prev => ({
        ...prev,
        first_name: data.first_name || prev.first_name,
        last_name: data.last_name || prev.last_name,
        national_id: data.id_number || prev.national_id,
      }))
    } catch (error) {
      toast.error('Failed to scan ID using OCR')
    } finally {
      setIsScanning(false)
      e.target.value = '' // reset input
    }
  }

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await membersApi.create(newMember)
      toast.success('Member created successfully')
      setShowAddModal(false)
      setNewMember({
        first_name: '',
        last_name: '',
        date_of_birth: '',
        phone_primary: '',
        email: '',
        address: '',
        national_id: '',
        next_of_kin_name: '',
        next_of_kin_phone: '',
        next_of_kin_relationship: '',
        branch_id: 1
      })
      fetchMembers()
    } catch (error) {
      toast.error('Failed to create member')
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Members</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Manage credit union members and their KYC information
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary"
          >
            <PlusIcon className="mr-2 h-5 w-5" />
            Add Member
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 dark:text-slate-500" />
          </div>
          <input
            type="text"
            placeholder="Search by name, member ID, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
          />
        </div>
      </div>

      {/* Members Table */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Contact</th>
                <th>Member ID</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                      <p className="text-sm">Loading members...</p>
                    </div>
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <ExclamationCircleIcon className="h-10 w-10 text-amber-400" />
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Could not load members</p>
                      <p className="text-xs text-slate-400">{loadError}</p>
                      <button onClick={fetchMembers} className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 text-sm font-medium hover:bg-primary-100 transition-colors">
                        <ArrowPathIcon className="h-4 w-4" /> Try Again
                      </button>
                    </div>
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500 dark:text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <UserCircleIcon className="h-10 w-10 text-slate-300" />
                      <p className="text-sm">{searchQuery ? 'No members match your search.' : 'No members registered yet.'}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td>
                      <div className="flex items-center">
                        <UserCircleIcon className="h-10 w-10 text-gray-400 dark:text-slate-500" />
                        <div className="ml-4">
                          <div className="font-medium text-gray-900 dark:text-slate-100">
                            {member.first_name} {member.last_name}
                          </div>
                          {member.address && (
                            <div className="flex items-center text-sm text-gray-500 dark:text-slate-400">
                              <MapPinIcon className="mr-1 h-4 w-4" />
                              {member.address}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="text-sm text-gray-900 dark:text-slate-200">
                        <div className="flex items-center">
                          <PhoneIcon className="mr-1 h-4 w-4 text-gray-400 dark:text-slate-500" />
                          {formatPhone(member.phone_primary)}
                        </div>
                        {member.email && (
                          <div className="text-gray-500 dark:text-slate-400">{member.email}</div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="font-mono text-sm text-gray-900 dark:text-slate-200">
                        {member.member_id}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${member.is_active ? 'badge-success' : 'badge-danger'}`}>
                        {member.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-sm text-gray-500 dark:text-slate-400">
                      {formatDate(member.created_at)}
                    </td>
                    <td>
                      <Link
                        to={`/members/${member.id}`}
                        className="text-primary-600 hover:text-primary-900 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-black dark:bg-opacity-70" onClick={() => setShowAddModal(false)} />
            <div className="relative bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Add New Member</h3>
                <div>
                  <input
                    type="file"
                    id="id-scanner-upload"
                    accept="image/jpeg, image/png"
                    className="hidden"
                    onChange={handleScanID}
                  />
                  <label
                    htmlFor="id-scanner-upload"
                    className={`btn-outline inline-flex items-center cursor-pointer ${isScanning ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isScanning ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600 mr-2"></div>
                    ) : (
                      <CameraIcon className="mr-2 h-4 w-4" />
                    )}
                    {isScanning ? 'Scanning...' : 'Scan Smart ID (CNI)'}
                  </label>
                </div>
              </div>
              <form onSubmit={handleCreateMember} className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label dark:text-slate-300">First Name *</label>
                    <input
                      type="text"
                      required
                      value={newMember.first_name}
                      onChange={(e) => setNewMember({ ...newMember, first_name: e.target.value })}
                      className="input dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="label dark:text-slate-300">Last Name *</label>
                    <input
                      type="text"
                      required
                      value={newMember.last_name}
                      onChange={(e) => setNewMember({ ...newMember, last_name: e.target.value })}
                      className="input dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="label dark:text-slate-300">Date of Birth *</label>
                    <input
                      type="date"
                      required
                      value={newMember.date_of_birth}
                      onChange={(e) => setNewMember({ ...newMember, date_of_birth: e.target.value })}
                      className="input dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="label dark:text-slate-300">National ID</label>
                    <input
                      type="text"
                      value={newMember.national_id}
                      onChange={(e) => setNewMember({ ...newMember, national_id: e.target.value })}
                      className="input dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                      placeholder="e.g., 012345678"
                    />
                  </div>
                  <div>
                    <label className="label dark:text-slate-300">Phone Number *</label>
                    <input
                      type="tel"
                      required
                      value={newMember.phone_primary}
                      onChange={(e) => setNewMember({ ...newMember, phone_primary: e.target.value })}
                      className="input dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                      placeholder="e.g., 677123456"
                    />
                  </div>
                  <div>
                    <label className="label dark:text-slate-300">Email</label>
                    <input
                      type="email"
                      value={newMember.email}
                      onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                      className="input dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                      placeholder="optional"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label dark:text-slate-300">Address</label>
                    <textarea
                      value={newMember.address}
                      onChange={(e) => setNewMember({ ...newMember, address: e.target.value })}
                      className="input dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                      rows={2}
                      placeholder="Member's address"
                    />
                  </div>
                  <div className="md:col-span-2 border-t dark:border-slate-700 pt-4 mt-2">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Next of Kin Information</h4>
                  </div>
                  <div>
                    <label className="label dark:text-slate-300">Next of Kin Name *</label>
                    <input
                      type="text"
                      required
                      value={newMember.next_of_kin_name}
                      onChange={(e) => setNewMember({ ...newMember, next_of_kin_name: e.target.value })}
                      className="input dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="label dark:text-slate-300">Next of Kin Phone *</label>
                    <input
                      type="tel"
                      required
                      value={newMember.next_of_kin_phone}
                      onChange={(e) => setNewMember({ ...newMember, next_of_kin_phone: e.target.value })}
                      className="input dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label dark:text-slate-300">Relationship *</label>
                    <input
                      type="text"
                      required
                      value={newMember.next_of_kin_relationship}
                      onChange={(e) => setNewMember({ ...newMember, next_of_kin_relationship: e.target.value })}
                      className="input dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                      placeholder="e.g., Spouse, Parent, Sibling"
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="btn-outline"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                  >
                    Create Member
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