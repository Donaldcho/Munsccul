import { useState, useEffect, useRef } from 'react'
import {
  InboxIcon,
  UserGroupIcon,
  BanknotesIcon,
  ShieldExclamationIcon,
  ArrowTrendingUpIcon,
  LockClosedIcon,
  CheckCircleIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { usersApi, loansApi, reportsApi, opsApi, treasuryApi } from '../../services/api'
import { njangiApi } from '../../services/njangiApi'
import { useAuthStore } from '../../stores/authStore'
import { formatCurrency } from '../../utils/formatters'
import { getErrorMessage } from '../../utils/errorUtils'
import toast from 'react-hot-toast'
import SystemInitWizard from './SystemInitWizard'

interface OverrideRequest {
  id: number
  teller_id: number
  teller_name: string
  amount: number
  account_number: string
  member_id_display?: string
  reason: string
  status: string
  created_at: string
}

export default function OpsManagerDashboard() {
  const { user } = useAuthStore()
  const branchId = user?.branch_id || 1

  const [overrideRequests, setOverrideRequests] = useState<OverrideRequest[]>([])
  const [pendingLoans, setPendingLoans] = useState<any[]>([])
  const [pendingStaff, setPendingStaff] = useState<any[]>([])
  const [pendingNjangi, setPendingNjangi] = useState<any[]>([])
  const [liquidity, setLiquidity] = useState<any>(null)
  const [amlFlags, setAmlFlags] = useState<any[]>([])
  const [liquidityRatio, setLiquidityRatio] = useState<{ ratio: number; status: string }>({ ratio: 100, status: 'COMPLIANT' })
  const [eodLocked, setEodLocked] = useState(false)
  const [pendingTransfers, setPendingTransfers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [transferModal, setTransferModal] = useState<any>(null)
  const [transferPin, setTransferPin] = useState('')
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false)
  const [adjustmentAmount, setAdjustmentAmount] = useState('')
  const [adjustmentDesc, setAdjustmentDesc] = useState('Opening Vault Balance Adjustment')
  const [showSyncWizard, setShowSyncWizard] = useState(false)

  const [overrideModal, setOverrideModal] = useState<OverrideRequest | null>(null)
  const [overrideAction, setOverrideAction] = useState<'APPROVE' | 'REJECT'>('APPROVE')
  const [overridePin, setOverridePin] = useState('')
  const [vaultDropModal, setVaultDropModal] = useState(false)
  const [vaultDropTeller, setVaultDropTeller] = useState<any>(null)
  const [vaultDropAmount, setVaultDropAmount] = useState('')
  const [vaultDropPin, setVaultDropPin] = useState('')
  const [njangiApprovalModal, setNjangiApprovalModal] = useState<any>(null)
  const [glAccount, setGlAccount] = useState('2020')

  const wsRef = useRef<WebSocket | null>(null)

  const fetchInbox = async () => {
    try {
      const [overrides, loans, staff, njangiRes, transfers] = await Promise.all([
        opsApi.getOverrideRequests({ branch_id: branchId }).then(r => r.data),
        loansApi.getAll({ status: 'PENDING_REVIEW' }).then(r => r.data),
        usersApi.getAll().then(r => r.data.filter((u: any) => u.approval_status === 'PENDING')),
        njangiApi.getGroups().then(r => r.data.filter((g: any) => g.status === 'PENDING_KYC')),
        treasuryApi.getPendingTransfers().then(r => r.data),
      ])
      setOverrideRequests(overrides)
      setPendingLoans(Array.isArray(loans) ? loans : loans?.applications || [])
      setPendingStaff(staff)
      setPendingNjangi(njangiRes || [])
      setPendingTransfers(transfers || [])
    } catch (e) {
      console.error('Fetch inbox', e)
    }
  }

  const fetchLiquidity = async () => {
    try {
      const [liq, aml, lock, ratio] = await Promise.all([
        opsApi.getLiquidity(branchId).then(r => r.data),
        opsApi.getAmlFlags({ branch_id: branchId }).then(r => r.data?.items || []),
        opsApi.getEodLockStatus({ branch_id: branchId }).then(r => r.data),
        reportsApi.getCobacLiquidity('daily').then(r => r.data).catch(() => ({ ratio: 100, status: 'COMPLIANT' })),
      ])
      setLiquidity(liq)
      setAmlFlags(aml)
      setEodLocked(lock?.eod_locked || false)
      setLiquidityRatio(ratio)
    } catch (e) {
      console.error('Fetch liquidity', e)
    }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchInbox(), fetchLiquidity()])
      setLoading(false)
    }
    load()
  }, [branchId])

  useEffect(() => {
    const url = opsApi.getOpsInboxWebSocketUrl(branchId)
    const ws = new WebSocket(url)
    ws.onopen = () => { }
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'TELLER_OVERRIDE_REQUEST') {
          fetchInbox()
        }
        if (data.type === 'TELLER_OVERRIDE_APPROVED' || data.type === 'TELLER_OVERRIDE_REJECTED' || data.type === 'TREASURY_UPDATE') {
          fetchInbox()
          if (data.type === 'TREASURY_UPDATE') fetchLiquidity()
        }
      } catch (_) { }
    }
    ws.onclose = () => {
      setTimeout(() => { wsRef.current = null }, 3000)
    }
    wsRef.current = ws
    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [branchId])

  const handleOverrideSubmit = async () => {
    if (!overrideModal || !overridePin) {
      toast.error('Enter your PIN')
      return
    }
    try {
      if (overrideAction === 'APPROVE') {
        await opsApi.approveOverride(overrideModal.id, { manager_pin: overridePin })
        toast.success('Override approved. Teller unblocked.')
      } else {
        await opsApi.rejectOverride(overrideModal.id, { manager_pin: overridePin, comments: 'Rejected by Ops Manager' })
        toast.success('Override rejected.')
      }
      setOverrideModal(null)
      setOverridePin('')
      fetchInbox()
    } catch (e: any) {
      toast.error(getErrorMessage(e, `Failed to ${overrideAction.toLowerCase()}`))
    }
  }

  const handleApproveNjangi = async () => {
    if (!njangiApprovalModal || !glAccount) {
      toast.error('Escrow GL Account is required')
      return
    }
    try {
      await njangiApi.approveKyc(njangiApprovalModal.id, {
        escrow_gl_account_id: glAccount
      })
      toast.success('Njangi Group Approved and Activated!')
      setNjangiApprovalModal(null)
      fetchInbox()
    } catch (e: any) {
      toast.error('Failed to approve Njangi Group')
    }
  }

  const handleVaultDrop = async () => {
    if (!vaultDropTeller || !vaultDropAmount || !vaultDropPin) {
      toast.error('Select teller, amount, and enter PIN')
      return
    }
    const amount = parseFloat(vaultDropAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Invalid amount')
      return
    }
    try {
      await opsApi.vaultDropByManager({
        teller_id: vaultDropTeller.teller_id,
        amount,
        manager_pin: vaultDropPin,
      })
      toast.success('Vault drop completed')
      setVaultDropModal(false)
      setVaultDropTeller(null)
      setVaultDropAmount('')
      setVaultDropPin('')
      fetchLiquidity()
    } catch (e: any) {
      toast.error(getErrorMessage(e, 'Vault drop failed'))
    }
  }

  const handleApproveTransfer = async (approved: boolean) => {
    if (approved && !transferPin) {
      toast.error('Enter your PIN')
      return
    }
    try {
      await treasuryApi.approveTransfer(transferModal.id, {
        approved,
        manager_pin: transferPin
      })
      toast.success(approved ? 'Transfer Approved & Ledger Posted' : 'Transfer Rejected')
      setTransferModal(null)
      setTransferPin('')
      fetchInbox()
      fetchLiquidity()
    } catch (e: any) {
      toast.error(getErrorMessage(e, 'Action failed'))
    }
  }

  const handleVaultAdjustment = async () => {
    if (!adjustmentAmount) {
      toast.error('Enter amount')
      return
    }
    try {
      await treasuryApi.vaultAdjustment({
        amount: parseFloat(adjustmentAmount),
        description: adjustmentDesc
      })
      toast.success('Vault Adjustment Successful')
      setShowAdjustmentModal(false)
      setAdjustmentAmount('')
      fetchLiquidity()
    } catch (e: any) {
      toast.error(getErrorMessage(e, 'Adjustment failed'))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Command Center</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Liquidity • Approvals • EOD
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === 'OPS_MANAGER' && (
            <button
              onClick={() => setShowSyncWizard(true)}
              className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-xs font-bold rounded-lg hover:from-indigo-700 hover:to-blue-700 transition shadow-sm flex items-center gap-1.5"
            >
              <SparklesIcon className="h-4 w-4" /> System Sync Wizard
            </button>
          )}
          {eodLocked && (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 flex items-center">
              <LockClosedIcon className="h-4 w-4 mr-1" /> EOD In Progress
            </span>
          )}
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300">
            Ops Manager
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Zone 1: Live Action Inbox */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card border-l-4 border-primary-500">
            <div className="card-header bg-gray-50 dark:bg-slate-900/50 flex items-center gap-2">
              <InboxIcon className="h-5 w-5 text-primary-500" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Live Action Inbox</h2>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {/* Critical: Teller Overrides */}
              {overrideRequests.length > 0 && (
                <div className="p-4">
                  <h3 className="text-xs font-black text-red-600 dark:text-red-400 uppercase tracking-widest mb-2 flex items-center">
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse mr-2" />
                    Teller Overrides
                  </h3>
                  {overrideRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 mb-2"
                    >
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">{req.teller_name}: Withdrawal Override</p>
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          {formatCurrency(req.amount)} for Member #{req.member_id_display || req.account_number}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setOverrideAction('APPROVE'); setOverrideModal(req) }}
                          className="btn-sm bg-green-600 text-white font-bold rounded-lg px-3 py-1.5"
                        >
                          Approve remotely
                        </button>
                        <button
                          onClick={() => { setOverrideAction('REJECT'); setOverrideModal(req) }}
                          className="btn-sm border border-red-300 text-red-600 rounded-lg px-3 py-1.5"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Treasury: Pending Cash Transfers */}
              {pendingTransfers.length > 0 && (
                <div className="p-4 bg-primary-50/30 dark:bg-primary-900/5">
                  <h3 className="text-[10px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-widest mb-3 flex items-center">
                    <BanknotesIcon className="h-4 w-4 mr-1.5" />
                    Pending Cash Transfers
                  </h3>
                  <div className="space-y-3">
                    {pendingTransfers.map((tx: any) => (
                      <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-800 border border-primary-100 dark:border-primary-900/30 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${tx.transfer_type === 'TELLER_TO_VAULT' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                            {tx.transfer_type === 'TELLER_TO_VAULT' ? <ArrowTrendingUpIcon className="h-4 w-4" /> : <InboxIcon className="h-4 w-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900 dark:text-white">
                              {tx.transfer_type.replace(/_/g, ' ')}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {formatCurrency(tx.amount)} • By {tx.creator_name || 'Staff'}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setTransferModal(tx)}
                            className="px-3 py-1.5 bg-primary-600 text-white text-xs font-bold rounded-lg hover:bg-primary-700"
                          >
                            Verify & Accept
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Priority: Pending Loans */}
              {pendingLoans.length > 0 && (
                <div className="p-4">
                  <h3 className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-2">
                    Pending Loans
                  </h3>
                  <ul className="space-y-1">
                    {pendingLoans.slice(0, 5).map((loan: any) => (
                      <li key={loan.id} className="flex justify-between items-center text-sm">
                        <span className="font-medium">{loan.loan_number || loan.id} — {formatCurrency(loan.principal_amount || loan.amount)}</span>
                        <a href="/" className="text-primary-600 hover:underline text-xs font-bold">Review</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Specialized: Njangi KYC */}
              {pendingNjangi.length > 0 && (
                <div className="p-4">
                  <h3 className="text-xs font-black text-purple-600 dark:text-purple-400 uppercase tracking-widest mb-2 flex items-center">
                    <UserGroupIcon className="h-4 w-4 mr-1" />
                    Njangi Genesis (KYC)
                  </h3>
                  <ul className="space-y-2">
                    {pendingNjangi.map((group: any) => (
                      <li key={group.id} className="flex justify-between items-center text-sm bg-purple-50 dark:bg-purple-900/10 p-2 rounded-lg border border-purple-100 dark:border-purple-800">
                        <div>
                          <span className="font-bold block text-gray-900 dark:text-gray-100">{group.name}</span>
                          <span className="text-xs text-gray-500">Target: {formatCurrency(group.pot_target_amount)}</span>
                        </div>
                        <button onClick={() => setNjangiApprovalModal(group)} className="btn-sm bg-purple-600 text-white font-bold rounded-lg px-3 py-1.5">Review</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Routine: Pending Staff */}
              {pendingStaff.length > 0 && (
                <div className="p-4">
                  <h3 className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-2">
                    Pending Staff
                  </h3>
                  <ul className="space-y-1">
                    {pendingStaff.slice(0, 5).map((u: any) => (
                      <li key={u.id} className="flex justify-between items-center text-sm">
                        <span className="font-medium">{u.full_name} (@{u.username})</span>
                        <a href="/settings" className="text-primary-600 hover:underline text-xs font-bold">Assign & Activate</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {overrideRequests.length === 0 && pendingLoans.length === 0 && pendingStaff.length === 0 && pendingNjangi.length === 0 && pendingTransfers.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                  <CheckCircleIcon className="h-12 w-12 mx-auto mb-2 text-green-500 opacity-50" />
                  <p className="font-bold uppercase tracking-widest text-sm">Inbox Zero</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Zone 2: Real-Time Liquidity Matrix */}
        <div className="space-y-4">
          <div className="card border-l-4 border-green-500">
            <div className="card-header bg-gray-50 dark:bg-slate-900/50 flex items-center gap-2">
              <BanknotesIcon className="h-5 w-5 text-green-500" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Liquidity Matrix</h2>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Main Vault</p>
                <p className="text-xl font-black text-gray-900 dark:text-white">
                  {formatCurrency(liquidity?.main_vault ?? 0)}
                </p>
              </div>
              {(liquidity?.teller_drawers || []).map((drawer: any) => (
                <div
                  key={drawer.teller_id}
                  className={`p-2 rounded-lg ${drawer.approaching_limit ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-300' : 'bg-gray-50 dark:bg-slate-800/50'}`}
                >
                  <p className="text-xs font-bold text-gray-600 dark:text-slate-400">{drawer.counter}</p>
                  <p className="font-black text-gray-900 dark:text-white">{formatCurrency(drawer.balance)}</p>
                  {drawer.approaching_limit && (
                    <p className="text-[10px] text-amber-600 font-bold">⚠ Approaching vault drop limit</p>
                  )}
                </div>
              ))}
              <div className="pt-2 border-t border-gray-200 dark:border-slate-700">
                <p className="text-[10px] font-bold text-gray-500 uppercase">Digital Float</p>
                <p className="text-sm text-gray-600 dark:text-slate-400">MTN MoMo: {formatCurrency(liquidity?.momo?.MTN_MOMO ?? 0)}</p>
                <p className="text-sm text-gray-600 dark:text-slate-400">Orange Money: {formatCurrency(liquidity?.momo?.ORANGE_MONEY ?? 0)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setVaultDropModal(true); fetchLiquidity(); }}
                  className="py-2 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700"
                >
                  Vault Drop
                </button>
                <button
                  onClick={() => setShowAdjustmentModal(true)}
                  className="py-2 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700"
                >
                  Genesis Injection
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Zone 3: Branch Health & Risk Radar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header flex items-center gap-2">
            <ShieldExclamationIcon className="h-5 w-5 text-amber-500" />
            <h3 className="font-bold text-gray-900 dark:text-white">Suspicious Activity (AML)</h3>
          </div>
          <div className="p-4">
            {amlFlags.length === 0 ? (
              <p className="text-sm text-gray-500">No flags</p>
            ) : (
              <ul className="space-y-2">
                {amlFlags.slice(0, 5).map((item: any) => (
                  <li key={item.id} className="text-sm flex justify-between">
                    <span>{item.transaction_ref} — {formatCurrency(item.amount)}</span>
                    <span className="text-xs text-gray-500">{item.type}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="card flex flex-col items-center justify-center p-6">
          <h3 className="font-bold text-gray-900 dark:text-white mb-2">COBAC Liquidity Ratio</h3>
          <div className={`text-4xl font-black ${liquidityRatio.ratio >= 100 ? 'text-green-600' : 'text-red-600'}`}>
            {liquidityRatio.ratio.toFixed(1)}%
          </div>
          <span className={`mt-2 px-3 py-1 rounded-full text-xs font-bold ${liquidityRatio.status === 'COMPLIANT' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {liquidityRatio.status}
          </span>
        </div>
      </div>

      {/* Override Action Modal */}
      {overrideModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 uppercase">
              {overrideAction === 'APPROVE' ? 'Approve' : 'Reject'} Override
            </h3>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
              {overrideModal.teller_name}: {formatCurrency(overrideModal.amount)} — Member #{overrideModal.member_id_display || overrideModal.account_number}
            </p>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Your PIN</label>
            <input
              type="password"
              value={overridePin}
              onChange={(e) => setOverridePin(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white mb-4"
              placeholder="••••"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setOverrideModal(null); setOverridePin(''); }}
                className="flex-1 py-2 border border-gray-300 rounded-xl font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleOverrideSubmit}
                className={`flex-1 py-2 text-white rounded-xl font-bold ${overrideAction === 'APPROVE' ? 'bg-green-600' : 'bg-red-600'}`}
              >
                {overrideAction === 'APPROVE' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Njangi Approval Modal */}
      {njangiApprovalModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Approve Njangi Group</h3>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
              Group: {njangiApprovalModal.name} <br />
              President ID: {njangiApprovalModal.president_id}
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <span className="text-xs font-bold text-gray-500 uppercase">Bylaws Document</span>
                <a href={njangiApprovalModal.bylaws_url} target="_blank" className="block text-primary-600 text-sm hover:underline">View Document</a>
              </div>
              <div>
                <span className="text-xs font-bold text-gray-500 uppercase">Meeting Minutes</span>
                <a href={njangiApprovalModal.meeting_minutes_url} target="_blank" className="block text-primary-600 text-sm hover:underline">View Document</a>
              </div>
            </div>

            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Escrow GL Account ID</label>
            <input
              type="text"
              value={glAccount}
              onChange={(e) => setGlAccount(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white mb-4"
              placeholder="e.g. 2020"
            />
            <div className="flex gap-2">
              <button onClick={() => { setNjangiApprovalModal(null); }} className="flex-1 py-2 border border-gray-300 rounded-xl font-bold">Cancel</button>
              <button onClick={handleApproveNjangi} className="flex-1 py-2 bg-green-600 text-white rounded-xl font-bold">Approve</button>
            </div>
          </div>
        </div>
      )}

      {/* Vault Drop Modal */}
      {vaultDropModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Vault Drop</h3>
            <p className="text-xs text-gray-500 mb-2">Select teller and amount to move to main vault.</p>
            <select
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 mb-3"
              value={vaultDropTeller?.teller_id ?? ''}
              onChange={(e) => {
                const id = parseInt(e.target.value, 10)
                const t = liquidity?.teller_drawers?.find((d: any) => d.teller_id === id)
                setVaultDropTeller(t ? { teller_id: id, ...t } : null)
              }}
            >
              <option value="">Select Teller</option>
              {(liquidity?.teller_drawers || []).map((d: any) => (
                <option key={d.teller_id} value={d.teller_id}>{d.counter} — {formatCurrency(d.balance)}</option>
              ))}
            </select>
            <input
              type="number"
              value={vaultDropAmount}
              onChange={(e) => setVaultDropAmount(e.target.value)}
              placeholder="Amount (XAF)"
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 mb-3"
            />
            <input
              type="password"
              value={vaultDropPin}
              onChange={(e) => setVaultDropPin(e.target.value)}
              placeholder="Manager PIN"
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setVaultDropModal(false)} className="flex-1 py-2 border rounded-xl font-bold">Cancel</button>
              <button onClick={handleVaultDrop} className="flex-1 py-2 bg-primary-600 text-white rounded-xl font-bold">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Treasury Transfer Verification Modal */}
      {transferModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Verify Cash Transfer</h3>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-slate-800 mb-4 border border-gray-100 dark:border-slate-700">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Details</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {transferModal.transfer_type.replace(/_/g, ' ')}
              </p>
              <p className="text-2xl font-black text-primary-600 mt-1">
                {formatCurrency(transferModal.amount)}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                From: {transferModal.creator_name || 'Staff member'}<br />
                Ref: {transferModal.transfer_ref}
              </p>
            </div>

            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Authorization PIN</label>
            <input
              type="password"
              value={transferPin}
              onChange={(e) => setTransferPin(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white mb-6"
              placeholder="••••"
            />

            <div className="flex gap-2">
              <button
                onClick={() => handleApproveTransfer(false)}
                className="flex-1 py-2 text-red-600 font-bold border border-red-200 rounded-xl hover:bg-red-50"
              >
                Reject
              </button>
              <button
                onClick={() => handleApproveTransfer(true)}
                className="flex-1 py-2 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700"
              >
                Accept
              </button>
              <button onClick={() => { setTransferModal(null); setTransferPin(''); }} className="py-2 px-4 text-gray-500 font-medium text-xs">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* System Initialization Wizard Modal */}
      {showSyncWizard && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto p-4 pt-8">
          <div className="w-full max-w-3xl relative">
            <button
              onClick={() => setShowSyncWizard(false)}
              className="absolute -top-3 -right-3 z-10 bg-white dark:bg-gray-800 rounded-full p-2 shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50"
            >
              <XMarkIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <SystemInitWizard onComplete={() => { setShowSyncWizard(false); fetchLiquidity() }} />
          </div>
        </div>
      )}

      {/* Genesis Injection / Vault Adjustment Modal */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Genesis Vault Injection</h3>
            <p className="text-xs text-gray-500 mb-4">Set the initial physical cash balance against Retained Earnings (Capital).</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Amount (FCFA)</label>
                <input
                  type="number"
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-xl"
                  placeholder="50,000,000"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                <textarea
                  value={adjustmentDesc}
                  onChange={(e) => setAdjustmentDesc(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                  rows={2}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowAdjustmentModal(false)} className="flex-1 py-2 border border-gray-300 rounded-xl font-bold">Cancel</button>
                <button onClick={handleVaultAdjustment} className="flex-1 py-2 bg-purple-600 text-white rounded-xl font-bold">Inject Capital</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
