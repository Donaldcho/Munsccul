import React, { useState, useEffect, useRef } from 'react';
import { XMarkIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

interface TellerPINModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    amount: number;
    type: 'DEPOSIT' | 'WITHDRAWAL';
}

export const TellerPINModal: React.FC<TellerPINModalProps> = ({ isOpen, onClose, onSuccess, amount, type }) => {
    const [pin, setPin] = useState(['', '', '', '']);
    const [error, setError] = useState(false);
    const inputRefs = [
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null)
    ];

    useEffect(() => {
        if (isOpen) {
            setPin(['', '', '', '']);
            setError(false);
            setTimeout(() => inputRefs[0].current?.focus(), 100);
        }
    }, [isOpen]);

    const handleChange = (index: number, value: string) => {
        if (value.length > 1) value = value.slice(-1);
        if (!/^\d*$/.test(value)) return;

        const newPin = [...pin];
        newPin[index] = value;
        setPin(newPin);

        if (value && index < 3) {
            inputRefs[index + 1].current?.focus();
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !pin[index] && index > 0) {
            inputRefs[index - 1].current?.focus();
        }
        if (e.key === 'Enter' && pin.every(p => p !== '')) {
            handleSubmit();
        }
    };

    const handleSubmit = () => {
        const fullPin = pin.join('');
        // Simulated PIN check - in production this would verify against authStore/API
        if (fullPin === '1234') { // Mock PIN
            onSuccess();
        } else {
            setError(true);
            setPin(['', '', '', '']);
            inputRefs[0].current?.focus();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-8 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-xl">
                            <ShieldCheckIcon className="h-6 w-6 text-primary-600" />
                        </div>
                        <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Authorization Required</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                        <XMarkIcon className="h-6 w-6 text-slate-400" />
                    </button>
                </div>

                <div className="text-center mb-8">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Confirm {type} of</p>
                    <p className="text-3xl font-black text-slate-900 dark:text-white">
                        {new Intl.NumberFormat('fr-CM', { style: 'currency', currency: 'XAF' }).format(amount)}
                    </p>
                </div>

                <div className="flex justify-center space-x-4 mb-8">
                    {pin.map((p, i) => (
                        <input
                            key={i}
                            ref={inputRefs[i]}
                            type="password"
                            maxLength={1}
                            className={`w-14 h-20 text-center text-4xl font-black rounded-2xl border-2 transition-all outline-none
                                ${error ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:border-primary-500'}`}
                            value={p}
                            onChange={(e) => handleChange(i, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(i, e)}
                        />
                    ))}
                </div>

                {error && <p className="text-center text-red-500 text-xs font-bold uppercase mb-4">Invalid Secure PIN</p>}

                <button
                    onClick={handleSubmit}
                    disabled={pin.some(p => p === '')}
                    className="w-full py-4 bg-slate-900 dark:bg-primary-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary-500/10 hover:shadow-primary-500/30 active:scale-95 transition-all disabled:opacity-50"
                >
                    Confirm & Execute
                </button>

                <p className="text-center text-[10px] text-slate-400 uppercase tracking-widest mt-4">Authorized Teller: {localStorage.getItem('user_full_name') || 'Teller'}</p>
            </div>
        </div>
    );
};
