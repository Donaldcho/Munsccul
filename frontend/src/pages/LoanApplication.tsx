import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { loansApi, membersApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { formatCurrency } from '../utils/formatters'
import toast from 'react-hot-toast'

interface LoanProduct {
  id: number
  name: string
  code: string
  interest_rate: number
  interest_type: string
  min_amount: number
  max_amount: number
  min_term_months: number
  max_term_months: number
  requires_guarantor: boolean
}

interface Member {
  id: number
  member_id: string
  first_name: string
  last_name: string
}

export default function LoanApplication() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // Role guard — only Credit Officers can originate loans
  if (user?.role !== 'CREDIT_OFFICER') {
    toast.error('Only Credit Officers can originate loan applications (Separation of Duties)')
    return <Navigate to="/loans" replace />
  }

  const [products, setProducts] = useState<LoanProduct[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    member_id: '',
    product_id: '',
    principal_amount: '',
    term_months: '',
    purpose: ''
  })

  useEffect(() => {
    fetchProducts()
    fetchMembers()
  }, [])

  const fetchProducts = async () => {
    try {
      const response = await loansApi.getProducts()
      setProducts(response.data)
    } catch (error) {
      toast.error('Failed to fetch loan products')
    }
  }

  const fetchMembers = async () => {
    try {
      const response = await membersApi.getAll({ limit: 100 })
      setMembers(response.data)
    } catch (error) {
      toast.error('Failed to fetch members')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await loansApi.apply({
        member_id: parseInt(formData.member_id),
        product_id: parseInt(formData.product_id),
        principal_amount: parseFloat(formData.principal_amount),
        term_months: parseInt(formData.term_months),
        purpose: formData.purpose,
        guarantors: []
      })
      toast.success('Loan application submitted successfully')
      navigate('/loans')
    } catch (error) {
      toast.error('Failed to submit loan application')
    } finally {
      setIsLoading(false)
    }
  }

  const selectedProduct = products.find(p => p.id === parseInt(formData.product_id))

  return (
    <div>
      <div className="mb-6">
        <button onClick={() => navigate('/loans')} className="text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 flex items-center mb-4 transition-colors">
          <ArrowLeftIcon className="h-4 w-4 mr-1" />
          Back to Loans
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">New Loan Application</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Submit a new loan application for a member
        </p>
      </div>

      <div className="card max-w-2xl dark:bg-slate-900/40 dark:border-slate-800">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="label dark:text-slate-300">Member *</label>
            <select
              required
              value={formData.member_id}
              onChange={(e) => setFormData({ ...formData, member_id: e.target.value })}
              className="input"
            >
              <option value="">Select a member</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.first_name} {member.last_name} ({member.member_id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label dark:text-slate-300">Loan Product *</label>
            <select
              required
              value={formData.product_id}
              onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
              className="input"
            >
              <option value="">Select a product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} - {product.interest_rate}% ({product.interest_type})
                </option>
              ))}
            </select>
          </div>

          {selectedProduct && (
            <div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-lg text-sm border dark:border-slate-700">
              <p className="dark:text-slate-300"><strong className="dark:text-white">Amount Range:</strong> {formatCurrency(selectedProduct.min_amount)} - {formatCurrency(selectedProduct.max_amount)}</p>
              <p className="dark:text-slate-300"><strong className="dark:text-white">Term Range:</strong> {selectedProduct.min_term_months} - {selectedProduct.max_term_months} months</p>
              <p className="dark:text-slate-300"><strong className="dark:text-white">Interest Rate:</strong> {selectedProduct.interest_rate}% ({selectedProduct.interest_type})</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label dark:text-slate-300">Principal Amount (FCFA) *</label>
              <input
                type="number"
                required
                value={formData.principal_amount}
                onChange={(e) => setFormData({ ...formData, principal_amount: e.target.value })}
                className="input"
                placeholder="Enter amount"
              />
            </div>
            <div>
              <label className="label dark:text-slate-300">Term (Months) *</label>
              <input
                type="number"
                required
                value={formData.term_months}
                onChange={(e) => setFormData({ ...formData, term_months: e.target.value })}
                className="input"
                placeholder="Enter term"
              />
            </div>
          </div>

          <div>
            <label className="label dark:text-slate-300">Purpose</label>
            <textarea
              value={formData.purpose}
              onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
              className="input"
              rows={3}
              placeholder="Describe the purpose of the loan"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/loans')}
              className="btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary disabled:opacity-50"
            >
              {isLoading ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}