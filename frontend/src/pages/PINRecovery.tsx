import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { KeyIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { authApi } from '../services/api'
import toast from 'react-hot-toast'

export default function PINRecovery() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const [token, setToken] = useState('')
    const [newPIN, setNewPIN] = useState('')
    const [confirmPIN, setConfirmPIN] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        const t = searchParams.get('token')
        if (t) setToken(t)
    }, [searchParams])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!token) {
            toast.error('Reset token is missing. Please use the link provided by your administrator.')
            return
        }

        if (newPIN !== confirmPIN) {
            toast.error('PINs do not match')
            return
        }

        if (newPIN.length !== 4) {
            toast.error('PIN must be exactly 4 digits')
            return
        }

        setIsSubmitting(true)
        try {
            await authApi.resetPinConfirm({
                token: token,
                new_pin: newPIN
            })
            toast.success('Security PIN has been reset successfully. You can now use your new PIN.')
            navigate('/')
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to reset PIN. The token may be invalid or expired.')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="flex min-h-screen flex-col justify-center bg-gray-50 py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center">
                    <KeyIcon className="h-16 w-16 text-primary-600" />
                </div>
                <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
                    Reset Transaction PIN
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Enter your secure 4-digit PIN
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white px-4 py-8 shadow sm:rounded-lg sm:px-10 border-t-4 border-primary-600">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        {!token && (
                            <div>
                                <label className="label">Reset Token</label>
                                <input
                                    type="text"
                                    required
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    className="input"
                                    placeholder="Paste your reset token here"
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 text-center">
                            <div>
                                <label className="label">New PIN</label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    required
                                    maxLength={4}
                                    value={newPIN}
                                    onChange={(e) => setNewPIN(e.target.value.replace(/\D/g, ''))}
                                    className="input text-center text-2xl tracking-widest font-mono"
                                    placeholder="****"
                                />
                            </div>
                            <div>
                                <label className="label">Confirm PIN</label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    required
                                    maxLength={4}
                                    value={confirmPIN}
                                    onChange={(e) => setConfirmPIN(e.target.value.replace(/\D/g, ''))}
                                    className="input text-center text-2xl tracking-widest font-mono"
                                    placeholder="****"
                                />
                            </div>
                        </div>

                        <div className="bg-blue-50 p-3 rounded text-xs text-blue-700 space-y-2">
                            <div className="flex gap-2">
                                <ShieldCheckIcon className="h-4 w-4" />
                                <span className="font-semibold">Security Tip:</span>
                            </div>
                            <p>Choose a PIN that is not easily guessable. Do not use your birth year or simple sequences like 1234.</p>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="btn btn-primary w-full flex justify-center py-3"
                            >
                                {isSubmitting ? 'Resetting...' : 'Set New Transaction PIN'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
