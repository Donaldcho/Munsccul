import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Members from './pages/Members'
import MemberDetail from './pages/MemberDetail'
import Accounts from './pages/Accounts'
import AccountDetail from './pages/AccountDetail'
import Transactions from './pages/Transactions'
import Loans from './pages/Loans'
import LoanDetail from './pages/LoanDetail'
import LoanApplication from './pages/LoanApplication'
import Reports from './pages/Reports'
import EODOperations from './pages/EOD'
import AuditLogs from './pages/AuditLogs'
import Settings from './pages/Settings'
import Kiosk from './pages/Kiosk'
import TVDisplay from './pages/TVDisplay'
import InitialSetup from './pages/InitialSetup'
import PINRecovery from './pages/PINRecovery'
import NjangiDashboard from './pages/NjangiDashboard'

// Protected Route component
function ProtectedRoute({ children, ignoreSetupFlag = false }: { children: React.ReactNode, ignoreSetupFlag?: boolean }) {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Intercept first-time login, unless we are on the setup page itself
  if (user?.is_first_login && !ignoreSetupFlag) {
    return <Navigate to="/setup" replace />
  }

  return <>{children}</>
}

// Role Protected Route component
function RoleProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) {
  const { user } = useAuthStore()

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

import MobileLaunchpad from './pages/MobileLaunchpad'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/mobile" element={<MobileLaunchpad />} />
      <Route path="/setup" element={
        <ProtectedRoute ignoreSetupFlag>
          <InitialSetup />
        </ProtectedRoute>
      } />
      <Route path="/reset-pin" element={<PINRecovery />} />
      <Route path="/kiosk" element={<Kiosk />} />
      <Route path="/display" element={<TVDisplay />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="members" element={<RoleProtectedRoute allowedRoles={['TELLER', 'OPS_MANAGER', 'OPS_DIRECTOR', 'BRANCH_MANAGER', 'CREDIT_OFFICER', 'AUDITOR', 'BOARD_MEMBER']}><Members /></RoleProtectedRoute>} />
        <Route path="members/:id" element={<RoleProtectedRoute allowedRoles={['TELLER', 'OPS_MANAGER', 'OPS_DIRECTOR', 'BRANCH_MANAGER', 'CREDIT_OFFICER', 'AUDITOR', 'BOARD_MEMBER']}><MemberDetail /></RoleProtectedRoute>} />
        <Route path="accounts" element={<RoleProtectedRoute allowedRoles={['TELLER', 'OPS_MANAGER', 'OPS_DIRECTOR', 'BRANCH_MANAGER', 'AUDITOR']}><Accounts /></RoleProtectedRoute>} />
        <Route path="accounts/:id" element={<RoleProtectedRoute allowedRoles={['TELLER', 'OPS_MANAGER', 'OPS_DIRECTOR', 'BRANCH_MANAGER', 'AUDITOR']}><AccountDetail /></RoleProtectedRoute>} />
        <Route path="transactions" element={<RoleProtectedRoute allowedRoles={['TELLER', 'OPS_MANAGER', 'BRANCH_MANAGER']}><Transactions /></RoleProtectedRoute>} />
        <Route path="loans" element={<RoleProtectedRoute allowedRoles={['CREDIT_OFFICER', 'OPS_MANAGER', 'OPS_DIRECTOR', 'BRANCH_MANAGER', 'BOARD_MEMBER']}><Loans /></RoleProtectedRoute>} />
        <Route path="loans/:id" element={<RoleProtectedRoute allowedRoles={['CREDIT_OFFICER', 'OPS_MANAGER', 'OPS_DIRECTOR', 'BRANCH_MANAGER', 'BOARD_MEMBER']}><LoanDetail /></RoleProtectedRoute>} />
        <Route path="loans/apply" element={<RoleProtectedRoute allowedRoles={['CREDIT_OFFICER', 'OPS_MANAGER', 'OPS_DIRECTOR', 'BRANCH_MANAGER']}><LoanApplication /></RoleProtectedRoute>} />
        <Route path="reports" element={<RoleProtectedRoute allowedRoles={['OPS_MANAGER', 'OPS_DIRECTOR', 'BRANCH_MANAGER', 'AUDITOR', 'BOARD_MEMBER', 'CREDIT_OFFICER']}><Reports /></RoleProtectedRoute>} />
        <Route path="eod" element={
          <RoleProtectedRoute allowedRoles={['OPS_MANAGER', 'OPS_DIRECTOR', 'SYSTEM_ADMIN']}>
            <EODOperations />
          </RoleProtectedRoute>
        } />
        <Route path="audit-logs" element={
          <RoleProtectedRoute allowedRoles={['AUDITOR', 'SYSTEM_ADMIN', 'BOARD_MEMBER']}>
            <AuditLogs />
          </RoleProtectedRoute>
        } />
        <Route path="njangi" element={<RoleProtectedRoute allowedRoles={['TELLER', 'OPS_MANAGER', 'OPS_DIRECTOR', 'BRANCH_MANAGER', 'CREDIT_OFFICER']}><NjangiDashboard /></RoleProtectedRoute>} />
        <Route path="settings" element={
          <RoleProtectedRoute allowedRoles={['SYSTEM_ADMIN', 'OPS_MANAGER', 'OPS_DIRECTOR']}>
            <Settings />
          </RoleProtectedRoute>
        } />
      </Route>
    </Routes>
  )
}

export default App