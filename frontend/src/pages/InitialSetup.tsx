import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { authApi } from '../services/api'
import { BuildingLibraryIcon, LockClosedIcon, ShieldCheckIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function InitialSetup() {
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [pin, setPin] = useState('')
    const [confirmPin, setConfirmPin] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const navigate = useNavigate()
    const { user, logout } = useAuthStore()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (newPassword !== confirmPassword) {
            toast.error('Passwords do not match')
            return
        }

        if (pin !== confirmPin) {
            toast.error('PINs do not match')
            return
        }

        if (pin.length !== 4 || !/^\d+$/.test(pin)) {
            toast.error('PIN must be exactly 4 digits')
            return
        }

        setIsLoading(true)
        try {
            await authApi.setupOnboarding({
                new_password: newPassword,
                new_pin: pin
            })
            toast.success('Security setup complete! Please login with your new credentials.')
            logout() // Force re-login with new password
            navigate('/login')
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Setup failed. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen flex-col justify-center bg-gray-50 py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center">
                    <BuildingLibraryIcon className="h-16 w-16 text-primary-600" />
                </div>
                <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
                    Welcome to MUNSCCUL
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600 uppercase tracking-widest font-semibold">
                    Finalize Your Security Setup
                </p>
                <p className="mt-4 text-center text-xs text-gray-500 bg-blue-50 p-3 rounded border border-blue-100 italic">
                    Admin-assigned temporary passwords must be changed immediately.
                    You must also create a secret 4-digit PIN for transaction authorization.
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white px-4 py-8 shadow sm:rounded-lg sm:px-10 border-t-4 border-primary-600">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        <div className="space-y-4">
                            <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2 border-b pb-2">
                                <LockClosedIcon className="h-5 w-5 text-gray-400" />
                                Change Password
                            </h3>

                            <div>
                                <label htmlFor="new-password" title="At least 8 characters, mix of letters and numbers" className="label cursor-help">
                                    New Password
                                </label>
                                <div className="mt-1 relative">
                                    <input
                                        id="new-password"
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        minLength={8}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="input pr-10"
                                        placeholder="Min 8 characters"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                                    >
                                        {showPassword ? (
                                            <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                                        ) : (
                                            <EyeIcon className="h-5 w-5 text-gray-400" />
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="confirm-password" className="label">
                                    Confirm New Password
                                </label>
                                <div className="mt-1">
                                    <input
                                        id="confirm-password"
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="input"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 pt-4">
                            <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2 border-b pb-2">
                                <ShieldCheckIcon className="h-5 w-5 text-gray-400" />
                                Set Security PIN
                            </h3>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="pin" title="Required for cash transactions" className="label cursor-help">
                                        4-Digit PIN
                                    </label>
                                    <input
                                        id="pin"
                                        type="password"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        required
                                        pattern="\d{4}"
                                        maxLength={4}
                                        value={pin}
                                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                                        className="input text-center text-2xl tracking-[1em]"
                                        placeholder="****"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="confirm-pin" className="label">
                                        Confirm PIN
                                    </label>
                                    <input
                                        id="confirm-pin"
                                        type="password"
                                        inputMode="numeric"
                                        required
                                        pattern="\d{4}"
                                        maxLength={4}
                                        value={confirmPin}
                                        onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                                        className="input text-center text-2xl tracking-[1em]"
                                        placeholder="****"
                                    />
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-400 text-center">
                                Never share your PIN with anyone, including managers or admins.
                            </p>
                        </div>

                        <div className="pt-4">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="btn-primary w-full py-3 text-lg font-bold shadow-lg shadow-primary-100 disabled:opacity-50"
                            >
                                {isLoading ? 'Processing...' : 'Complete Security Setup'}
                            </button>

                            <button
                                type="button"
                                onClick={() => logout()}
                                className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700"
                            >
                                Cancel & Sign Out
                            </button>
                        </div>
                    </form>
                </div>

                <p className="mt-8 text-center text-xs text-gray-400">
                    COBAC Regulation EMF R-2017/06 Enforcement:
                    <br />
                    Mandatory non-repudiation configuration for all active staff.
                </p>
            </div>
        </div>
    )
}
