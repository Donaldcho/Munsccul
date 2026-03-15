import { useState } from 'react'
import {
  CogIcon,
  ShieldCheckIcon,
  BuildingLibraryIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline'
import { useAuthStore } from '../stores/authStore'
import Users from './Users'
import Branches from './Branches'
import { authApi } from '../services/api'
import toast from 'react-hot-toast'

export default function Settings() {
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'general' | 'security' | 'users' | 'branches'>('general')
  const [pinData, setPinData] = useState({ currentPassword: '', newPin: '', confirmPin: '' })
  const [isUpdatingPin, setIsUpdatingPin] = useState(false)

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pinData.newPin !== pinData.confirmPin) {
      toast.error('New PIN matches do not match')
      return
    }
    if (pinData.newPin.length !== 4) {
      toast.error('PIN must be exactly 4 digits')
      return
    }

    setIsUpdatingPin(true)
    try {
      await authApi.updatePin({
        current_password: pinData.currentPassword,
        new_pin: pinData.newPin
      })
      toast.success('Transaction PIN updated successfully')
      setPinData({ currentPassword: '', newPin: '', confirmPin: '' })
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update PIN')
    } finally {
      setIsUpdatingPin(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          System configuration and administration
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('general')}
              className={`w-full flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'general'
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
            >
              <BuildingLibraryIcon className="mr-3 h-5 w-5" />
              General
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`w-full flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'security'
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
            >
              <ShieldCheckIcon className="mr-3 h-5 w-5" />
              Security
            </button>
            {(user?.role === 'SYSTEM_ADMIN' || user?.role === 'OPS_MANAGER') && (
              <button
                onClick={() => setActiveTab('users')}
                className={`w-full flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'users'
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                  : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}
              >
                <UserGroupIcon className="mr-3 h-5 w-5" />
                Users
              </button>
            )}
            {(user?.role === 'SYSTEM_ADMIN' || user?.role === 'OPS_MANAGER') && (
              <button
                onClick={() => setActiveTab('branches')}
                className={`w-full flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'branches'
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                  : 'text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}
              >
                <CogIcon className="mr-3 h-5 w-5" />
                Branches
              </button>
            )}
          </nav>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {activeTab === 'general' && (
            <div className="card">
              <div className="card-header border-b dark:border-slate-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">General Settings</h3>
              </div>
              <div className="card-body space-y-6">
                <div>
                  <label className="label">Institution Name</label>
                  <input
                    type="text"
                    defaultValue="Munimun Seamen's Cooperative Credit Union Limited"
                    className="input"
                    readOnly
                  />
                </div>
                <div>
                  <label className="label">COBAC Institution Code</label>
                  <input
                    type="text"
                    defaultValue="MUNSCCUL001"
                    className="input"
                    readOnly
                  />
                </div>
                <div>
                  <label className="label">Data Center</label>
                  <input
                    type="text"
                    defaultValue="Camtel Zamengoué (Yaoundé)"
                    className="input"
                    readOnly
                  />
                  <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                    Data is hosted in Cameroon in compliance with Law No. 2024/017
                  </p>
                </div>
                <div>
                  <label className="label">Currency</label>
                  <input
                    type="text"
                    defaultValue="XAF (Central African CFA franc)"
                    className="input"
                    readOnly
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div className="card">
              <div className="card-header border-b dark:border-slate-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Personal Security</h3>
                <p className="text-sm text-gray-500">Manage your private transaction credentials</p>
              </div>
              <div className="card-body">
                <form onSubmit={handleUpdatePin} className="space-y-4 max-w-md">
                  <div>
                    <label className="label">Current Password</label>
                    <input
                      type="password"
                      required
                      className="input"
                      value={pinData.currentPassword}
                      onChange={e => setPinData({ ...pinData, currentPassword: e.target.value })}
                      placeholder="Verify your identity"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">New 4-Digit PIN</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        required
                        maxLength={4}
                        className="input text-center text-xl tracking-widest"
                        value={pinData.newPin}
                        onChange={e => setPinData({ ...pinData, newPin: e.target.value.replace(/\D/g, '') })}
                        placeholder="****"
                      />
                    </div>
                    <div>
                      <label className="label">Confirm New PIN</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        required
                        maxLength={4}
                        className="input text-center text-xl tracking-widest"
                        value={pinData.confirmPin}
                        onChange={e => setPinData({ ...pinData, confirmPin: e.target.value.replace(/\D/g, '') })}
                        placeholder="****"
                      />
                    </div>
                  </div>
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isUpdatingPin}
                      className="btn btn-primary w-full"
                    >
                      {isUpdatingPin ? 'Updating...' : 'Update Transaction PIN'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className="card">
              <div className="card-header border-b dark:border-slate-700">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">System Security Policy</h3>
              </div>
              <div className="card-body space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-slate-200">Four-Eyes Principle</h4>
                    <p className="text-sm text-gray-500 dark:text-slate-400">
                      Transactions over 500,000 FCFA require manager approval
                    </p>
                  </div>
                  <span className="badge badge-success">Enabled</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-slate-200">Session Timeout</h4>
                    <p className="text-sm text-gray-500 dark:text-slate-400">
                      Automatic logout after 8 hours
                    </p>
                  </div>
                  <span className="badge badge-success">Enabled</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-slate-200">Audit Logging</h4>
                    <p className="text-sm text-gray-500 dark:text-slate-400">
                      All actions are logged for COBAC compliance
                    </p>
                  </div>
                  <span className="badge badge-success">Enabled</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-slate-200">Password Policy</h4>
                    <p className="text-sm text-gray-500 dark:text-slate-400">
                      Minimum 8 characters with mixed case and numbers
                    </p>
                  </div>
                  <span className="badge badge-success">Enabled</span>
                </div>
              </div>
            </div>
          </div>

          {activeTab === 'users' && (user?.role === 'SYSTEM_ADMIN' || user?.role === 'OPS_MANAGER') && (
            <Users />
          )}

          {activeTab === 'branches' && (user?.role === 'SYSTEM_ADMIN' || user?.role === 'OPS_MANAGER') && (
            <Branches />
          )}
        </div>
      </div>
    </div>
  )
}