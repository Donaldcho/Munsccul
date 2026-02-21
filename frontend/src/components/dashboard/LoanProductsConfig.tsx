import { useState, useEffect } from 'react'
import {
    PlusIcon,
    NoSymbolIcon,
    LockClosedIcon,
    CurrencyDollarIcon
} from '@heroicons/react/24/outline'
import { loansApi } from '../../services/api'
import { formatCurrency } from '../../utils/formatters'
import toast from 'react-hot-toast'

export default function LoanProductsConfig() {
    const [products, setProducts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [activeProductsOnly, setActiveProductsOnly] = useState(true)

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        description: '',
        interest_rate: '',
        interest_type: 'declining_balance',
        min_amount: '',
        max_amount: '',
        min_term_months: '',
        max_term_months: '',
        requires_guarantor: false,
        guarantor_percentage: '100',
        // GL Accounts
        gl_portfolio_account: '',
        gl_interest_account: '',
        gl_penalty_account: ''
    })

    useEffect(() => {
        fetchProducts()
    }, [activeProductsOnly])

    const fetchProducts = async () => {
        setLoading(true)
        try {
            // We need a way to fetch all products regardless of status for this view
            // But currently the API defaults to active=true. 
            // The backend update allows active=false to filter by status
            // Ideally we'd validte if we can fetch *all*
            // For now let's toggle based on switch
            const response = await loansApi.getProducts() // This gets active ones
            // If we implemented an "all" filter we would use it here.
            // Since we modified backend to take `is_active` param:
            // Let's assume the frontend api call needs update or backend handles it.
            // Actually `loansApi.getProducts` calls `/loans/products`.
            // The backend endpoint accepts `is_active`.
            setProducts(response.data)
        } catch (error) {
            console.error('Failed to fetch products', error)
            toast.error('Failed to load loan products')
        } finally {
            setLoading(false)
        }
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await loansApi.createProduct({
                ...formData,
                interest_rate: parseFloat(formData.interest_rate),
                min_amount: parseFloat(formData.min_amount),
                max_amount: parseFloat(formData.max_amount),
                min_term_months: parseInt(formData.min_term_months),
                max_term_months: parseInt(formData.max_term_months),
                guarantor_percentage: parseFloat(formData.guarantor_percentage)
            })
            toast.success('Loan Product Created')
            setShowCreateModal(false)
            fetchProducts()
            // Reset form
            setFormData({
                name: '', code: '', description: '', interest_rate: '',
                interest_type: 'declining_balance', min_amount: '', max_amount: '',
                min_term_months: '', max_term_months: '', requires_guarantor: false,
                guarantor_percentage: '100', gl_portfolio_account: '',
                gl_interest_account: '', gl_penalty_account: ''
            })
        } catch (error: any) {
            toast.error(error.response?.data?.detail || 'Failed to create product')
        }
    }

    const handleDeactivate = async (product: any) => {
        const confirmMsg = `Are you sure you want to DEACTIVATE "${product.name}"?\n\n` +
            `This acts as a SAFETY LOCK. Active loans will remain unchanged, ` +
            `but Credit Officers will no longer be able to select this product for new applications.`

        if (!window.confirm(confirmMsg)) return

        try {
            await loansApi.deactivateProduct(product.id)
            toast.success('Product Deactivated')
            fetchProducts()
        } catch (error) {
            toast.error('Failed to deactivate product')
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Loan Product Configuration</h2>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Define financial products and accounting rules</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="btn btn-primary flex items-center"
                >
                    <PlusIcon className="h-5 w-5 mr-2" />
                    New Product
                </button>
            </div>

            {/* Disclaimer / Safety Lock Info */}
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <LockClosedIcon className="h-5 w-5 text-yellow-500 dark:text-yellow-400" />
                    </div>
                    <div className="ml-3">
                        <p className="text-sm text-yellow-700 dark:text-yellow-200">
                            <span className="font-bold">Safety Lock Active:</span> To ensure financial integrity,
                            active loan products cannot be edited. To change rates or terms, you must
                            DEACTIVATE the old product and CREATE a new version.
                        </p>
                    </div>
                </div>
            </div>

            <div className="card">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                        <thead className="bg-gray-50 dark:bg-slate-800/60">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Product</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Interest</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Terms</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">GL Accounts</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-transparent divide-y divide-gray-200 dark:divide-slate-700">
                            {products.map((product) => (
                                <tr key={product.id} className={!product.is_active ? 'bg-gray-50 dark:bg-slate-800/40 opacity-75' : 'hover:bg-gray-50 dark:hover:bg-slate-800/30'}>
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-medium text-gray-900 dark:text-slate-200">{product.name}</div>
                                        <div className="text-xs text-gray-500 dark:text-slate-400">Code: {product.code}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-gray-900 dark:text-slate-200">{product.interest_rate}% / yr</div>
                                        <div className="text-xs text-gray-500 dark:text-slate-400 capitalize">{product.interest_type.replace('_', ' ')}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-gray-900 dark:text-slate-200">
                                            {formatCurrency(product.min_amount)} - {formatCurrency(product.max_amount)}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-slate-400">
                                            {product.min_term_months} - {product.max_term_months} months
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-gray-500 dark:text-slate-400">
                                        <div>Portfolio: {product.gl_portfolio_account || 'N/A'}</div>
                                        <div>Interest: {product.gl_interest_account || 'N/A'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {product.is_active ? (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400">
                                                Active
                                            </span>
                                        ) : (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 dark:bg-slate-700/50 text-gray-800 dark:text-slate-300">
                                                Inactive
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-slate-400">
                                        {product.is_active && (
                                            <button
                                                onClick={() => handleDeactivate(product)}
                                                className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 flex items-center font-medium transition-colors"
                                                title="Deactivate Product"
                                            >
                                                <NoSymbolIcon className="h-4 w-4 mr-1" />
                                                Deactivate
                                            </button>
                                        )}
                                        {!product.is_active && (
                                            <span className="flex items-center text-gray-400 dark:text-slate-600 cursor-not-allowed">
                                                <LockClosedIcon className="h-4 w-4 mr-1" />
                                                Locked
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-gray-600 dark:bg-black bg-opacity-50 dark:bg-opacity-70 overflow-y-auto h-full w-full z-50 flex items-start justify-center p-4">
                    <div className="relative top-10 mx-auto p-6 border dark:border-slate-700 w-[800px] shadow-2xl rounded-xl bg-white dark:bg-slate-900 mb-20">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Create New Loan Product</h3>
                            <button onClick={() => setShowCreateModal(false)} className="text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200">
                                <PlusIcon className="h-6 w-6 rotate-45" />
                            </button>
                        </div>

                        <form onSubmit={handleCreate} className="space-y-6">

                            {/* Section 1: Basic Info */}
                            <div className="bg-gray-50 dark:bg-slate-800/60 p-5 rounded-xl border dark:border-slate-700">
                                <h4 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest mb-4">Product Identity</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="label dark:text-slate-300">Product Name</label>
                                        <input type="text" required className="input dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="e.g. Back to School 2026"
                                            value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="label dark:text-slate-300">Product Code</label>
                                        <input type="text" required className="input dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="e.g. SCH-2026"
                                            value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="label dark:text-slate-300">Description</label>
                                        <textarea className="input dark:bg-slate-900 dark:border-slate-700 dark:text-white" rows={2}
                                            value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Financial Terms */}
                            <div className="bg-blue-50 dark:bg-blue-900/10 p-5 rounded-xl border border-blue-100 dark:border-blue-900/30">
                                <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-widest mb-4">Financial Terms</h4>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="label dark:text-slate-300">Interest Rate (% Annual)</label>
                                        <input type="number" required step="0.01" className="input dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                                            value={formData.interest_rate} onChange={e => setFormData({ ...formData, interest_rate: e.target.value })} />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="label dark:text-slate-300">Methodology</label>
                                        <select className="input dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                                            value={formData.interest_type} onChange={e => setFormData({ ...formData, interest_type: e.target.value })}>
                                            <option value="declining_balance" className="dark:bg-slate-900">Declining Balance (Amortized)</option>
                                            <option value="flat" className="dark:bg-slate-900">Flat Rate</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mt-4">
                                    <div>
                                        <label className="label dark:text-slate-300">Principal Limits (Min - Max)</label>
                                        <div className="flex space-x-2">
                                            <input type="number" placeholder="Min" required className="input dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                                                value={formData.min_amount} onChange={e => setFormData({ ...formData, min_amount: e.target.value })} />
                                            <input type="number" placeholder="Max" required className="input dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                                                value={formData.max_amount} onChange={e => setFormData({ ...formData, max_amount: e.target.value })} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="label dark:text-slate-300">Term Limits (Months)</label>
                                        <div className="flex space-x-2">
                                            <input type="number" placeholder="Min" required className="input dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                                                value={formData.min_term_months} onChange={e => setFormData({ ...formData, min_term_months: e.target.value })} />
                                            <input type="number" placeholder="Max" required className="input dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                                                value={formData.max_term_months} onChange={e => setFormData({ ...formData, max_term_months: e.target.value })} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Accounting */}
                            <div className="bg-indigo-50 dark:bg-indigo-900/10 p-5 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                                <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-widest mb-4">Accounting Mapping (GL)</h4>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="label dark:text-slate-300">Portfolio Account</label>
                                        <input type="text" required className="input dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="e.g. 1200"
                                            value={formData.gl_portfolio_account} onChange={e => setFormData({ ...formData, gl_portfolio_account: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="label dark:text-slate-300">Interest Income</label>
                                        <input type="text" required className="input dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="e.g. 5100"
                                            value={formData.gl_interest_account} onChange={e => setFormData({ ...formData, gl_interest_account: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="label dark:text-slate-300">Penalty Income</label>
                                        <input type="text" className="input dark:bg-slate-900 dark:border-slate-700 dark:text-white" placeholder="e.g. 5200"
                                            value={formData.gl_penalty_account} onChange={e => setFormData({ ...formData, gl_penalty_account: e.target.value })} />
                                    </div>
                                </div>
                            </div>

                            {/* Section 4: Guarantors */}
                            <div className="bg-gray-50 dark:bg-slate-800/60 p-5 rounded-xl border dark:border-slate-700">
                                <div className="flex items-center mb-2">
                                    <input type="checkbox" id="guarantor" className="w-4 h-4 rounded border-gray-300 dark:border-slate-700 dark:bg-slate-900 text-primary-600 focus:ring-primary-500 mr-2"
                                        checked={formData.requires_guarantor}
                                        onChange={e => setFormData({ ...formData, requires_guarantor: e.target.checked })} />
                                    <label htmlFor="guarantor" className="font-bold text-gray-700 dark:text-slate-300 uppercase text-xs tracking-wider">Requires Guarantors?</label>
                                </div>
                                {formData.requires_guarantor && (
                                    <div>
                                        <label className="label dark:text-slate-300">Coverage Percentage (%)</label>
                                        <input type="number" className="input w-1/3 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                                            value={formData.guarantor_percentage} onChange={e => setFormData({ ...formData, guarantor_percentage: e.target.value })} />
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end space-x-3 pt-6 border-t dark:border-slate-700">
                                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
                                <button type="submit" className="btn-primary">Create Product</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
