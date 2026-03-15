import { useState } from 'react'
import {
    ChartBarIcon,
    ScaleIcon,
    DocumentChartBarIcon,
    ShieldCheckIcon,
    ArrowRightOnRectangleIcon,
    UserCircleIcon,
    Cog6ToothIcon,
} from '@heroicons/react/24/outline'
import { useAuthStore } from '../../../stores/authStore'
import { useNavigate } from 'react-router-dom'

interface BoardPortalLayoutProps {
    children: React.ReactNode
    activeTab: string
    setActiveTab: (tab: 'overview' | 'committee' | 'reports' | 'audit' | 'policy') => void
}

export default function BoardPortalLayout({ children, activeTab, setActiveTab }: BoardPortalLayoutProps) {
    const { user, logout } = useAuthStore()
    const navigate = useNavigate()

    const tabs = [
        { id: 'overview', name: 'Executive Overview', icon: ChartBarIcon },
        { id: 'committee', name: 'Credit Committee', icon: ScaleIcon, badge: 3 }, // Mock badge as per spec
        { id: 'reports', name: 'Financial Reports', icon: DocumentChartBarIcon },
        { id: 'audit', name: 'Audit Logs', icon: ShieldCheckIcon },
        { id: 'policy', name: 'Policy Management', icon: Cog6ToothIcon },
    ]

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    return (
        <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
            {/* Sidebar */}
            <div className="w-72 flex flex-col border-r border-slate-800 bg-slate-900/50 backdrop-blur-xl">
                <div className="p-8">
                    <div className="flex items-center space-x-3 mb-10">
                        <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <ShieldCheckIcon className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-white line-height-1">Munimun Seamen's</h1>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-400 font-semibold">Governance Portal</p>
                        </div>
                    </div>

                    <nav className="space-y-4">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-300 group ${activeTab === tab.id
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                                    }`}
                            >
                                <div className="flex items-center">
                                    <tab.icon className={`h-5 w-5 mr-3 transition-colors ${activeTab === tab.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
                                    <span className="text-sm font-medium">{tab.name}</span>
                                </div>
                                {tab.badge && (
                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${activeTab === tab.id ? 'bg-white text-indigo-600' : 'bg-rose-500 text-white'
                                        }`}>
                                        {tab.badge}
                                    </span>
                                )}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="mt-auto p-8 border-t border-slate-800 bg-slate-900/40">
                    <div className="flex items-center mb-6">
                        <UserCircleIcon className="h-10 w-10 text-slate-500" />
                        <div className="ml-3 overflow-hidden">
                            <p className="text-sm font-semibold text-white truncate">{user?.full_name}</p>
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Board Member</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center px-4 py-3 rounded-xl text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-all duration-300 group"
                    >
                        <ArrowRightOnRectangleIcon className="h-5 w-5 mr-3 group-hover:translate-x-1 transition-transform" />
                        <span className="text-sm font-medium">Secure Logout</span>
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-20 border-b border-slate-800 flex items-center justify-between px-10 bg-slate-950/50 backdrop-blur-md sticky top-0 z-10">
                    <div>
                        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-widest">
                            {tabs.find(t => t.id === activeTab)?.name}
                        </h2>
                    </div>
                    <div className="flex items-center space-x-8">
                        <div className="text-right">
                            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Next Board Meeting</p>
                            <p className="text-sm font-semibold text-indigo-400">March 15, 2026</p>
                        </div>
                        <div className="h-8 w-px bg-slate-800"></div>
                        <p className="text-sm font-medium text-slate-300">
                            {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                </header>

                {/* Scrollable Content */}
                <main className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                    <div className="max-w-7xl mx-auto h-full">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    )
}
