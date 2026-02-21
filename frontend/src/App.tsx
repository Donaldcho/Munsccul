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

// Protected Route component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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
        <Route path="members" element={<Members />} />
        <Route path="members/:id" element={<MemberDetail />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="accounts/:id" element={<AccountDetail />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="loans" element={<Loans />} />
        <Route path="loans/:id" element={<LoanDetail />} />
        <Route path="loans/apply" element={<LoanApplication />} />
        <Route path="reports" element={<Reports />} />
        <Route path="eod" element={<EODOperations />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default App