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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const promises = []

        // Fetch data based on role or fetch all for admin
        // Fetch data based on role
        if (['SYSTEM_ADMIN', 'BRANCH_MANAGER', 'AUDITOR'].includes(user?.role || '')) {
          promises.push(reportsApi.getDashboard())
          // loansApi.getStats() is not used by AdminDashboard anymore
          // promises.push(loansApi.getStats()) 
        } else if (user?.role === 'CREDIT_OFFICER') {
          promises.push(loansApi.getStats())
        } else if (['OPS_MANAGER', 'OPS_DIRECTOR', 'BOARD_MEMBER'].includes(user?.role || '')) {
          // Manager/Director/Board fetches its own data
        } else {
          // Tellers might not need heavy stats, or maybe just their own
          // For now, let's fetch basic stats to avoid errors if components expect them
          promises.push(reportsApi.getDashboard())
        }

        const results = await Promise.all(promises)

        if (user?.role === 'CREDIT_OFFICER') {
          setLoanStats(results[0].data)
        } else {
          setStats(results[0]?.data)
          setLoanStats(results[1]?.data)
        }

      } catch (error) {
        console.error('Failed to fetch dashboard data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (user) {
      fetchData()
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