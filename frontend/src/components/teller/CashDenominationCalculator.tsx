import React, { useState, useEffect } from 'react';
import { XMarkIcon as X, CalculatorIcon as Calculator } from '@heroicons/react/24/outline';

export interface Denominations {
    bill_10000: number;
    bill_5000: number;
    bill_2000: number;
    bill_1000: number;
    bill_500: number;
    coin_500: number;
    coin_100: number;
    coin_50: number;
    coin_25: number;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (total: number, denominations: Denominations) => void;
    initialDenominations?: Partial<Denominations>;
}

export const CashDenominationCalculator: React.FC<Props> = ({ isOpen, onClose, onConfirm, initialDenominations }) => {
    const [denominations, setDenominations] = useState<Denominations>({
        bill_10000: 0,
        bill_5000: 0,
        bill_2000: 0,
        bill_1000: 0,
        bill_500: 0,
        coin_500: 0,
        coin_100: 0,
        coin_50: 0,
        coin_25: 0,
        ...initialDenominations
    });

    const [total, setTotal] = useState(0);

    useEffect(() => {
        if (isOpen) {
            setDenominations({
                bill_10000: 0, bill_5000: 0, bill_2000: 0, bill_1000: 0, bill_500: 0,
                coin_500: 0, coin_100: 0, coin_50: 0, coin_25: 0,
                ...initialDenominations
            });
        }
    }, [isOpen, initialDenominations]);

    useEffect(() => {
        const newTotal =
            denominations.bill_10000 * 10000 +
            denominations.bill_5000 * 5000 +
            denominations.bill_2000 * 2000 +
            denominations.bill_1000 * 1000 +
            denominations.bill_500 * 500 +
            denominations.coin_500 * 500 +
            denominations.coin_100 * 100 +
            denominations.coin_50 * 50 +
            denominations.coin_25 * 25;

        setTotal(newTotal);
    }, [denominations]);

    const handleInput = (key: keyof Denominations, value: string) => {
        const parsed = parseInt(value, 10);
        setDenominations(prev => ({
            ...prev,
            [key]: isNaN(parsed) || parsed < 0 ? 0 : parsed
        }));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <div className="flex items-center text-blue-800">
                        <Calculator className="w-6 h-6 mr-2" />
                        <h2 className="text-xl font-bold">Cash Denomination Calculator</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50">
                    {/* Bills */}
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                        <h3 className="font-semibold text-gray-700 mb-4 border-b pb-2">FCFA Banknotes</h3>
                        <div className="space-y-3">
                            {[
                                { label: '10,000 CFA', key: 'bill_10000' },
                                { label: '5,000 CFA', key: 'bill_5000' },
                                { label: '2,000 CFA', key: 'bill_2000' },
                                { label: '1,000 CFA', key: 'bill_1000' },
                                { label: '500 CFA', key: 'bill_500' },
                            ].map(item => (
                                <div key={item.key} className="flex justify-between items-center group">
                                    <span className="text-gray-600 font-medium group-hover:text-blue-600 transition-colors">{item.label}</span>
                                    <div className="flex items-center space-x-2">
                                        <span className="text-gray-400 text-sm">x</span>
                                        <input
                                            type="number"
                                            min="0"
                                            className="w-20 px-3 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right outline-none transition-all"
                                            value={denominations[item.key as keyof Denominations] || ''}
                                            onChange={(e) => handleInput(item.key as keyof Denominations, e.target.value)}
                                            onFocus={(e) => e.target.select()}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Coins */}
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                        <h3 className="font-semibold text-gray-700 mb-4 border-b pb-2">FCFA Coins</h3>
                        <div className="space-y-3">
                            {[
                                { label: '500 CFA', key: 'coin_500' },
                                { label: '100 CFA', key: 'coin_100' },
                                { label: '50 CFA', key: 'coin_50' },
                                { label: '25 CFA', key: 'coin_25' },
                            ].map(item => (
                                <div key={item.key} className="flex justify-between items-center group">
                                    <span className="text-gray-600 font-medium group-hover:text-blue-600 transition-colors">{item.label}</span>
                                    <div className="flex items-center space-x-2">
                                        <span className="text-gray-400 text-sm">x</span>
                                        <input
                                            type="number"
                                            min="0"
                                            className="w-20 px-3 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right outline-none transition-all"
                                            value={denominations[item.key as keyof Denominations] || ''}
                                            onChange={(e) => handleInput(item.key as keyof Denominations, e.target.value)}
                                            onFocus={(e) => e.target.select()}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-white border-t border-gray-200">
                    <div className="flex justify-between items-center mb-6">
                        <span className="text-gray-500 text-lg uppercase tracking-wider font-semibold">Total Amount</span>
                        <span className="text-4xl font-black text-blue-900 tracking-tight">
                            {total.toLocaleString()} <span className="text-2xl text-blue-600 font-bold">FCFA</span>
                        </span>
                    </div>

                    <div className="flex space-x-4">
                        <button
                            onClick={onClose}
                            className="flex-1 px-6 py-3 border-2 border-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => onConfirm(total, denominations)}
                            className="flex-1 px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-600/30 transition-all transform hover:-translate-y-0.5"
                        >
                            Confirm Total
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
