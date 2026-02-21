import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    ArrowDownTrayIcon,
    ArrowUpTrayIcon,
    UserCircleIcon,
    CheckBadgeIcon,
    ExclamationCircleIcon,
    CreditCardIcon,
    XMarkIcon,
    MegaphoneIcon,
    UserGroupIcon as QueueIcon,
    HandRaisedIcon
} from '@heroicons/react/24/outline';
import { membersApi, accountsApi, transactionsApi, queueApi, api } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';

// Components
import { SessionAutoLock } from '../teller/SessionAutoLock';
import { CashDenominationCalculator, Denominations } from '../teller/CashDenominationCalculator';
import { ManagerOverrideModal } from '../teller/ManagerOverrideModal';
import { BlindEODModal } from '../teller/BlindEODModal';

export default function TellerDashboard() {
    const { user } = useAuthStore();
    const [accountQuery, setAccountQuery] = useState('');

    // Member & Account Context
    const [member, setMember] = useState<any>(null);
    const [account, setAccount] = useState<any>(null);
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

    // Transaction State
    const [txType, setTxType] = useState<'DEPOSIT' | 'WITHDRAWAL' | null>(null);
    const [amount, setAmount] = useState<number>(0);
    const [amountInput, setAmountInput] = useState<string>('');

    // UI State
    const [isSearching, setIsSearching] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [focusMode, setFocusMode] = useState(false);
    const [showDenomCalc, setShowDenomCalc] = useState(false);
    const [showOverride, setShowOverride] = useState(false);
    const [showEod, setShowEod] = useState(false);

    // Overrides & Limits
    const TELLER_LIMIT = user?.teller_cash_limit || 1000000;
    // Note: For deposits, we simulate "Drawer exceeds limit" to force a vault drop.
    // We'll track a simulated drawer balance for demonstration.
    const [simDrawerBalance, setSimDrawerBalance] = useState(500000);

    // Queue State
    const [currentTicket, setCurrentTicket] = useState<any>(null);
    const [queueLoading, setQueueLoading] = useState(false);
    const [selectedService, setSelectedService] = useState('CASH');

    const searchInputRef = useRef<HTMLInputElement>(null);
    const amountInputRef = useRef<HTMLInputElement>(null);

    // Focus Search on load
    useEffect(() => {
        searchInputRef.current?.focus();
    }, []);

    // Keyboard Shortcuts (F1, F2, Enter)
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            // Don't intercept if overriding or doing EOD or Calc
            if (showOverride || showEod || showDenomCalc) return;

            if (e.key === 'F1') {
                e.preventDefault();
                if (account) {
                    setTxType('DEPOSIT');
                    setFocusMode(true);
                    setTimeout(() => amountInputRef.current?.focus(), 50);
                } else {
                    toast('Search an account first', { icon: 'ℹ️' });
                }
            } else if (e.key === 'F2') {
                e.preventDefault();
                if (account) {
                    setTxType('WITHDRAWAL');
                    setFocusMode(true);
                    setTimeout(() => amountInputRef.current?.focus(), 50);
                } else {
                    toast('Search an account first', { icon: 'ℹ️' });
                }
            } else if (e.key === 'Escape') {
                if (focusMode) {
                    handleCancelTx();
                } else if (account) {
                    resetTerminal();
                }
            }
        },
        [account, focusMode, showOverride, showEod, showDenomCalc]
    );

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const resetTerminal = () => {
        setMember(null);
        setAccount(null);
        setPhotoUrl(null);
        setSignatureUrl(null);
        setAccountQuery('');
        handleCancelTx();
        setTimeout(() => searchInputRef.current?.focus(), 50);
    };

    const handleCancelTx = () => {
        setTxType(null);
        setAmount(0);
        setAmountInput('');
        setFocusMode(false);
        setTimeout(() => searchInputRef.current?.focus(), 50);
    };

    const loadMedia = async (memberId: number) => {
        // In a real app, these endpoints return binary data.
        // For React to render them, we create Object URLs from blolbs.
        try {
            const resPhoto = await api.get(`/members/${memberId}/photo`, { responseType: 'blob' });
            setPhotoUrl(URL.createObjectURL(resPhoto.data));
        } catch (e) { setPhotoUrl(null); }

        try {
            const resSig = await api.get(`/members/${memberId}/signature`, { responseType: 'blob' });
            setSignatureUrl(URL.createObjectURL(resSig.data));
        } catch (e) { setSignatureUrl(null); }
    };

    const searchAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!accountQuery.trim()) return;

        setIsSearching(true);
        try {
            // Find account by number
            const res = await accountsApi.getAll({ limit: 100 });
            const accounts = Array.isArray(res.data) ? res.data : [];
            const match = accounts.find((a: any) => a.account_number.toLowerCase() === accountQuery.toLowerCase().trim());

            if (match) {
                setAccount(match);
                // Fetch Member
                const memRes = await membersApi.getById(match.member_id);
                setMember(memRes.data);
                // Load secure split-screen verification media
                loadMedia(match.member_id);
                toast.success('Member Verified');
            } else {
                toast.error('Account not found');
                resetTerminal();
            }
        } catch (err) {
            toast.error('Search failed');
        } finally {
            setIsSearching(false);
        }
    };

    const handleDenomConfirm = (tot: number, _d: Denominations) => {
        setAmount(tot);
        setAmountInput(tot.toString());
        setShowDenomCalc(false);
        amountInputRef.current?.focus();
    };

    const processTransaction = async (overrideManagerId?: number) => {
        if (!account || !txType || amount <= 0) return;

        // Security: Check Drawer Limits
        if (txType === 'DEPOSIT' && simDrawerBalance + amount > TELLER_LIMIT && !overrideManagerId) {
            toast.error(`⚠️ Deposit pushes drawer over limit (${formatCurrency(TELLER_LIMIT)}). Vault Drop Required.`);
            return;
        }

        if (txType === 'WITHDRAWAL' && amount > TELLER_LIMIT && !overrideManagerId) {
            // Requires in-place manager override
            setShowOverride(true);
            return;
        }

        setIsProcessing(true);
        try {
            const payload: any = {
                account_id: account.id,
                amount: amount,
                description: `Terminal ${txType} - Source: Keyboard`
            };

            if (overrideManagerId) {
                payload.approved_by = overrideManagerId;
                payload.description += ` (Manager Override ${overrideManagerId})`;
            }

            if (txType === 'DEPOSIT') {
                await transactionsApi.deposit(payload);
                setSimDrawerBalance(prev => prev + amount);
            } else {
                await transactionsApi.withdraw(payload);
                setSimDrawerBalance(prev => prev - amount);
            }

            toast.success('Transaction Successful');

            // Automated Receipt Printing
            // Immediately trigger browser print for thermal printer without blocking
            window.print();

            // Reset for next
            resetTerminal();
        } catch (err: any) {
            // Handled by global interceptor
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCallNext = async () => {
        setQueueLoading(true);
        try {
            // Counter number can be hardcoded per workstation or pulled from settings
            // For now, let's assume a default counter #1 or prompt the user if not set
            const counter = localStorage.getItem('teller_counter') || '1';
            const res = await queueApi.callNext({
                service_type: selectedService,
                counter_number: counter
            });
            setCurrentTicket(res.data);
            toast.success(`Called Ticket ${res.data.ticket_number}`);
        } catch (err: any) {
            // Error is handled by global interceptor
        } finally {
            setQueueLoading(false);
        }
    };

    const handleRecall = async () => {
        if (!currentTicket) return;
        try {
            await queueApi.recall(currentTicket.id);
            toast.success('Ticket Recalled on Display');
        } catch (err) {
            toast.error('Failed to recall');
        }
    };

    const handleCompleteTicket = async () => {
        if (!currentTicket) return;
        try {
            await queueApi.complete(currentTicket.id);
            setCurrentTicket(null);
            toast.success('Service Completed');
        } catch (err) {
            toast.error('Failed to complete');
        }
    };

    const handleNoShow = async () => {
        if (!currentTicket) return;
        try {
            await queueApi.noShow(currentTicket.id);
            setCurrentTicket(null);
            toast.success('Marked as No-Show');
        } catch (err) {
            toast.error('Failed to mark no-show');
        }
    };

    return (
        <div className={`min-h-[calc(100vh-4rem)] flex flex-col transition-all duration-300 ${focusMode ? 'bg-gray-900 dark:bg-black' : 'bg-gray-100 dark:bg-slate-900'} -mt-6 -mx-4 sm:-mx-6 lg:-mx-8 p-4 sm:p-6 lg:p-8`}>
            <SessionAutoLock idleTimeout={60000} />

            {/* Queue Control Widget */}
            {!focusMode && (
                <div className="mb-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center space-x-4">
                        <div className="bg-primary-100 dark:bg-primary-900/30 p-2 rounded-lg">
                            <QueueIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Queue Control</h3>
                            <p className="text-xs text-gray-500 dark:text-slate-400">Manage incoming members</p>
                        </div>
                    </div>

                    <div className="flex items-center space-x-2">
                        {currentTicket ? (
                            <div className="flex items-center space-x-3 bg-gray-50 dark:bg-slate-900/50 px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 animate-in slide-in-from-left-4">
                                <span className="text-2xl font-mono font-bold text-primary-600 dark:text-primary-400">
                                    {currentTicket.ticket_number}
                                </span>
                                <div className="h-4 w-px bg-gray-300 dark:bg-slate-700 mx-2"></div>
                                <button onClick={handleRecall} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg text-gray-600 dark:text-slate-400 transition-colors" title="Recall">
                                    <MegaphoneIcon className="h-5 w-5" />
                                </button>
                                <button onClick={handleNoShow} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400 transition-colors" title="No Show">
                                    <HandRaisedIcon className="h-5 w-5" />
                                </button>
                                <button onClick={handleCompleteTicket} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg shadow-sm transition-transform active:scale-95">
                                    DONE
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center space-x-3">
                                <select
                                    className="text-xs bg-slate-50 dark:bg-slate-700 border-none rounded-lg focus:ring-0 text-slate-600 dark:text-slate-300 py-1"
                                    value={selectedService}
                                    onChange={(e) => setSelectedService(e.target.value)}
                                >
                                    <option value="CASH">Cash & Tellers</option>
                                    <option value="SERVICE">Customer Service</option>
                                    <option value="LOAN">Loans & Credit</option>
                                </select>
                                <button
                                    onClick={handleCallNext}
                                    disabled={queueLoading}
                                    className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-bold transition-all shadow-sm"
                                >
                                    {queueLoading ? (
                                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                                    ) : (
                                        <QueueIcon className="h-4 w-4 mr-2" />
                                    )}
                                    CALL NEXT MEMBER
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Drawer Warning Banner */}
            {simDrawerBalance > TELLER_LIMIT * 0.9 && !focusMode && (
                <div className="mb-4 bg-orange-100 dark:bg-orange-900/30 border-l-4 border-orange-500 p-4 rounded shadow-sm flex justify-between items-center">
                    <div className="flex">
                        <ExclamationCircleIcon className="h-6 w-6 text-orange-600 dark:text-orange-400 mr-2" />
                        <p className="text-orange-800 dark:text-orange-200 font-bold">
                            Warning: Drawer balance ({formatCurrency(simDrawerBalance)}) is approaching or exceeding Vault Limit ({formatCurrency(TELLER_LIMIT)}).
                        </p>
                    </div>
                    <button className="px-4 py-2 bg-orange-600 outline-none hover:bg-orange-700 text-white font-bold rounded shadow-lg transition-transform transform hover:-translate-y-0.5">
                        Initiate Vault Drop
                    </button>
                </div>
            )}

            {/* Header Controls */}
            {!focusMode && (
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-black text-gray-800 dark:text-white uppercase tracking-widest flex items-center">
                        <CreditCardIcon className="w-8 h-8 mr-3 text-blue-600 dark:text-indigo-400" />
                        Teller Terminal
                    </h1>
                    <button
                        onClick={() => setShowEod(true)}
                        className="px-6 py-2 border-2 border-gray-300 dark:border-slate-700 rounded-md font-bold text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white transition-colors bg-white dark:bg-slate-900 shadow-sm"
                    >
                        Close Drawer (EOD)
                    </button>
                </div>
            )}

            {/* Main Terminal Area */}
            <div className={`flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 ${focusMode ? 'scale-105 transition-transform duration-500' : ''}`}>

                {/* Left pane: Split-Screen Authentication */}
                <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col ${focusMode ? 'opacity-90' : ''}`}>
                    <div className="bg-gray-50 dark:bg-slate-800/60 border-b border-gray-200 dark:border-slate-700 p-6">
                        <form onSubmit={searchAccount} className="relative">
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Scan or Type Account Number + Enter"
                                className="w-full text-2xl font-mono p-4 pl-6 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all shadow-inner bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
                                value={accountQuery}
                                onChange={(e) => setAccountQuery(e.target.value)}
                                autoComplete="off"
                            />
                            {isSearching && (
                                <div className="absolute right-6 top-1/2 -translate-y-1/2">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                                </div>
                            )}
                        </form>
                    </div>

                    <div className="flex-1 p-6 flex flex-col items-center justify-center relative">
                        {!member ? (
                            <div className="text-center text-gray-400 dark:text-slate-500">
                                <UserCircleIcon className="w-32 h-32 mx-auto mb-4 opacity-20" />
                                <p className="text-xl font-medium tracking-wide">Awaiting Member Scan...</p>
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col space-y-6 animate-in fade-in zoom-in duration-300">
                                <div className="flex items-start space-x-6">
                                    {/* Photo Verification */}
                                    <div className="w-48 h-48 bg-gray-100 dark:bg-slate-900 rounded-xl overflow-hidden border-4 border-gray-200 dark:border-slate-700 shadow-md relative group flex-shrink-0">
                                        {photoUrl ? (
                                            <img src={photoUrl} alt="Member" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 dark:text-slate-500">
                                                <UserCircleIcon className="w-20 h-20" />
                                                <span className="text-xs uppercase font-bold mt-2">No Photo</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-white text-xs font-bold tracking-widest uppercase">
                                            ID Match
                                        </div>
                                    </div>

                                    {/* Member Details */}
                                    <div className="flex-1">
                                        <div className="flex items-center space-x-2 mb-2">
                                            <h2 className="text-3xl font-black text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-indigo-400 transition-colors uppercase">
                                                {member.first_name} {member.last_name}
                                            </h2>
                                            {member.is_active && <CheckBadgeIcon className="w-8 h-8 text-green-500 dark:text-green-400" />}
                                        </div>
                                        <p className="text-gray-500 dark:text-slate-400 font-mono text-lg mb-6">ID: {member.member_id}</p>

                                        {/* Signature Scan */}
                                        <div className="mt-auto">
                                            <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Signature Verification</p>
                                            <div className="h-24 w-full bg-white dark:bg-slate-900 border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-lg flex items-center justify-center p-2 relative">
                                                {signatureUrl ? (
                                                    <img src={signatureUrl} alt="Signature" className="max-h-full max-w-full" style={{ filter: 'contrast(1.2)' }} />
                                                ) : (
                                                    <span className="text-gray-400 dark:text-slate-500 italic font-serif opacity-50 text-xl">Sign Here</span>
                                                )}
                                                <span className="absolute bottom-1 right-2 text-[10px] text-gray-300 font-bold tracking-widest">AUTHORIZED</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right pane: Transaction Controller */}
                <div className={`rounded-2xl shadow-2xl overflow-hidden flex flex-col ${focusMode ? 'bg-white dark:bg-slate-800 ring-4 ring-blue-500 z-10' : 'bg-gray-50 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700'}`}>
                    {!account ? (
                        <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-slate-500 p-8 text-center flex-col">
                            <p className="text-lg font-medium">Verify a member file to initialize the transaction controller.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            {/* Account Overview bar */}
                            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 p-8 text-white">
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-blue-200 text-sm font-bold uppercase tracking-wider mb-1">Available Balance</p>
                                        <h3 className="text-5xl font-black tracking-tighter">
                                            {formatCurrency(account.available_balance)}
                                        </h3>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-blue-200 text-xs font-bold uppercase mb-1">Account</p>
                                        <p className="font-mono text-xl">{account.account_number}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Transaction Input Area */}
                            <div className="flex-1 p-8 bg-white dark:bg-slate-800 flex flex-col">
                                {!txType ? (
                                    <div className="flex-1 flex flex-col justify-center space-y-4">
                                        <button
                                            onClick={() => { setTxType('DEPOSIT'); setFocusMode(true); setTimeout(() => amountInputRef.current?.focus(), 50); }}
                                            className="w-full py-6 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 border-2 border-green-200 dark:border-green-800/50 text-green-700 dark:text-green-400 rounded-xl flex items-center justify-center group transition-colors focus:ring-4 focus:ring-green-500/30 outline-none"
                                        >
                                            <ArrowDownTrayIcon className="w-8 h-8 mr-4 group-hover:scale-110 transition-transform" />
                                            <div className="text-left">
                                                <span className="block text-2xl font-bold">Cash Deposit</span>
                                                <span className="block text-sm font-semibold opacity-75">Keyboard Shortcut: <kbd className="px-2 py-1 bg-green-200 dark:bg-green-800/50 rounded text-xs ml-1 text-green-900 dark:text-green-300">F1</kbd></span>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => { setTxType('WITHDRAWAL'); setFocusMode(true); setTimeout(() => amountInputRef.current?.focus(), 50); }}
                                            className="w-full py-6 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border-2 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 rounded-xl flex items-center justify-center group transition-colors focus:ring-4 focus:ring-red-500/30 outline-none"
                                        >
                                            <ArrowUpTrayIcon className="w-8 h-8 mr-4 group-hover:scale-110 transition-transform" />
                                            <div className="text-left">
                                                <span className="block text-2xl font-bold">Cash Withdrawal</span>
                                                <span className="block text-sm font-semibold opacity-75">Keyboard Shortcut: <kbd className="px-2 py-1 bg-red-200 dark:bg-red-800/50 rounded text-xs ml-1 text-red-900 dark:text-red-300">F2</kbd></span>
                                            </div>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col animate-in slide-in-from-right-8 duration-300">
                                        <div className="flex justify-between items-center mb-6">
                                            <h3 className={`text-2xl font-black uppercase ${txType === 'DEPOSIT' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                {txType} IN PROGRESS
                                            </h3>
                                            <button onClick={handleCancelTx} className="text-gray-400 hover:text-gray-700 dark:text-slate-500 dark:hover:text-slate-300 p-2">
                                                <XMarkIcon className="w-8 h-8" />
                                            </button>
                                        </div>

                                        <div className="flex-1 flex flex-col justify-center">
                                            <label className="text-sm font-bold text-gray-500 dark:text-slate-400 uppercase tracking-widest mb-4 block">Transaction Amount (FCFA)</label>
                                            <div className="relative mb-6 group">
                                                <input
                                                    ref={amountInputRef}
                                                    type="text"
                                                    value={amountInput}
                                                    onChange={(e) => {
                                                        // Only allow numbers
                                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                                        setAmountInput(val);
                                                        setAmount(val ? parseInt(val, 10) : 0);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            processTransaction();
                                                        }
                                                    }}
                                                    className={`w-full text-5xl font-mono p-4 border-b-4 ${txType === 'DEPOSIT' ? 'border-green-500 text-green-700 dark:text-green-400 focus:border-green-600' : 'border-red-500 text-red-700 dark:text-red-400 focus:border-red-600'} bg-transparent outline-none transition-colors text-right`}
                                                    placeholder="0"
                                                    autoComplete="off"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowDenomCalc(true)}
                                                    className="absolute right-0 top-full mt-2 text-sm font-bold text-blue-600 dark:text-indigo-400 hover:text-blue-800 dark:hover:text-indigo-300 underline decoration-2 underline-offset-4"
                                                >
                                                    Use Denomination Calculator
                                                </button>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => processTransaction()}
                                            disabled={isProcessing || amount <= 0}
                                            className={`w-full py-6 mt-auo text-white text-2xl font-black uppercase tracking-widest rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${txType === 'DEPOSIT' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                                        >
                                            {isProcessing ? 'Processing Executing...' : 'Execute Transaction [ENTER]'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <CashDenominationCalculator
                isOpen={showDenomCalc}
                onClose={() => { setShowDenomCalc(false); amountInputRef.current?.focus(); }}
                onConfirm={handleDenomConfirm}
            />

            <ManagerOverrideModal
                isOpen={showOverride}
                onClose={() => setShowOverride(false)}
                amount={amount}
                onSuccess={(managerId) => {
                    setShowOverride(false);
                    processTransaction(managerId);
                }}
            />

            <BlindEODModal
                isOpen={showEod}
                onClose={() => setShowEod(false)}
                onSuccess={(recId, status) => {
                    toast.success('Drawer has been closed based on reconciliation');
                }}
            />

            {/* Invisible Print Receipt Area - In a real app, this renders a specific CSS print media block */}
            <div className="hidden print:block absolute top-0 left-0 w-full h-full bg-white z-[9999] p-8 text-black font-mono">
                <h1 className="text-2xl font-bold mb-4">MUNSCCUL RECEIPT</h1>
                <div className="border-b-2 border-black border-dashed mb-4"></div>
                <p>Date: {new Date().toLocaleString()}</p>
                <p>Terminal: T1 / Teller: {user?.username}</p>
                <p>Account: {account?.account_number}</p>
                <p>Member: {member?.first_name} {member?.last_name}</p>
                <div className="border-b-2 border-black border-dashed my-4"></div>
                <p className="text-xl">TYPE: {txType}</p>
                <p className="text-2xl font-bold">AMOUNT: {amount} FCFA</p>
                <div className="border-b-2 border-black border-dashed my-4"></div>
                <p className="text-sm">Thank you for your transaction.</p>
            </div>

        </div>
    );
}
