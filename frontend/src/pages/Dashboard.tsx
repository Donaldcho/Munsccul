import { useEffect, useState } from 'react'
import { reportsApi, loansApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import AdminDashboard from '../components/dashboard/AdminDashboard'
import ManagerDashboard from '../components/dashboard/ManagerDashboard'
import DirectorDashboard from '../components/dashboard/DirectorDashboard'
import BoardDashboard from '../components/dashboard/BoardDashboard'
import TellerDashboard from '../components/dashboard/TellerDashboard'
import CreditDashboard from '../components/dashboard/CreditDashboard'

interface DashboardStats {
  members: { total: number }
  accounts: { total: number; total_deposits: number }
  loans: { total_outstanding: number; disbursed_today: number; collections_today: number }
  pending_approvals: number
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loanStats, setLoanStats] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  const REPORTING_ROLES = ['BRANCH_MANAGER', 'AUDITOR']
  const LOAN_STATS_ROLES = ['CREDIT_OFFICER']

  useEffect(() => {
    const fetchData = async () => {
      try {
        const role = user?.role || ''

        if (REPORTING_ROLES.includes(role)) {
          // Only managers/auditors can call this endpoint
          const res = await reportsApi.getDashboard().catch(() => ({ data: null }))
          setStats(res?.data ?? null)
        } else if (LOAN_STATS_ROLES.includes(role)) {
          const res = await loansApi.getStats().catch(() => ({ data: null }))
          setLoanStats(res?.data ?? null)
        }
        // All other roles (TELLER, OPS_MANAGER, OPS_DIRECTOR, BOARD_MEMBER, SYSTEM_ADMIN)
        // do NOT call getDashboard — their sub-dashboards fetch their own data.
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (user) {
      fetchData()
    } else {
      setIsLoading(false)
    }
  }, [user])


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // Render dashboard based on role
  switch (user?.role) {
    case 'TELLER':
      return <TellerDashboard />

    case 'CREDIT_OFFICER':
      return <CreditDashboard loanStats={loanStats} />

    case 'OPS_MANAGER':
      return <ManagerDashboard />

    case 'OPS_DIRECTOR':
      return <DirectorDashboard />

    case 'BOARD_MEMBER':
      return <BoardDashboard />

    case 'SYSTEM_ADMIN':
    case 'BRANCH_MANAGER':
    case 'AUDITOR':
    default:
      return <AdminDashboard stats={stats} />
  }
}