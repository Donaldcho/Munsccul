import React, { useState } from 'react';
import { XMarkIcon, BanknotesIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { api } from '../../services/api';
import toast from 'react-hot-toast';
import { CashDenominationCalculator, Denominations } from './CashDenominationCalculator';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (reconciliationId: number, status: string) => void;
}

export const BlindEODModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
    const [showCalculator, setShowCalculator] = useState(false);
    const [denominations, setDenominations] = useState<Denominations>({
        bill_10000: 0, bill_5000: 0, bill_2000: 0, bill_1000: 0, bill_500: 0,
        coin_500: 0, coin_100: 0, coin_50: 0, coin_25: 0
    });
    const [declaredTotal, setDeclaredTotal] = useState(0);
    const [momoBalance, setMomoBalance] = useState<number>(0);
    const [omBalance, setOmBalance] = useState<number>(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<any | null>(null);

    if (!isOpen) return null;

    const handleCalculatorConfirm = (total: number, newDenoms: Denominations) => {
        setDeclaredTotal(total);
        setDenominations(newDenoms);
        setShowCalculator(false);
    };

    const handleSubmit = async () => {
        if (declaredTotal === 0 && momoBalance === 0 && omBalance === 0) {
            toast.error('Please declare your balances.');
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await api.post('/teller/blind-eod', {
                denominations: denominations,
                momo_balance: momoBalance,
                om_balance: omBalance
            });

            setResult(response.data);

            toast.success('End of Day Reconciliation Submitted.');

            // Delay closing to show result to teller
            setTimeout(() => {
                onSuccess(response.data.id, response.data.status);
                onClose();
                // Reset state for next time
                setResult(null);
                setDeclaredTotal(0);
                setMomoBalance(0);
                setOmBalance(0);
            }, 5000);

        } catch (error) {
            toast.error('Failed to submit EOD reconciliation.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={!isSubmitting && !result ? onClose : undefined}></div>

                <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
                    <div className="bg-blue-900 border-b border-blue-800 p-6 flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 bg-blue-800 rounded-full flex items-center justify-center mb-4 border-2 border-blue-700">
                            <BanknotesIcon className="w-8 h-8 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Blind EOD Balancing</h2>
                        <p className="text-blue-200 mt-2 text-sm">
                            Declare your physical cash and digital float. The system will independently verify the totals.
                        </p>
                    </div>

                    {!result && !isSubmitting && (
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 text-blue-200 hover:text-white transition-colors"
                        >
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    )}

                    <div className="p-8">
                        {result ? (
                            <div className="text-center py-4">
                                {result.status === 'BALANCED' ? (
                                    <>
                                        <CheckCircleIcon className="w-20 h-20 text-green-500 mx-auto mb-4" />
                                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Perfectly Balanced</h3>
                                        <p className="text-gray-500">All local and digital balances match the system exactly. Great job.</p>
                                    </>
                                ) : (
                                    <>
                                        <ExclamationTriangleIcon className="w-20 h-20 text-orange-500 mx-auto mb-4" />
                                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Variance Detected</h3>
                                        <div className="space-y-2 mb-6">
                                            {result.variance_amount !== 0 && (
                                                <p className="text-gray-700">Cash Variance: <span className="font-bold text-red-600">{result.variance_amount.toLocaleString()} FCFA</span></p>
                                            )}
                                            {result.momo_variance !== 0 && (
                                                <p className="text-gray-700">MoMo Variance: <span className="font-bold text-red-600">{result.momo_variance.toLocaleString()} FCFA</span></p>
                                            )}
                                            {result.om_variance !== 0 && (
                                                <p className="text-gray-700">Orange Var: <span className="font-bold text-red-600">{result.om_variance.toLocaleString()} FCFA</span></p>
                                            )}
                                        </div>
                                        <p className="text-gray-500 mb-4">Variances have been logged for manager review.</p>
                                        <p className="text-sm text-gray-400">Do not make manual adjustments. A manager will verify.</p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* CASH SECTION */}
                                <div className="bg-gray-50 rounded-xl p-6 border-2 border-dashed border-gray-300 text-center">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Declared Physical Total</h3>
                                    <div className="text-4xl font-black text-gray-900 tracking-tight mb-4">
                                        {declaredTotal.toLocaleString()} <span className="text-xl text-gray-400 font-bold tracking-normal">FCFA</span>
                                    </div>
                                    <button
                                        onClick={() => setShowCalculator(true)}
                                        className="inline-flex items-center px-4 py-2 border border-blue-600 text-blue-600 font-medium rounded-lg hover:bg-blue-50 transition-colors"
                                    >
                                        Open Denomination Calculator
                                    </button>
                                </div>

                                {/* DIGITAL FLOAT SECTION */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest">MTN MoMo Balance</label>
                                        <input
                                            type="number"
                                            value={momoBalance || ''}
                                            onChange={(e) => setMomoBalance(Number(e.target.value))}
                                            placeholder="MTN Float"
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Orange Money</label>
                                        <input
                                            type="number"
                                            value={omBalance || ''}
                                            onChange={(e) => setOmBalance(Number(e.target.value))}
                                            placeholder="Orange Float"
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="flex space-x-4 pt-4">
                                    <button
                                        onClick={onClose}
                                        disabled={isSubmitting}
                                        className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSubmit}
                                        disabled={isSubmitting || (declaredTotal === 0 && momoBalance === 0 && omBalance === 0)}
                                        className="flex-1 px-4 py-3 bg-blue-900 text-white font-medium rounded-lg hover:bg-blue-800 focus:ring-4 focus:ring-blue-900/30 disabled:opacity-50 disabled:bg-blue-300 transition-all shadow-lg shadow-blue-900/20"
                                    >
                                        {isSubmitting ? 'Sumitting...' : 'Submit Final Count'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <CashDenominationCalculator
                isOpen={showCalculator}
                onClose={() => setShowCalculator(false)}
                initialDenominations={denominations}
                onConfirm={handleCalculatorConfirm}
            />
        </>
    );
};
