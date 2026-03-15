import React, { useState, useEffect } from 'react';
import { XMarkIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline';
import { treasuryApi, usersApi } from '../../services/api';
import toast from 'react-hot-toast';

interface TreasuryAccount {
    id: number;
    name: string;
    account_type: 'VAULT' | 'BANK' | 'CREDIT_UNION' | 'MOBILE_MONEY';
    account_number: string | null;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function TreasuryTransferModal({ isOpen, onClose, onSuccess }: Props) {
    const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
    const [loading, setLoading] = useState(false);

    // Form state
    const [transferType, setTransferType] = useState('VAULT_TO_EXTERNAL');
    const [amount, setAmount] = useState('');
    const [sourceId, setSourceId] = useState('');
    const [destId, setDestId] = useState('');
    const [tellerId, setTellerId] = useState('');
    const [description, setDescription] = useState('');
    const [tellers, setTellers] = useState<any[]>([]);

    useEffect(() => {
        if (isOpen) {
            fetchAccounts();
            fetchTellers();
        } else {
            // Reset form
            setTransferType('VAULT_TO_EXTERNAL');
            setAmount('');
            setSourceId('');
            setDestId('');
            setTellerId('');
            setDescription('');
        }
    }, [isOpen]);

    const fetchAccounts = async () => {
        try {
            const res = await treasuryApi.getAccounts();
            setAccounts(res.data);
        } catch (error) {
            toast.error("Failed to load treasury accounts");
        }
    };

    const fetchTellers = async () => {
        try {
            const res = await usersApi.getAll();
            setTellers(res.data.filter((u: any) => u.role === 'TELLER'));
        } catch (error) {
            console.error("Failed to load tellers", error);
        }
    };

    const getSourceOptions = () => {
        if (transferType === 'VAULT_TO_EXTERNAL') return accounts.filter(a => a.account_type === 'VAULT');
        if (transferType === 'EXTERNAL_TO_DIGITAL') return accounts.filter(a => ['BANK', 'CREDIT_UNION'].includes(a.account_type));
        if (transferType === 'DIGITAL_TO_EXTERNAL') return accounts.filter(a => a.account_type === 'MOBILE_MONEY');
        if (transferType === 'VAULT_TO_TELLER') return accounts.filter(a => a.account_type === 'VAULT');
        return accounts;
    };

    const getDestOptions = () => {
        if (transferType === 'VAULT_TO_EXTERNAL') return accounts.filter(a => ['BANK', 'CREDIT_UNION'].includes(a.account_type));
        if (transferType === 'EXTERNAL_TO_DIGITAL') return accounts.filter(a => a.account_type === 'MOBILE_MONEY');
        if (transferType === 'DIGITAL_TO_EXTERNAL') return accounts.filter(a => ['BANK', 'CREDIT_UNION'].includes(a.account_type));
        return accounts;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || !sourceId || (transferType !== 'VAULT_TO_TELLER' && !destId) || (transferType === 'VAULT_TO_TELLER' && !tellerId)) {
            toast.error("Please fill in all required fields");
            return;
        }

        setLoading(true);
        try {
            await treasuryApi.requestTransfer({
                amount: Number(amount),
                transfer_type: transferType,
                description: description || undefined,
                source_treasury_id: Number(sourceId),
                destination_treasury_id: destId ? Number(destId) : undefined,
                teller_id: tellerId ? Number(tellerId) : undefined
            });
            toast.success("Transfer request submitted for approval");
            onSuccess();
            onClose();
        } catch (error: any) {
            toast.error(error.response?.data?.detail || "Failed to submit transfer request");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Auto-select if only one option is available
        const sources = getSourceOptions();
        const dests = getDestOptions();

        if (sources.length === 1 && sourceId !== sources[0].id.toString()) {
            setSourceId(sources[0].id.toString());
        } else if (sources.length > 0 && !sources.find(s => s.id.toString() === sourceId)) {
            // Allow manual selection if multiple exist
        }

        if (transferType !== 'VAULT_TO_TELLER') {
            if (dests.length === 1 && destId !== dests[0].id.toString()) {
                setDestId(dests[0].id.toString());
            } else if (dests.length > 0 && !dests.find(d => d.id.toString() === destId)) {
                // Allow manual selection
            }
        }
    }, [transferType, accounts]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl">
                            <ArrowsRightLeftIcon className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white">Treasury Transfer</h2>
                            <p className="text-sm text-slate-500">Move liquidity between pools</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Transfer Flow</label>
                        <select
                            value={transferType}
                            onChange={(e) => setTransferType(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="VAULT_TO_EXTERNAL">Vault to External Bank (Placement)</option>
                            <option value="VAULT_TO_TELLER">Vault to Teller Drawer (Morning Float)</option>
                            <option value="EXTERNAL_TO_DIGITAL">External Bank to Digital Wallet (MoMo Float)</option>
                            <option value="DIGITAL_TO_EXTERNAL">Digital Wallet to External Bank (Evacuation)</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Source / Debit</label>
                            <select
                                value={sourceId}
                                onChange={(e) => setSourceId(e.target.value)}
                                required
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value="">Select source...</option>
                                {getSourceOptions().map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                ))}
                            </select>
                        </div>
                        {transferType !== 'VAULT_TO_TELLER' && (
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Destination / Credit</label>
                                <select
                                    value={destId}
                                    onChange={(e) => setDestId(e.target.value)}
                                    required
                                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                    <option value="">Select destination...</option>
                                    {getDestOptions().map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {transferType === 'VAULT_TO_TELLER' && (
                            <div className="col-span-1">
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Destination Teller</label>
                                <select
                                    value={tellerId}
                                    onChange={(e) => setTellerId(e.target.value)}
                                    required
                                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                >
                                    <option value="">Select teller...</option>
                                    {tellers.map(t => (
                                        <option key={t.id} value={t.id}>{t.full_name} (@{t.username})</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Amount (FCFA)</label>
                        <input
                            type="number"
                            min="1"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            required
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white font-black text-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="0"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Description (Optional)</label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="e.g. Funding MoMo wallet for weekend operations"
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 transition-all disabled:opacity-50"
                        >
                            {loading ? 'Submitting...' : 'Submit Request'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
