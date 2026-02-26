import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import IntercomWidget from './IntercomWidget'
import {
  HomeIcon,
  UsersIcon,
  CreditCardIcon,
  BanknotesIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  CogIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  SunIcon,
  MoonIcon,
  SparklesIcon
} from '@heroicons/react/24/outline'
import { useAuthStore } from '../stores/authStore'

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  {
    name: 'Members',
    href: '/members',
    icon: UsersIcon,
    roles: ['TELLER', 'OPS_MANAGER', 'OPS_DIRECTOR', 'BRANCH_MANAGER', 'CREDIT_OFFICER', 'AUDITOR', 'BOARD_MEMBER']
  },
  {
    name: 'Accounts',
    href: '/accounts',
    icon: CreditCardIcon,
    roles: ['TELLER', 'OPS_MANAGER', 'OPS_DIRECTOR', 'BRANCH_MANAGER', 'AUDITOR']
  },
  {
    name: 'Transactions',
    href: '/transactions',
    icon: BanknotesIcon,
    roles: ['TELLER', 'OPS_MANAGER', 'BRANCH_MANAGER']
  },
  {
    name: 'Loans',
    href: '/loans',
    icon: DocumentTextIcon,
    roles: ['CREDIT_OFFICER', 'OPS_MANAGER', 'OPS_DIRECTOR', 'BRANCH_MANAGER', 'BOARD_MEMBER']
  },
  {
    name: 'Reports',
    href: '/reports',
    icon: ClipboardDocumentListIcon,
    roles: ['OPS_MANAGER', 'OPS_DIRECTOR', 'BRANCH_MANAGER', 'AUDITOR', 'BOARD_MEMBER', 'CREDIT_OFFICER']
  },
  {
    name: 'EOD Operations',
    href: '/eod',
    icon: LockClosedIcon,
    roles: ['OPS_MANAGER', 'OPS_DIRECTOR']
  },
  {
    name: 'Audit Logs',
    href: '/audit-logs',
    icon: ShieldCheckIcon,
    roles: ['AUDITOR', 'SYSTEM_ADMIN', 'OPS_DIRECTOR', 'BOARD_MEMBER']
  },
  {
    name: 'Smart Njangi',
    href: '/njangi',
    icon: SparklesIcon,
    roles: ['TELLER', 'OPS_MANAGER', 'OPS_DIRECTOR', 'BRANCH_MANAGER', 'CREDIT_OFFICER']
  },
  {
    name: 'Settings',
    href: '/settings',
    icon: CogIcon,
    roles: ['SYSTEM_ADMIN', 'OPS_MANAGER', 'OPS_DIRECTOR']
  },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout, hasRole } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  // Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
  })

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
      localStorage.theme = 'dark'
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.theme = 'light'
    }
  }, [isDarkMode])

  // Filter navigation based on user role
  const filteredNavigation = navigation.filter(item => {
    if (!item.roles) return true
    return hasRole(item.roles)
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 transition-colors duration-300">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-40 flex lg:hidden ${sidebarOpen ? 'visible' : 'invisible'}`}>
        <div
          className={`fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setSidebarOpen(false)}
        />
        <div className={`relative flex w-full max-w-xs flex-1 flex-col bg-white dark:bg-slate-900 transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              type="button"
              className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white dark:focus:ring-slate-800"
              onClick={() => setSidebarOpen(false)}
            >
              <XMarkIcon className="h-6 w-6 text-white" />
            </button>
          </div>
          <div className="h-0 flex-1 overflow-y-auto pt-5 pb-4">
            <div className="flex flex-shrink-0 items-center px-4">
              <h1 className="text-xl font-bold text-primary-700 dark:text-indigo-300">MUNSCCUL Banking</h1>
            </div>
            <nav className="mt-5 space-y-1 px-2">
              {filteredNavigation.map((item) => {
                const isActive = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon className="mr-3 h-6 w-6 flex-shrink-0" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>
          </div>
          <div className="flex flex-shrink-0 border-t border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center">
              <UserCircleIcon className="h-10 w-10 text-gray-400 dark:text-slate-500" />
              <div className="ml-3">
                <p className="text-base font-medium text-gray-700 dark:text-slate-200">{user?.full_name}</p>
                <p className="text-sm font-medium text-gray-500 dark:text-slate-400">{user?.role.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Static sidebar for desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-72 lg:flex-col lg:p-4">
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white/80 backdrop-blur-md shadow-glass border border-white/50 overflow-hidden dark:bg-slate-900 dark:border-slate-800 dark:shadow-none">
          <div className="flex flex-1 flex-col overflow-y-auto pt-6 pb-4">
            <div className="flex flex-shrink-0 items-center px-6 pb-4 border-b border-gray-100/50 dark:border-slate-700/50">
              <div className="bg-gradient-to-tr from-primary-600 to-indigo-500 p-2 rounded-lg mr-3 shadow-md">
                <ShieldCheckIcon className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary-800 to-indigo-600 dark:from-indigo-300 dark:to-purple-400 tracking-tight">MUNSCCUL</h1>
            </div>
            <nav className="mt-6 flex-1 space-y-1.5 px-4">
              {filteredNavigation.map((item) => {
                const isActive = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}
                  >
                    <item.icon className="mr-3 h-6 w-6 flex-shrink-0" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>
          </div>
          <div className="flex flex-shrink-0 border-t border-gray-100/50 dark:border-slate-700/50 p-4 bg-white/40 dark:bg-slate-800/40 mt-auto">
            <div className="flex items-center w-full rounded-xl p-2 hover:bg-white/60 dark:hover:bg-slate-800 transition-colors cursor-pointer">
              <UserCircleIcon className="h-10 w-10 text-indigo-400 dark:text-indigo-300" />
              <div className="ml-3 flex-1 overflow-hidden">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{user?.full_name}</p>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 capitalize truncate">{user?.role.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col lg:pl-72">
        {/* Top header */}
        <div className="sticky top-0 z-10 flex h-20 flex-shrink-0 bg-white/70 backdrop-blur-md shadow-sm border-b border-gray-100 dark:bg-slate-900/80 dark:border-slate-800">
          <button
            type="button"
            className="border-r border-gray-200 px-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
          <div className="flex flex-1 justify-between px-4">
            <div className="flex flex-1">
              {/* Breadcrumbs or page title could go here */}
            </div>
            <div className="ml-4 flex items-center gap-4">
              <span className="text-sm text-gray-500 dark:text-slate-400">
                {new Date().toLocaleDateString('en-CM', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </span>
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-2 text-slate-500 hover:text-indigo-600 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-indigo-400"
                title="Toggle Theme"
              >
                {isDarkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
              </button>
              <div className="h-6 w-px bg-gray-200 mx-1 dark:bg-slate-700"></div>
              <button
                onClick={handleLogout}
                className="flex items-center text-sm font-medium text-slate-500 hover:text-rose-600 transition-colors px-3 py-2 rounded-lg hover:bg-rose-50 dark:text-slate-400 dark:hover:bg-rose-900/30 dark:hover:text-rose-400"
              >
                <ArrowRightOnRectangleIcon className="mr-2 h-5 w-5" />
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1">
          <div className="py-6">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* Global Intercom Widget */}
      {user && <IntercomWidget />}
    </div>
  )
}