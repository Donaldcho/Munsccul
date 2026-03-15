import { useState } from 'react'
import {
    BanknotesIcon,
    UserGroupIcon,
    DocumentMagnifyingGlassIcon,
    StarIcon,
    CheckCircleIcon
} from '@heroicons/react/24/outline'
import { queueApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import toast from 'react-hot-toast'

export default function Kiosk() {
    const [issuedTicket, setIssuedTicket] = useState<any>(null)
    const [loading, setLoading] = useState(false)
    const [isVip, setIsVip] = useState(false)
    const { user } = useAuthStore()

    // For the kiosk demo, we'll use branch_id 1 if not logged in
    // Usually the kiosk would be logged into a specific "Kiosk" user account
    const branchId = user?.branch_id || 1

    const handleIssueTicket = async (serviceType: 'CASH' | 'SERVICE' | 'LOAN') => {
        setLoading(true)
        try {
            const response = await queueApi.issue({
                service_type: serviceType,
                is_vip: isVip,
                branch_id: branchId
            })
            setIssuedTicket(response.data)
            setIsVip(false) // Reset VIP for next person

            // Auto-clear after 10 seconds to reset kiosk
            setTimeout(() => setIssuedTicket(null), 10000)
        } catch (error) {
            console.error('Kiosk Error:', error)
            toast.error('Could not issue ticket. Please call staff.')
        } finally {
            setLoading(false)
        }
    }

    if (issuedTicket) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center animate-bounce-short">
                    <CheckCircleIcon className="h-20 w-20 text-green-500 mx-auto mb-6" />
                    <h1 className="text-4xl font-black text-gray-900 mb-2">PLEASE TAKE TICKET</h1>
                    <p className="text-gray-500 mb-8 uppercase tracking-widest">Your Turn is Reserved</p>

                    <div className="bg-gray-100 rounded-2xl p-6 mb-8 border-2 border-dashed border-gray-300">
                        <span className="text-7xl font-mono font-bold text-gray-900 tracking-tighter">
                            {issuedTicket.ticket_number}
                        </span>
                        <div className="mt-4 text-sm font-medium text-gray-500 uppercase">
                            {issuedTicket.service_type} SERVICE
                            {issuedTicket.is_vip && <span className="text-amber-600 block">Priority Handling (VIP)</span>}
                        </div>
                    </div>

                    <p className="text-sm text-gray-400">
                        Please watch the main display screen.<br />
                        Have your ID card and Passbook ready.
                    </p>

                    <button
                        onClick={() => setIssuedTicket(null)}
                        className="mt-10 text-primary-600 font-bold hover:underline"
                    >
                        Finished, Next Person
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-primary-900 flex flex-col items-center justify-center p-6 text-white overflow-hidden">
            {/* Background Accents */}
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-white rounded-full blur-3xl"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-white rounded-full blur-3xl"></div>
            </div>

            <div className="z-10 text-center mb-12">
                <img src="/logo.png" alt="MUNSCCUL" className="h-20 mx-auto mb-6 drop-shadow-lg" />
                <h1 className="text-5xl font-black mb-2 tracking-tight">Welcome to MUNIMUN</h1>
                <p className="text-xl text-primary-200">Please select your service to get a ticket</p>
            </div>

            <div className="z-10 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl w-full">
                <button
                    disabled={loading}
                    onClick={() => handleIssueTicket('CASH')}
                    className="group relative bg-white/10 backdrop-blur-md border border-white/20 rounded-[2.5rem] p-10 hover:bg-white hover:text-primary-900 transition-all duration-300 shadow-xl"
                >
                    <div className="bg-green-500 text-white p-4 rounded-2xl w-fit mb-6 group-hover:scale-110 transition-transform">
                        <BanknotesIcon className="h-10 w-10" />
                    </div>
                    <h2 className="text-3xl font-bold mb-2">Cash & Tellers</h2>
                    <p className="text-primary-200 group-hover:text-primary-700">Deposits, Withdrawals, & Transfers</p>
                </button>

                <button
                    disabled={loading}
                    onClick={() => handleIssueTicket('SERVICE')}
                    className="group relative bg-white/10 backdrop-blur-md border border-white/20 rounded-[2.5rem] p-10 hover:bg-white hover:text-primary-900 transition-all duration-300 shadow-xl"
                >
                    <div className="bg-blue-500 text-white p-4 rounded-2xl w-fit mb-6 group-hover:scale-110 transition-transform">
                        <UserGroupIcon className="h-10 w-10" />
                    </div>
                    <h2 className="text-3xl font-bold mb-2">Customer Service</h2>
                    <p className="text-primary-200 group-hover:text-primary-700">Open Account, Inquiries, & Support</p>
                </button>

                <button
                    disabled={loading}
                    onClick={() => handleIssueTicket('LOAN')}
                    className="group relative bg-white/10 backdrop-blur-md border border-white/20 rounded-[2.5rem] p-10 hover:bg-white hover:text-primary-900 transition-all duration-300 shadow-xl"
                >
                    <div className="bg-purple-500 text-white p-4 rounded-2xl w-fit mb-6 group-hover:scale-110 transition-transform">
                        <DocumentMagnifyingGlassIcon className="h-10 w-10" />
                    </div>
                    <h2 className="text-3xl font-bold mb-2">Loan Office</h2>
                    <p className="text-primary-200 group-hover:text-primary-700">Credit Officer & Loan Applications</p>
                </button>
            </div>

            {/* VIP Mode Toggle (Hidden/Discreet) */}
            <div className="mt-12 z-10">
                <button
                    onClick={() => setIsVip(!isVip)}
                    className={`flex items-center px-6 py-3 rounded-full border-2 transition-all ${isVip ? 'bg-amber-500 border-amber-400 text-white scale-110' : 'bg-transparent border-white/20 text-white/50 hover:border-white/40'}`}
                >
                    <StarIcon className={`h-6 w-6 mr-2 ${isVip ? 'animate-pulse' : ''}`} />
                    <span className="font-bold text-lg uppercase tracking-widest">
                        {isVip ? 'VIP MODE ACTIVE' : 'VIP / Elder Priority'}
                    </span>
                </button>
            </div>

            <p className="mt-12 text-primary-300/50 text-sm font-medium z-10">
                Branch Customer Flow Solution &copy; Munimun Seamen's Cooperative 2026
            </p>
        </div>
    )
}
