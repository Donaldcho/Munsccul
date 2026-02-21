import { useEffect, useState } from 'react'
import { ShieldCheckIcon } from '@heroicons/react/24/outline'
import { reportsApi } from '../services/api'
import { formatDateTime } from '../utils/formatters'
import toast from 'react-hot-toast'

interface AuditLog {
  id: number
  username: string
  ip_address: string
  action: string
  entity_type: string
  entity_id: string | null
  description: string | null
  created_at: string
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState({
    action: '',
    entity_type: '',
    start_date: '',
    end_date: ''
  })

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    try {
      setIsLoading(true)
      const params: any = { limit: 100 }
      if (filters.action) params.action = filters.action
      if (filters.entity_type) params.entity_type = filters.entity_type
      if (filters.start_date) params.start_date = filters.start_date
      if (filters.end_date) params.end_date = filters.end_date

      const response = await reportsApi.getAuditLogs(params)
      setLogs(response.data)
    } catch (error) {
      toast.error('Failed to fetch audit logs')
    } finally {
      setIsLoading(false)
    }
  }

  const getActionColor = (action: string) => {
    if (action.includes('FAILED')) return 'text-red-600 bg-red-100 dark:bg-red-900/40 dark:text-red-300'
    if (action.includes('CREATE')) return 'text-green-600 bg-green-100 dark:bg-green-900/40 dark:text-green-300'
    if (action.includes('UPDATE')) return 'text-blue-600 bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300'
    if (action.includes('DELETE')) return 'text-red-600 bg-red-100 dark:bg-red-900/40 dark:text-red-300'
    if (action.includes('LOGIN')) return 'text-purple-600 bg-purple-100 dark:bg-purple-900/40 dark:text-purple-300'
    if (action.includes('TRANSACTION')) return 'text-orange-600 bg-orange-100 dark:bg-orange-900/40 dark:text-orange-300'
    return 'text-gray-600 bg-gray-100 dark:bg-slate-800 dark:text-slate-300'
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
          <ShieldCheckIcon className="h-8 w-8 mr-2 text-primary-600 dark:text-primary-400" />
          Audit Logs
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Immutable audit trail for COBAC compliance
        </p>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="label">Action</label>
              <select
                value={filters.action}
                onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                className="input"
              >
                <option value="">All Actions</option>
                <option value="CREATE">Create</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
                <option value="LOGIN">Login</option>
                <option value="TRANSACTION">Transaction</option>
              </select>
            </div>
            <div>
              <label className="label">Entity Type</label>
              <select
                value={filters.entity_type}
                onChange={(e) => setFilters({ ...filters, entity_type: e.target.value })}
                className="input"
              >
                <option value="">All Types</option>
                <option value="Member">Member</option>
                <option value="Account">Account</option>
                <option value="Transaction">Transaction</option>
                <option value="Loan">Loan</option>
                <option value="User">User</option>
              </select>
            </div>
            <div>
              <label className="label">Start Date</label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                className="input"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchLogs}
                className="btn-primary w-full"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Description</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8">
                    <div className="flex justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="text-sm text-gray-500 dark:text-slate-400">{formatDateTime(log.created_at)}</td>
                    <td className="font-medium text-gray-900 dark:text-slate-200">{log.username}</td>
                    <td>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="text-gray-900 dark:text-slate-300">
                      {log.entity_type}
                      {log.entity_id && (
                        <span className="text-xs text-gray-500 dark:text-slate-500 ml-1">({log.entity_id})</span>
                      )}
                    </td>
                    <td className="text-gray-500 dark:text-slate-400 max-w-md truncate">
                      {log.description || '-'}
                    </td>
                    <td className="text-sm text-gray-500 dark:text-slate-400 font-mono">{log.ip_address}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-500 dark:text-slate-400">
        <p>
          <strong className="text-gray-700 dark:text-slate-300">Note:</strong> Audit logs are immutable and retained per COBAC Regulation EMF R-2017/06.
          These records cannot be modified or deleted.
        </p>
      </div>
    </div>
  )
}