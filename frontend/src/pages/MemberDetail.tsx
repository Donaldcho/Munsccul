import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeftIcon,
  UserCircleIcon,
  PhoneIcon,
  EnvelopeIcon,
  MapPinIcon,
  CreditCardIcon,
  DocumentTextIcon,
  PlusIcon,
  XMarkIcon,
  PencilSquareIcon,
  CameraIcon
} from '@heroicons/react/24/outline'
import { membersApi, accountsApi, api } from '../services/api'
import { formatDate, formatPhone, formatCurrency } from '../utils/formatters'
import toast from 'react-hot-toast'
import { useAuthStore } from '../stores/authStore'

interface MemberDetail {
  id: number
  member_id: string
  first_name: string
  last_name: string
  date_of_birth: string
  gender: string
  phone_primary: string
  phone_secondary: string | null
  email: string | null
  address: string | null
  national_id: string | null
  next_of_kin_name: string
  next_of_kin_phone: string
  next_of_kin_relationship: string
  is_active: boolean
  created_at: string
  passport_photo_path: string | null
  signature_scan_path: string | null
  accounts: any[]
  loans: any[]
}

export default function MemberDetail() {
  const { user } = useAuthStore()
  const { id } = useParams<{ id: string }>()
  const [member, setMember] = useState<MemberDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'accounts' | 'loans'>('accounts')
  const [showOpenAccount, setShowOpenAccount] = useState(false)
  const [accountForm, setAccountForm] = useState({
    account_type: 'SAVINGS',
    interest_rate: '0',
    minimum_balance: '0'
  })
  const [isCreatingAccount, setIsCreatingAccount] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [isUploadingSignature, setIsUploadingSignature] = useState(false)

  // Edit Member State
  const [showEditMember, setShowEditMember] = useState(false)
  const [isUpdatingMember, setIsUpdatingMember] = useState(false)
  const [editForm, setEditForm] = useState({
    phone_primary: '',
    phone_secondary: '',
    email: '',
    address: '',
    next_of_kin_name: '',
    next_of_kin_phone: '',
    next_of_kin_relationship: ''
  })

  const canCreateAccount = user?.role === 'TELLER' || user?.role === 'CREDIT_OFFICER'

  useEffect(() => {
    fetchMemberDetail()
  }, [id])

  const fetchMemberDetail = async () => {
    try {
      setIsLoading(true)
      const response = await membersApi.getById(id!)
      const m = response.data;
      setMember(m)
      setEditForm({
        phone_primary: m.phone_primary || '',
        phone_secondary: m.phone_secondary || '',
        email: m.email || '',
        address: m.address || '',
        next_of_kin_name: m.next_of_kin_name || '',
        next_of_kin_phone: m.next_of_kin_phone || '',
        next_of_kin_relationship: m.next_of_kin_relationship || ''
      })
    } catch (error) {
      toast.error('Failed to fetch member details')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const fetchImages = async () => {
      if (!member) return;
      try {
        if (member.passport_photo_path) {
          const res = await api.get(`/members/${member.id}/photo`, { responseType: 'blob' });
          setPhotoUrl(URL.createObjectURL(res.data));
        }
        if (member.signature_scan_path) {
          const res = await api.get(`/members/${member.id}/signature`, { responseType: 'blob' });
          setSignatureUrl(URL.createObjectURL(res.data));
        }
      } catch (e) {
        console.error("Failed to load images", e);
      }
    };
    fetchImages();
  }, [member?.id, member?.passport_photo_path, member?.signature_scan_path]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !member) return;
    try {
      setIsUploadingPhoto(true);
      const formData = new FormData();
      formData.append('file', e.target.files[0]);
      await membersApi.uploadPhoto(member.id, formData);
      toast.success("Photo uploaded securely");
      fetchMemberDetail();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || "Failed to upload photo");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !member) return;
    try {
      setIsUploadingSignature(true);
      const formData = new FormData();
      formData.append('file', e.target.files[0]);
      await membersApi.uploadSignature(member.id, formData);
      toast.success("Signature uploaded securely");
      fetchMemberDetail();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || "Failed to upload signature");
    } finally {
      setIsUploadingSignature(false);
    }
  };

  const handleOpenAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!member) return

    try {
      setIsCreatingAccount(true)
      await accountsApi.create({
        member_id: member.id,
        account_type: accountForm.account_type,
        interest_rate: parseFloat(accountForm.interest_rate) || 0,
        minimum_balance: parseFloat(accountForm.minimum_balance) || 0
      })
      toast.success(`${accountForm.account_type} account created successfully!`)
      setShowOpenAccount(false)
      setAccountForm({ account_type: 'SAVINGS', interest_rate: '0', minimum_balance: '0' })
      fetchMemberDetail() // Refresh to show new account
    } catch (error: any) {
      const msg = error?.response?.data?.detail
      toast.error(typeof msg === 'string' ? msg : 'Failed to create account')
    } finally {
      setIsCreatingAccount(false)
    }
  }

  const handleEditMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!member) return

    try {
      setIsUpdatingMember(true)
      await membersApi.update(member.id, editForm)
      toast.success('Member information updated successfully')
      setShowEditMember(false)
      fetchMemberDetail()
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to update member')
    } finally {
      setIsUpdatingMember(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!member) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Member not found</p>
        <Link to="/members" className="text-primary-600 hover:text-primary-900 mt-2 inline-block">
          Back to Members
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link to="/members" className="text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 flex items-center mb-4 transition-colors">
          <ArrowLeftIcon className="h-4 w-4 mr-1" />
          Back to Members
        </Link>
        <div className="flex items-center border-b border-gray-100 dark:border-slate-800 pb-6 mb-6">
          <div className="relative group cursor-pointer mr-2 shrink-0" onClick={() => document.getElementById('photo-upload')?.click()}>
            <input type="file" id="photo-upload" className="hidden" accept="image/jpeg, image/png" onChange={handlePhotoUpload} />
            {isUploadingPhoto ? (
              <div className="h-20 w-20 rounded-full border-2 border-gray-100 dark:border-slate-700 flex items-center justify-center bg-gray-50 dark:bg-slate-800 text-gray-400 shrink-0">
                <div className="animate-spin h-5 w-5 border-b-2 border-primary-600 rounded-full"></div>
              </div>
            ) : photoUrl ? (
              <img src={photoUrl} className="h-20 w-20 rounded-full object-cover border-2 border-gray-200 dark:border-slate-700" alt="Member Photo" />
            ) : (
              <UserCircleIcon className="h-20 w-20 text-gray-300 dark:text-slate-600 bg-gray-50 dark:bg-slate-800 rounded-full p-1" />
            )}
            <div className="absolute -bottom-1 -right-1 bg-primary-600 rounded-full p-1.5 shadow-sm border-2 border-white text-white opacity-90 group-hover:opacity-100 transition-opacity">
              <CameraIcon className="w-4 h-4" />
            </div>
            <div className="absolute inset-0 bg-black bg-opacity-40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-xs font-bold uppercase tracking-wider">Change</span>
            </div>
          </div>

          <div className="ml-4 flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {member.first_name} {member.last_name}
            </h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Member ID: {member.member_id} • Joined {formatDate(member.created_at)}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setShowEditMember(true)}
              className="btn-secondary"
            >
              <PencilSquareIcon className="h-4 w-4 mr-1" />
              Edit Profile
            </button>
            {canCreateAccount && (
              <button
                onClick={() => setShowOpenAccount(true)}
                className="btn-primary"
              >
                <PlusIcon className="h-5 w-5 mr-1" />
                Open Account
              </button>
            )}
            <span className={`badge ${member.is_active ? 'badge-success' : 'badge-danger'}`}>
              {member.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* Open Account Modal */}
      {showOpenAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md mx-4 border dark:border-slate-800">
            <div className="flex items-center justify-between p-6 border-b dark:border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Open New Account</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  For {member.first_name} {member.last_name} ({member.member_id})
                </p>
              </div>
              <button onClick={() => setShowOpenAccount(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={handleOpenAccount} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Account Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={accountForm.account_type}
                  onChange={(e) => setAccountForm({ ...accountForm, account_type: e.target.value })}
                  className="input w-full dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  required
                >
                  <option value="SAVINGS">Savings Account</option>
                  <option value="CURRENT">Current Account</option>
                  <option value="FIXED_DEPOSIT">Fixed Deposit</option>
                </select>
                <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                  {accountForm.account_type === 'SAVINGS' && 'Standard savings with interest earnings.'}
                  {accountForm.account_type === 'CURRENT' && 'Transactional account for frequent withdrawals.'}
                  {accountForm.account_type === 'FIXED_DEPOSIT' && 'Locked deposit with higher interest rate.'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Interest Rate (% per annum)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={accountForm.interest_rate}
                  onChange={(e) => setAccountForm({ ...accountForm, interest_rate: e.target.value })}
                  className="input w-full dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Minimum Balance (XAF)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={accountForm.minimum_balance}
                  onChange={(e) => setAccountForm({ ...accountForm, minimum_balance: e.target.value })}
                  className="input w-full dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  placeholder="0"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOpenAccount(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingAccount}
                  className="btn-primary flex-1"
                >
                  {isCreatingAccount ? (
                    <span className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Creating...
                    </span>
                  ) : (
                    'Open Account'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {showEditMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl mx-4 my-8 border dark:border-slate-800">
            <div className="flex items-center justify-between p-6 border-b dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 rounded-t-xl z-10">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Edit Member Profile</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">Update contact and emergency details.</p>
              </div>
              <button onClick={() => setShowEditMember(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleEditMember} className="p-6">
              <h3 className="text-md font-semibold text-gray-900 dark:text-white border-b dark:border-slate-800 pb-2 mb-4">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Primary Phone</label>
                  <input
                    type="text"
                    value={editForm.phone_primary}
                    onChange={(e) => setEditForm({ ...editForm, phone_primary: e.target.value })}
                    className="input w-full dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Secondary Phone</label>
                  <input
                    type="text"
                    value={editForm.phone_secondary}
                    onChange={(e) => setEditForm({ ...editForm, phone_secondary: e.target.value })}
                    className="input w-full dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="input w-full dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Physical Address</label>
                  <textarea
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    className="input w-full dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    rows={2}
                  />
                </div>
              </div>

              <h3 className="text-md font-semibold text-gray-900 dark:text-white border-b dark:border-slate-800 pb-2 mb-4">Next of Kin (Emergency)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Name</label>
                  <input
                    type="text"
                    value={editForm.next_of_kin_name}
                    onChange={(e) => setEditForm({ ...editForm, next_of_kin_name: e.target.value })}
                    className="input w-full dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Phone</label>
                  <input
                    type="text"
                    value={editForm.next_of_kin_phone}
                    onChange={(e) => setEditForm({ ...editForm, next_of_kin_phone: e.target.value })}
                    className="input w-full dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Relationship</label>
                  <input
                    type="text"
                    value={editForm.next_of_kin_relationship}
                    onChange={(e) => setEditForm({ ...editForm, next_of_kin_relationship: e.target.value })}
                    className="input w-full dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-900">
                <button type="button" onClick={() => setShowEditMember(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={isUpdatingMember} className="btn-primary flex-1">
                  {isUpdatingMember ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Member Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Personal Information */}
        <div className="card">
          <div className="card-header dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Personal Information</h3>
          </div>
          <div className="card-body space-y-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Date of Birth</p>
              <p className="font-medium text-gray-900 dark:text-slate-200">{formatDate(member.date_of_birth)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Gender</p>
              <p className="font-medium capitalize text-gray-900 dark:text-slate-200">{member.gender || 'Not specified'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-slate-400">National ID</p>
              <p className="font-medium text-gray-900 dark:text-slate-200">{member.national_id || 'Not provided'}</p>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="card">
          <div className="card-header dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Contact Information</h3>
          </div>
          <div className="card-body space-y-4">
            <div className="flex items-center">
              <PhoneIcon className="h-5 w-5 text-gray-400 dark:text-slate-500 mr-2" />
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400">Phone</p>
                <p className="font-medium text-gray-900 dark:text-slate-200">{formatPhone(member.phone_primary)}</p>
              </div>
            </div>
            {member.phone_secondary && (
              <div className="flex items-center">
                <PhoneIcon className="h-5 w-5 text-gray-400 dark:text-slate-500 mr-2" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Alternate Phone</p>
                  <p className="font-medium text-gray-900 dark:text-slate-200">{formatPhone(member.phone_secondary)}</p>
                </div>
              </div>
            )}
            {member.email && (
              <div className="flex items-center">
                <EnvelopeIcon className="h-5 w-5 text-gray-400 dark:text-slate-500 mr-2" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Email</p>
                  <p className="font-medium text-gray-900 dark:text-slate-200">{member.email}</p>
                </div>
              </div>
            )}
            {member.address && (
              <div className="flex items-center">
                <MapPinIcon className="h-5 w-5 text-gray-400 dark:text-slate-500 mr-2" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Address</p>
                  <p className="font-medium text-gray-900 dark:text-slate-200">{member.address}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Next of Kin */}
        <div className="card">
          <div className="card-header dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Next of Kin</h3>
          </div>
          <div className="card-body space-y-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Name</p>
              <p className="font-medium text-gray-900 dark:text-slate-200">{member.next_of_kin_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Phone</p>
              <p className="font-medium text-gray-900 dark:text-slate-200">{formatPhone(member.next_of_kin_phone)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-slate-400">Relationship</p>
              <p className="font-medium text-gray-900 dark:text-slate-200">{member.next_of_kin_relationship}</p>
            </div>
          </div>
        </div>

        {/* KYC Verification */}
        <div className="card">
          <div className="card-header dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">KYC Verification</h3>
          </div>
          <div className="card-body">
            <div className="flex flex-col space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-100 dark:border-slate-700">
                <div className="flex items-center">
                  <DocumentTextIcon className="h-5 w-5 text-gray-400 dark:text-slate-500 mr-2" />
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Digital Signature</span>
                </div>
                <button
                  onClick={() => document.getElementById('signature-upload')?.click()}
                  disabled={isUploadingSignature}
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 text-sm font-medium transition-colors"
                >
                  {isUploadingSignature ? 'Uploading...' : (member.signature_scan_path ? 'Update' : 'Upload Scan')}
                </button>
                <input type="file" id="signature-upload" className="hidden" accept="image/jpeg, image/png" onChange={handleSignatureUpload} />
              </div>

              {signatureUrl && (
                <div className="mt-2 p-2 border border-gray-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-100 flex justify-center">
                  <img src={signatureUrl} alt="Signature scan" className="max-h-24 object-contain mix-blend-multiply" />
                </div>
              )}

              {!signatureUrl && member.signature_scan_path && (
                <div className="animate-pulse h-16 bg-gray-100 dark:bg-slate-800 rounded-lg"></div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs - Hidden for SYSTEM_ADMIN */}
      {user?.role !== 'SYSTEM_ADMIN' && (
        <div className="card">
          <div className="border-b border-gray-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
            <nav className="flex -mb-px px-4">
              <button
                onClick={() => setActiveTab('accounts')}
                className={`py-4 px-6 border-b-2 font-medium text-sm flex items-center transition-colors ${activeTab === 'accounts'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:border-gray-300 dark:hover:border-slate-600'
                  }`}
              >
                <CreditCardIcon className="h-5 w-5 mr-2" />
                Accounts ({member.accounts?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('loans')}
                className={`py-4 px-6 border-b-2 font-medium text-sm flex items-center transition-colors ${activeTab === 'loans'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:border-gray-300 dark:hover:border-slate-600'
                  }`}
              >
                <DocumentTextIcon className="h-5 w-5 mr-2" />
                Loans ({member.loans?.length || 0})
              </button>
            </nav>
          </div>

          <div className="card-body">
            {activeTab === 'accounts' && (
              <div>
                {canCreateAccount && (
                  <div className="flex justify-end mb-4">
                    <button
                      onClick={() => setShowOpenAccount(true)}
                      className="btn-primary text-sm"
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                      Open Account
                    </button>
                  </div>
                )}
                {member.accounts?.length === 0 ? (
                  <div className="text-center py-8">
                    <CreditCardIcon className="h-12 w-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-slate-500 mb-2">No accounts found</p>
                    {canCreateAccount && (
                      <button
                        onClick={() => setShowOpenAccount(true)}
                        className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 text-sm font-medium transition-colors"
                      >
                        Open their first account →
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Account Number</th>
                          <th>Type</th>
                          <th>Balance</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {member.accounts?.map((account) => (
                          <tr key={account.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="font-mono text-gray-900 dark:text-slate-200">{account.account_number}</td>
                            <td className="capitalize text-gray-900 dark:text-slate-200">{account.account_type}</td>
                            <td className="font-medium text-gray-900 dark:text-slate-200">{formatCurrency(account.balance)}</td>
                            <td>
                              <span className={`badge ${account.is_active ? 'badge-success' : 'badge-danger'}`}>
                                {account.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'loans' && (
              <div>
                {member.loans?.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No loans found</p>
                ) : (
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Loan Number</th>
                          <th>Principal</th>
                          <th>Outstanding</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {member.loans?.map((loan) => (
                          <tr key={loan.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="font-mono text-gray-900 dark:text-slate-200">{loan.loan_number}</td>
                            <td className="text-gray-900 dark:text-slate-200">{formatCurrency(loan.principal_amount)}</td>
                            <td className="text-gray-900 dark:text-slate-200">{formatCurrency(loan.amount_outstanding)}</td>
                            <td>
                              <span className={`badge badge-${loan.status === 'active' ? 'success' :
                                loan.status === 'delinquent' ? 'danger' :
                                  loan.status === 'pending' ? 'warning' : 'info'
                                }`}>
                                {loan.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )
      }
    </div >
  )
}