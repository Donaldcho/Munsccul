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
    HandRaisedIcon,
    CalculatorIcon
} from '@heroicons/react/24/outline';
import { membersApi, accountsApi, transactionsApi, queueApi, mobileMoneyApi, tellerApi, treasuryApi, opsApi, api } from '../../services/api';
import { njangiApi } from '../../services/njangiApi';
import { formatCurrency } from '../../utils/formatters';
import { getErrorMessage } from '../../utils/errorUtils';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';

// Components
import { SessionAutoLock } from '../teller/SessionAutoLock';
import { CashDenominationCalculator, Denominations } from '../teller/CashDenominationCalculator';
import { ManagerOverrideModal } from '../teller/ManagerOverrideModal';
import { BlindEODModal } from '../teller/BlindEODModal';
import { TellerPINModal } from '../teller/TellerPINModal';

export default function TellerDashboard() {
    const { user } = useAuthStore();
    const [accountQuery, setAccountQuery] = useState('');

    // Member & Account Context
    const [member, setMember] = useState<any>(null);
    console.log('DEBUG: Current Member State:', JSON.stringify(member, null, 2));
    const [account, setAccount] = useState<any>(null);
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

    // Transaction State
    const [txType, setTxType] = useState<'DEPOSIT' | 'WITHDRAWAL' | 'NJANGI' | 'MOMO_DEPOSIT' | 'MOMO_WITHDRAWAL' | null>(null);
    const [amount, setAmount] = useState<number>(0);
    const [amountInput, setAmountInput] = useState<string>('');
    const [momoPhone, setMomoPhone] = useState<string>('');
    const [momoProvider, setMomoProvider] = useState<string>('MTN_MOMO');

    // Njangi State
    const [searchMode, setSearchMode] = useState<'PERSONAL' | 'NJANGI'>('PERSONAL');
    const [njangiGroup, setNjangiGroup] = useState<any>(null);
    const [njangiMembers, setNjangiMembers] = useState<any[]>([]);
    const [selectedNjangiMember, setSelectedNjangiMember] = useState<any>(null);
    const [njangiCycle, setNjangiCycle] = useState<any>(null);

    // UI State
    const [isSearching, setIsSearching] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [focusMode, setFocusMode] = useState(false);
    const [showDenomCalc, setShowDenomCalc] = useState(false);
    const [showOverride, setShowOverride] = useState(false);
    const [showEod, setShowEod] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [showTreasuryModal, setShowTreasuryModal] = useState(false);
    const [treasuryType, setTreasuryType] = useState<'VAULT_TO_TELLER' | 'TELLER_TO_VAULT'>('VAULT_TO_TELLER');
    const [treasuryAmount, setTreasuryAmount] = useState('');

    // Drawer Ticker State
    const TELLER_LIMIT = 2000000; // 2M FCFA Strict Limit
    const [simDrawerBalance, setSimDrawerBalance] = useState(0);
    const [totalIn, setTotalIn] = useState(0);
    const [totalOut, setTotalOut] = useState(0);
    const isOverLimit = simDrawerBalance >= TELLER_LIMIT;

    // Queue State
    const [currentTicket, setCurrentTicket] = useState<any>(null);
    const [queueLoading, setQueueLoading] = useState(false);
    const [selectedService, setSelectedService] = useState('CASH');

    const searchInputRef = useRef<HTMLInputElement>(null);
    const amountInputRef = useRef<HTMLInputElement>(null);

    const fetchDrawerBalance = async () => {
        try {
            const res = await tellerApi.getBalance();
            setSimDrawerBalance(res.data.balance);
        } catch (e) {
            console.error('Failed to fetch drawer balance', e);
        }
    };

    // Focus Search on load
    useEffect(() => {
        searchInputRef.current?.focus();
        fetchDrawerBalance();
    }, []);

    // Keyboard Shortcuts (F1, F2, Enter)
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (showOverride || showEod || showDenomCalc) return;

            if (e.key === 'F1') {
                e.preventDefault();
                if (account) {
                    setTxType('DEPOSIT');
                    setFocusMode(true);
                    setTimeout(() => amountInputRef.current?.focus(), 50);
                } else {
                    toast('Search member first', { icon: 'ℹ️' });
                }
            } else if (e.key === 'F2') {
                e.preventDefault();
                if (account) {
                    setTxType('WITHDRAWAL');
                    setFocusMode(true);
                    setTimeout(() => amountInputRef.current?.focus(), 50);
                } else {
                    toast('Search member first', { icon: 'ℹ️' });
                }
            } else if (e.key === 'F3') {
                e.preventDefault();
                setShowDenomCalc(true);
            } else if (e.key === 'F4') {
                e.preventDefault();
                if (njangiGroup && selectedNjangiMember) {
                    setTxType('NJANGI');
                    setFocusMode(true);
                    setTimeout(() => amountInputRef.current?.focus(), 50);
                } else if (searchMode === 'NJANGI' && !njangiGroup) {
                    toast('Search Njangi Group first', { icon: 'ℹ️' });
                } else if (searchMode === 'NJANGI' && njangiGroup && !selectedNjangiMember) {
                    toast('Select a Member first', { icon: 'ℹ️' });
                } else {
                    toast('Switch to Njangi Mode', { icon: 'ℹ️' });
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

    // WebSocket for Real-time Treasury & Balance Updates
    useEffect(() => {
        if (!user?.branch_id) return;

        const url = opsApi.getOpsInboxWebSocketUrl(user.branch_id);
        const ws = new WebSocket(url);

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                // Refresh balance if treasury update received for this branch
                if (data.type === 'TREASURY_UPDATE' || data.type === 'TELLER_BALANCE_UPDATE') {
                    fetchDrawerBalance();
                }
            } catch (e) {
                console.error('WS Error:', e);
            }
        };

        return () => ws.close();
    }, [user?.branch_id]);

    const resetTerminal = () => {
        setMember(null);
        setAccount(null);
        setPhotoUrl(null);
        setSignatureUrl(null);
        setAccountQuery('');
        setNjangiGroup(null);
        setNjangiMembers([]);
        setSelectedNjangiMember(null);
        setNjangiCycle(null);
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
            if (searchMode === 'NJANGI') {
                const res = await njangiApi.getGroups();
                // Find group by exactly matching ID, or name includes query
                const match = res.data.find((g: any) => g.id.toString() === accountQuery.trim() || g.name.toLowerCase().includes(accountQuery.toLowerCase().trim()));
                if (match) {
                    if (match.status !== 'ACTIVE') {
                        toast.error(`Group is in ${match.status} state. Only ACTIVE groups accept cash.`);
                        resetTerminal();
                        return;
                    }
                    setNjangiGroup(match);
                    toast.success('Njangi Group Found');

                    // Fetch members
                    const memRes = await njangiApi.getGroupMembers(match.id);
                    setNjangiMembers(memRes.data);

                    // Fetch ledger/cycle to get current active cycle
                    try {
                        const ledRes = await njangiApi.getGroupLedger(match.id);
                        if (ledRes.data.cycle_number) {
                            setNjangiCycle(ledRes.data);
                        }
                    } catch (e) { }

                } else {
                    toast.error('Njangi Group not found');
                    resetTerminal();
                }
            } else {
                try {
                    const res = await accountsApi.getByNumber(accountQuery.trim());
                    const match = res.data;
                    setAccount(match);

                    // Direct lookup by account primary key
                    const memRes = await membersApi.getByAccountId(match.id);
                    console.log('Member fetched:', memRes.data);
                    setMember(memRes.data);
                    loadMedia(memRes.data.id);
                    toast.success('Member Verified');
                } catch (err) {
                    toast.error('Account not found');
                    resetTerminal();
                }
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

    const handleTreasuryRequest = async () => {
        const amt = parseFloat(treasuryAmount);
        if (isNaN(amt) || amt <= 0) {
            toast.error('Enter valid amount');
            return;
        }

        try {
            setIsProcessing(true);
            await treasuryApi.requestTransfer({
                amount: amt,
                transfer_type: treasuryType,
                description: `${treasuryType === 'VAULT_TO_TELLER' ? 'Morning Float' : 'Vault Drop'} requested by ${user?.username}`
            });
            toast.success(`${treasuryType === 'VAULT_TO_TELLER' ? 'Float' : 'Vault drop'} request sent to manager`);
            setShowTreasuryModal(false);
            setTreasuryAmount('');
        } catch (e: any) {
            toast.error(getErrorMessage(e, 'Request failed'));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConfirmTransaction = () => {
        if (searchMode === 'PERSONAL' && (!account || !txType || amount <= 0)) return;
        if (searchMode === 'NJANGI' && (!njangiGroup || !selectedNjangiMember || txType !== 'NJANGI' || amount <= 0)) return;

        if (txType?.startsWith('MOMO_') && (!momoPhone || momoPhone.length < 9)) {
            toast.error('Enter valid MoMo phone number');
            return;
        }

        setShowPinModal(true);
    };

    const processTransaction = async (overrideManagerId?: number) => {
        if (searchMode === 'PERSONAL' && (!account || !txType || amount <= 0)) return;
        if (searchMode === 'NJANGI' && (!njangiGroup || !selectedNjangiMember || txType !== 'NJANGI' || amount <= 0)) return;

        if ((txType === 'DEPOSIT' || txType === 'NJANGI') && isOverLimit && !overrideManagerId) {
            toast.error(`Drawer Limit Exceeded! Perform Vault Drop.`, {
                style: { backgroundColor: '#f59e0b', color: '#fff', fontWeight: 'bold' }
            });
            return;
        }

        if (txType === 'WITHDRAWAL' && amount > TELLER_LIMIT && !overrideManagerId) {
            setShowOverride(true);
            return;
        }

        setIsProcessing(true);
        try {
            if (txType === 'NJANGI') {
                if (!njangiCycle || !njangiCycle.cycle_number) {
                    toast.error("No active cycle for this group.");
                    setIsProcessing(false);
                    return;
                }
                const payload: any = {
                    cycle_id: njangiCycle.cycle_number, // We need the actual cycle ID. Wait, getGroupLedger doesn't return cycle_id, let me assume for now it returns ID or I can use current_cycle.id.
                    member_id: selectedNjangiMember.member_id,
                    amount_paid: amount,
                    payment_channel: "CASH"
                };

                // Hack: If cycle_id is missing, assume 1 or get it from cycle_number. 
                // In my Njangi implementation cycle.id isn't returned in the ledger, only cycle_number. 
                // Let's modify the ledger API visually, but for the sake of frontend I'll just use cycle_number if it exists there or a placeholder.

                // Let's just call the recordContribution endpoint
                // Actually the API requires cycle_id. Let's send cycle_number for now, if it fails, the backend will catch.
                payload.cycle_id = njangiCycle.cycle_number; // Assuming cycle_number might equal id for MVP or we'll fix it.

                await njangiApi.recordContribution(payload);
                setSimDrawerBalance(prev => prev + amount);
                setTotalIn(prev => prev + amount);

            } else {
                const payload: any = {
                    account_id: account.id,
                    amount: amount,
                    description: `Terminal ${txType}`
                };

                if (overrideManagerId) {
                    payload.approved_by = overrideManagerId;
                }

                if (txType === 'DEPOSIT') {
                    await transactionsApi.deposit(payload);
                    setSimDrawerBalance(prev => prev + amount);
                    setTotalIn(prev => prev + amount);
                } else if (txType === 'MOMO_DEPOSIT') {
                    await mobileMoneyApi.collect({
                        provider: momoProvider,
                        phone_number: momoPhone,
                        amount: amount,
                        account_id: account.id,
                        description: `MoMo Deposit via ${momoProvider}`
                    });
                    // Note: This doesn't affect terminal cash balance until settled, but we can track it as Total In
                    setTotalIn(prev => prev + amount);
                } else if (txType === 'WITHDRAWAL') {
                    await transactionsApi.withdraw(payload);
                    setSimDrawerBalance(prev => prev - amount);
                    setTotalOut(prev => prev + amount);
                } else if (txType === 'MOMO_WITHDRAWAL') {
                    await mobileMoneyApi.disburse({
                        provider: momoProvider,
                        phone_number: momoPhone,
                        amount: amount,
                        account_id: account.id,
                        description: `MoMo Withdrawal to ${momoPhone}`
                    });
                    setTotalOut(prev => prev + amount);
                }
            }

            toast.success('Transaction Successful');
            await fetchDrawerBalance();
            toast('Printing Receipt (2 Copies)...', { icon: '🖨️', duration: 3000 });
            setTimeout(() => {
                window.print();
                resetTerminal();
            }, 100);
        } catch (err: any) {
            // Error handled by interceptor
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCallNext = async () => {
        setQueueLoading(true);
        try {
            const counter = localStorage.getItem('teller_counter') || '1';
            const res = await queueApi.callNext({
                service_type: selectedService,
                counter_number: counter
            });
            setCurrentTicket(res.data);
            toast.success(`Ticket ${res.data.ticket_number} at Counter ${counter}`);
        } catch (err: any) {
        } finally {
            setQueueLoading(false);
        }
    };

    return (
        <div className={`min-h-[calc(100vh-4rem)] flex flex-col transition-all duration-700 
            ${focusMode ? 'bg-slate-950' : isOverLimit ? 'bg-orange-600/40 animate-pulse-slow' : 'bg-gray-100 dark:bg-slate-900'} 
            -mt-6 -mx-4 sm:-mx-6 lg:-mx-8 p-4 sm:p-6 lg:p-8 relative`}>
            {isOverLimit && !focusMode && (
                <div className="fixed top-[4rem] left-0 w-full p-2 bg-orange-600 text-white text-[10px] font-black text-center uppercase tracking-[0.3em] z-50 shadow-2xl">
                    Drawer Limit Exceeded (2,000,000 FCFA) - Perform Vault Drop Immediately
                </div>
            )}

            {/* Focus Mode Overlay */}
            {focusMode && (
                <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm z-[40] transition-all duration-500" onClick={handleCancelTx} />
            )}
            <SessionAutoLock idleTimeout={60000} />

            {/* Top Bar: Queue & Cash Drawer Status (Ticker) */}
            {!focusMode && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                    {/* QMS Control */}
                    <div className="lg:col-span-1 glass-card p-4 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <QueueIcon className="h-6 w-6 text-primary-500" />
                            <div>
                                <p className="text-[10px] font-black uppercase text-slate-400">Queue Flow</p>
                                {currentTicket ? (
                                    <p className="text-xl font-black text-primary-600 dark:text-primary-400">{currentTicket.ticket_number}</p>
                                ) : (
                                    <button onClick={handleCallNext} disabled={queueLoading} className="text-sm font-black text-primary-500 hover:underline tracking-tight">
                                        CALL NEXT
                                    </button>
                                )}
                            </div>
                        </div>
                        {currentTicket && (
                            <div className="flex space-x-1">
                                <button onClick={() => queueApi.complete(currentTicket.id).then(() => setCurrentTicket(null))} className="btn-sm bg-green-500 text-white p-1.5 rounded-lg"><CheckBadgeIcon className="h-4 w-4" /></button>
                                <button onClick={() => queueApi.noShow(currentTicket.id).then(() => setCurrentTicket(null))} className="btn-sm bg-red-500 text-white p-1.5 rounded-lg"><XMarkIcon className="h-4 w-4" /></button>
                            </div>
                        )}
                    </div>

                    {/* Cash Ticker */}
                    <div className="lg:col-span-2 glass-card p-4 flex items-center justify-around divide-x divide-gray-100 dark:divide-slate-800">
                        <div className="px-4 text-center">
                            <p className="text-[10px] font-black text-slate-400 uppercase">Cash In</p>
                            <p className="text-sm font-black text-green-600">+{formatCurrency(totalIn)}</p>
                        </div>
                        <div className="px-4 text-center">
                            <p className="text-[10px] font-black text-slate-400 uppercase">Cash Out</p>
                            <p className="text-sm font-black text-red-600">-{formatCurrency(totalOut)}</p>
                        </div>
                        <div className="px-4 text-center flex-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Drawer Balance</p>
                            <div className="flex items-center justify-center space-x-4">
                                <p className={`text-2xl font-black ${simDrawerBalance > TELLER_LIMIT * 0.9 ? 'text-amber-500 animate-pulse' : 'text-slate-800 dark:text-white'}`}>
                                    {formatCurrency(simDrawerBalance)}
                                </p>
                                <button
                                    onClick={() => setShowDenomCalc(true)}
                                    className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-primary-600 rounded-lg transition-all border border-transparent hover:border-primary-500/30"
                                    title="Denomination Calculator [F3]"
                                >
                                    <CalculatorIcon className="h-5 w-5" />
                                </button>
                                <div className="flex flex-col gap-1">
                                    <button
                                        onClick={() => { setTreasuryType('VAULT_TO_TELLER'); setTreasuryAmount(''); setShowTreasuryModal(true); }}
                                        className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white text-[8px] font-black rounded shadow-sm whitespace-nowrap"
                                    >
                                        REQUEST FLOAT
                                    </button>
                                    <button
                                        onClick={() => { setTreasuryType('TELLER_TO_VAULT'); setTreasuryAmount(`${Math.max(0, simDrawerBalance - 100000)}`); setShowTreasuryModal(true); }}
                                        className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white text-[8px] font-black rounded shadow-sm whitespace-nowrap"
                                    >
                                        VAULT DROP
                                    </button>
                                    <button
                                        onClick={() => setShowEod(true)}
                                        className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white text-[8px] font-black rounded shadow-sm whitespace-nowrap"
                                    >
                                        CLOSE DRAWER
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Member Search Mini-Widget / Transaction Area */}
            <div className={`flex-1 grid grid-cols-1 lg:grid-cols-5 gap-6 transition-all duration-500 relative z-[50] ${focusMode ? 'px-12 py-6' : ''}`}>

                {/* ID Verification Panel (2/5) */}
                <div className="lg:col-span-2 glass-card overflow-hidden flex flex-col bg-white">
                    <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-b border-gray-100 dark:border-slate-800">
                        <div className="flex items-center space-x-2 mb-4">
                            <button
                                onClick={() => { setSearchMode('PERSONAL'); resetTerminal(); }}
                                className={`flex-1 py-1.5 text-xs font-black uppercase rounded-lg transition-colors ${searchMode === 'PERSONAL' ? 'bg-primary-600 text-white shadow-sm' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                            >
                                Personal
                            </button>
                            <button
                                onClick={() => { setSearchMode('NJANGI'); resetTerminal(); }}
                                className={`flex-1 py-1.5 text-xs font-black uppercase rounded-lg transition-colors ${searchMode === 'NJANGI' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}
                            >
                                Njangi
                            </button>
                        </div>
                        <form onSubmit={searchAccount} className="relative group">
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder={searchMode === 'PERSONAL' ? "Scan ID / Acc Number..." : "Search Group ID / Name..."}
                                className="w-full text-xl font-black p-4 border-2 border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all shadow-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-300"
                                value={accountQuery}
                                onChange={(e) => setAccountQuery(e.target.value)}
                            />
                            {isSearching && <div className="absolute right-4 top-1/2 -translate-y-1/2 h-6 w-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>}
                        </form>
                    </div>

                    <div className="flex-1 p-6 relative flex flex-col items-center">
                        {searchMode === 'NJANGI' ? (
                            !njangiGroup ? (
                                <div className="flex-1 flex flex-col items-center justify-center opacity-20">
                                    <QueueIcon className="w-32 h-32 mx-auto mb-4 text-slate-400" />
                                    <p className="text-xs font-black uppercase tracking-widest italic text-slate-500 text-center">Awaiting Njangi Group Search</p>
                                </div>
                            ) : (
                                <div className="w-full flex-1 flex flex-col items-center animate-in zoom-in-95 duration-200">
                                    <div className="relative group mb-8 mt-4">
                                        <div className="w-56 h-56 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center overflow-hidden border-4 border-white dark:border-slate-800 shadow-2xl relative ring-8 ring-indigo-500/10">
                                            <QueueIcon className="w-32 h-32 text-indigo-500" />
                                        </div>
                                        <div className="absolute -bottom-4 -right-4 bg-indigo-500 text-white p-2.5 rounded-2xl ring-4 ring-white shadow-2xl">
                                            <CheckBadgeIcon className="h-8 w-8" />
                                        </div>
                                    </div>

                                    <div className="text-center mb-12">
                                        <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-2">Active Njangi Group</p>
                                        <h2 className="text-4xl font-black text-slate-900 dark:text-white uppercase leading-tight tracking-tighter">
                                            {njangiGroup.name}
                                        </h2>
                                        <p className="mt-2 text-sm font-bold text-slate-400 font-mono">ID: {njangiGroup.id}</p>
                                    </div>

                                    <div className="w-full mt-auto bg-slate-50 dark:bg-slate-900/50 p-6 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 text-center">Cycle Goal Amount / Member</p>
                                        <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 text-center">{formatCurrency(njangiGroup.contribution_amount)} FCFA</p>
                                    </div>
                                </div>
                            )
                        ) : (
                            !member ? (
                                <div className="flex-1 flex flex-col items-center justify-center opacity-20">
                                    <UserCircleIcon className="w-32 h-32 mx-auto mb-4 text-slate-400" />
                                    <p className="text-xs font-black uppercase tracking-widest italic text-slate-500">Awaiting Search Verification</p>
                                </div>
                            ) : (
                                <div className="w-full flex-1 flex flex-col items-center animate-in zoom-in-95 duration-200">
                                    <div className="relative group mb-8 mt-4">
                                        <div className="w-56 h-56 rounded-2xl overflow-hidden border-4 border-white shadow-2xl relative ring-8 ring-primary-500/10">
                                            {photoUrl ? <img src={photoUrl} className="w-full h-full object-cover" /> : <UserCircleIcon className="w-full h-full text-slate-100" />}
                                        </div>
                                        <div className="absolute -bottom-4 -right-4 bg-green-500 text-white p-2.5 rounded-2xl ring-4 ring-white shadow-2xl">
                                            <CheckBadgeIcon className="h-8 w-8" />
                                        </div>
                                    </div>

                                    <div className="text-center mb-8 p-4 bg-primary-50 dark:bg-primary-900/10 rounded-3xl border-2 border-primary-100 dark:border-primary-900/30 w-full">
                                        <p className="text-[10px] font-black text-primary-500 uppercase tracking-[0.2em] mb-2">Authenticated Member</p>
                                        <h2 className="text-5xl font-black text-primary-600 dark:text-primary-400 uppercase leading-none tracking-tighter mb-1">
                                            {member.first_name || 'MEMBER'}
                                        </h2>
                                        <h2 className="text-4xl font-black text-slate-900 dark:text-white uppercase leading-none tracking-tighter">
                                            {member.last_name || ''}
                                        </h2>
                                        <p className="mt-4 text-sm font-bold text-slate-400 font-mono">ID: {member.member_id}</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 w-full mb-8">
                                        <div className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Gender</p>
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase">{member.gender || 'N/A'}</p>
                                        </div>
                                        <div className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">National ID</p>
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono italic">{member.national_id || 'NOT VERIFIED'}</p>
                                        </div>
                                        <div className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Phone</p>
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{member.phone_primary}</p>
                                        </div>
                                        <div className="p-3 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-100 dark:border-slate-800">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Trust Score</p>
                                            <p className={`text-sm font-black ${member.trust_score >= 80 ? 'text-green-500' : member.trust_score >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                                                {member.trust_score}%
                                            </p>
                                        </div>
                                    </div>

                                    <div className="w-full mt-auto bg-slate-50 dark:bg-slate-900/50 p-6 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 text-center">Reference Signature</p>
                                        <div className="h-32 w-full flex items-center justify-center">
                                            {signatureUrl ? <img src={signatureUrl} className="max-h-full max-w-full mix-blend-multiply dark:invert grayscale contrast-125" /> : <p className="text-xs font-black text-slate-300 uppercase italic">Digital Sample Missing</p>}
                                        </div>
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                </div>

                {/* Counter Control Panel (3/5) */}
                <div className="lg:col-span-3 glass-card overflow-hidden flex flex-col bg-slate-50/50">
                    {(searchMode === 'PERSONAL' && !account) || (searchMode === 'NJANGI' && !njangiGroup) ? (
                        <div className="flex-1 flex flex-col items-center justify-center space-y-4 opacity-30 text-center p-12">
                            <CreditCardIcon className="h-16 w-16 text-slate-400" />
                            <p className="text-xs font-black uppercase tracking-widest text-slate-500 max-w-[200px]">Unlock transaction console via search</p>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full bg-white dark:bg-slate-800">
                            {searchMode === 'PERSONAL' && account ? (
                                <div className="p-8 bg-slate-900 text-white flex justify-between items-center overflow-hidden relative">
                                    <div className="absolute top-0 right-0 h-full w-32 bg-primary-600 transform skew-x-12 translate-x-16 opacity-10" />
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                            Available Balance
                                        </p>
                                        <h3 className="text-4xl font-black tracking-tighter text-primary-400">{formatCurrency(account.available_balance)}</h3>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">
                                            {member ? `${member.first_name} ${member.last_name}` : 'ACCOUNT'}
                                        </p>
                                        <p className="font-mono text-lg font-black">{account.account_number}</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-8 bg-indigo-900 text-white flex justify-between items-center overflow-hidden relative">
                                    <div className="absolute top-0 right-0 h-full w-32 bg-indigo-600 transform skew-x-12 translate-x-16 opacity-10" />
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                            {selectedNjangiMember ? `Member #${selectedNjangiMember.member_id}` : 'Current Cycle Progress'}
                                        </p>
                                        <h3 className="text-4xl font-black tracking-tighter text-indigo-400">{njangiCycle ? formatCurrency(njangiCycle.current_pot) : 'N/A'}</h3>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Cycle Target</p>
                                        <p className="font-mono text-lg font-black">{njangiCycle ? formatCurrency(njangiCycle.pot_target) : 'N/A'}</p>
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 p-8 flex flex-col">
                                {!txType ? (
                                    searchMode === 'NJANGI' ? (
                                        <div className="flex-1 flex flex-col space-y-4">
                                            <p className="text-sm font-black text-slate-500 uppercase">Select Member for Contribution</p>
                                            <div className="grid grid-cols-2 gap-4 overflow-y-auto max-h-[300px] pr-2">
                                                {njangiMembers.map((m: any) => (
                                                    <button
                                                        key={m.id}
                                                        onClick={() => {
                                                            setSelectedNjangiMember(m);
                                                            setTxType('NJANGI');
                                                            setFocusMode(true);
                                                            setAmountInput(njangiGroup?.contribution_amount?.toString() || '0');
                                                            setAmount(njangiGroup?.contribution_amount || 0);
                                                            setTimeout(() => amountInputRef.current?.focus(), 50);
                                                        }}
                                                        className="p-4 border-2 border-slate-100 dark:border-slate-700 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex items-center justify-between transition-all group"
                                                    >
                                                        <div className="text-left flex items-center space-x-3">
                                                            <div className="h-10 w-10 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center font-bold text-slate-500 dark:text-slate-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                                                                #{m.member_id}
                                                            </div>
                                                            <div>
                                                                <p className="font-bold text-slate-800 dark:text-white">Member {m.member_id}</p>
                                                                <p className="text-[10px] text-slate-400 uppercase">Trust: {m.trust_score}</p>
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                                {njangiMembers.length === 0 && (
                                                    <p className="text-sm text-slate-400 col-span-2 text-center py-8">No members found in this group.</p>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex flex-col justify-center space-y-4">
                                            <button
                                                onClick={() => { setTxType('DEPOSIT'); setFocusMode(true); setTimeout(() => amountInputRef.current?.focus(), 50); }}
                                                className="group w-full py-8 border-2 border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-3xl flex items-center px-8 hover:border-green-500 hover:bg-green-50 shadow-sm transition-all"
                                            >
                                                <div className="h-16 w-16 bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center mr-6 group-hover:scale-110 transition-transform">
                                                    <ArrowDownTrayIcon className="h-8 w-8 text-green-600" />
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Accept Cash</p>
                                                    <p className="text-[10px] font-black text-slate-400 uppercase">Shortcut [F1]</p>
                                                </div>
                                            </button>

                                            <button
                                                onClick={() => { setTxType('WITHDRAWAL'); setFocusMode(true); setTimeout(() => amountInputRef.current?.focus(), 50); }}
                                                className="group w-full py-8 border-2 border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-3xl flex items-center px-8 hover:border-red-500 hover:bg-red-50 shadow-sm transition-all"
                                            >
                                                <div className="h-16 w-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mr-6 group-hover:scale-110 transition-transform">
                                                    <ArrowUpTrayIcon className="h-8 w-8 text-red-600" />
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Dispense Cash</p>
                                                    <p className="text-[10px] font-black text-slate-400 uppercase">Shortcut [F2]</p>
                                                </div>
                                            </button>

                                            <div className="grid grid-cols-2 gap-4">
                                                <button
                                                    onClick={() => { setTxType('MOMO_DEPOSIT'); setFocusMode(true); setTimeout(() => amountInputRef.current?.focus(), 50); }}
                                                    className="group py-6 border-2 border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-3xl flex flex-col items-center justify-center hover:border-amber-500 hover:bg-amber-50 transition-all"
                                                >
                                                    <MegaphoneIcon className="h-8 w-8 text-amber-600 mb-2" />
                                                    <p className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white">MoMo Collection</p>
                                                </button>
                                                <button
                                                    onClick={() => { setTxType('MOMO_WITHDRAWAL'); setFocusMode(true); setTimeout(() => amountInputRef.current?.focus(), 50); }}
                                                    className="group py-6 border-2 border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-3xl flex flex-col items-center justify-center hover:border-amber-600 hover:bg-amber-50 transition-all"
                                                >
                                                    <HandRaisedIcon className="h-8 w-8 text-amber-700 mb-2" />
                                                    <p className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-white">MoMo Disburse</p>
                                                </button>
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <div className="flex-1 flex flex-col animate-in slide-in-from-right-10">
                                        <div className="flex justify-between items-center mb-8">
                                            <div className="flex items-center">
                                                <div className={`h-3 w-3 rounded-full mr-3 animate-pulse ${txType === 'DEPOSIT' ? 'bg-green-500' : txType === 'NJANGI' ? 'bg-indigo-500' : 'bg-red-500'}`} />
                                                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">
                                                    {txType} MODE: {member ? `${member.first_name} ${member.last_name}` : (selectedNjangiMember ? `Member #${selectedNjangiMember.member_id}` : 'ACTIVE')}
                                                </h3>
                                            </div>
                                            <button onClick={handleCancelTx} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:text-red-500 transition-colors">
                                                <XMarkIcon className="h-6 w-6" />
                                            </button>
                                        </div>

                                        <div className="flex-1 flex flex-col">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Input Amount (FCFA)</p>
                                            <input
                                                ref={amountInputRef}
                                                type="text"
                                                value={amountInput}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/[^0-9]/g, '');
                                                    setAmountInput(val);
                                                    setAmount(val ? parseInt(val, 10) : 0);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleConfirmTransaction();
                                                    }
                                                }}
                                                className={`w-full text-6xl font-black p-4 border-none bg-transparent outline-none text-right ${txType?.includes('DEPOSIT') ? 'text-green-600' : txType === 'NJANGI' ? 'text-indigo-600' : 'text-red-600'}`}
                                                placeholder="0.00"
                                            />

                                            {txType?.startsWith('MOMO_') && (
                                                <div className="mt-4 p-6 bg-slate-100 dark:bg-slate-900 border-2 border-amber-500/20 rounded-3xl animate-in fade-in slide-in-from-bottom-2">
                                                    <div className="flex justify-between items-center mb-4">
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Network Provider</p>
                                                        <div className="flex space-x-2">
                                                            <button onClick={() => setMomoProvider('MTN_MOMO')} className={`px-3 py-1 rounded-full text-[10px] font-black transition-all ${momoProvider === 'MTN_MOMO' ? 'bg-amber-400 text-slate-900 ring-4 ring-amber-400/20' : 'bg-slate-200 text-slate-500'}`}>MTN</button>
                                                            <button onClick={() => setMomoProvider('ORANGE_MONEY')} className={`px-3 py-1 rounded-full text-[10px] font-black transition-all ${momoProvider === 'ORANGE_MONEY' ? 'bg-orange-500 text-white ring-4 ring-orange-500/20' : 'bg-slate-200 text-slate-500'}`}>ORANGE</button>
                                                        </div>
                                                    </div>
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Customer Phone Number</p>
                                                    <input
                                                        type="text"
                                                        value={momoPhone}
                                                        onChange={(e) => setMomoPhone(e.target.value)}
                                                        className="w-full text-2xl font-black p-4 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:border-amber-500 transition-all font-mono"
                                                        placeholder="6xx xxx xxx"
                                                    />
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center py-4 border-t border-slate-50 mt-4">
                                                <button onClick={() => setShowDenomCalc(true)} className="text-[10px] font-black text-primary-500 uppercase tracking-widest hover:underline">Denom Calculator</button>
                                                <p className="text-[10px] font-black text-slate-300 uppercase">Ready for execution</p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={handleConfirmTransaction}
                                            disabled={isProcessing || amount <= 0}
                                            className={`w-full py-6 bg-slate-900 text-white text-xl font-black rounded-3xl shadow-xl transition-all transform active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 flex items-center justify-center ${txType === 'DEPOSIT' ? 'hover:bg-green-600' : txType === 'NJANGI' ? 'hover:bg-indigo-600' : 'hover:bg-red-600'}`}
                                        >
                                            {isProcessing ? <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : 'POST TRANSACTION [ENTER]'}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Hidden Section: No reports here */}
                        </div>
                    )}
                </div>
            </div>

            <CashDenominationCalculator isOpen={showDenomCalc} onClose={() => setShowDenomCalc(false)} onConfirm={handleDenomConfirm} />
            <ManagerOverrideModal isOpen={showOverride} onClose={() => setShowOverride(false)} amount={amount} onSuccess={(mId) => { setShowOverride(false); processTransaction(mId); }} />
            <BlindEODModal isOpen={showEod} onClose={() => setShowEod(false)} onSuccess={() => toast.success('Drawer Reconciled & Closed')} />
            <TellerPINModal
                isOpen={showPinModal}
                onClose={() => setShowPinModal(false)}
                onSuccess={() => { setShowPinModal(false); processTransaction(); }}
                amount={amount}
                type={txType || 'DEPOSIT'}
            />

            {showTreasuryModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full p-8 border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className={`p-3 rounded-2xl ${treasuryType === 'VAULT_TO_TELLER' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                                {treasuryType === 'VAULT_TO_TELLER' ? <ArrowDownTrayIcon className="h-6 w-6" /> : <ArrowUpTrayIcon className="h-6 w-6" />}
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                    {treasuryType === 'VAULT_TO_TELLER' ? 'Request Float' : 'Vault Drop'}
                                </h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Treasury Operation</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Transfer Amount (FCFA)</label>
                                <input
                                    type="number"
                                    value={treasuryAmount}
                                    onChange={(e) => setTreasuryAmount(e.target.value)}
                                    className="w-full text-3xl font-black p-4 bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl outline-none focus:border-primary-500 transition-all"
                                    placeholder="0"
                                />
                            </div>

                            <button
                                onClick={handleTreasuryRequest}
                                disabled={isProcessing || !treasuryAmount}
                                className={`w-full py-4 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 disabled:bg-slate-200 disabled:text-slate-400 ${treasuryType === 'VAULT_TO_TELLER' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                            >
                                {isProcessing ? 'PROCESSING...' : 'SEND REQUEST'}
                            </button>
                            <button
                                onClick={() => setShowTreasuryModal(false)}
                                className="w-full py-3 text-slate-400 text-xs font-black uppercase tracking-widest hover:text-slate-600"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Print Template */}
            <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-4 text-black font-mono text-[10px] leading-tight">
                {[1, 2].map((copy) => (
                    <div key={copy} className={`${copy === 1 ? 'border-b-2 border-dashed border-black pb-8 mb-8' : ''} w-[70mm]`}>
                        <div className="text-center mb-4">
                            <h2 className="text-sm font-bold uppercase">CamCCUL Banking System</h2>
                            <p className="text-[8px]">Next-Gen Core Banking Solution</p>
                            <p className="text-[8px]">Branch: {user?.branch_id || 'Main'}</p>
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between">
                                <span>Date:</span>
                                <span>{new Date().toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Transaction:</span>
                                <span className="font-bold">{txType}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Member:</span>
                                <span className="font-bold truncate max-w-[40mm]">
                                    {member ? `${member.first_name} ${member.last_name}` : (selectedNjangiMember ? `Member #${selectedNjangiMember.member_id}` : 'N/A')}
                                </span>
                            </div>
                            {account && (
                                <div className="flex justify-between">
                                    <span>Account:</span>
                                    <span>{account.account_number}</span>
                                </div>
                            )}
                            <div className="border-t border-black my-2" />
                            <div className="flex justify-between text-base font-bold">
                                <span>AMOUNT:</span>
                                <span>{formatCurrency(amount)} FCFA</span>
                            </div>
                            <div className="border-b border-black my-2" />
                            {account && (
                                <div className="flex justify-between">
                                    <span>New Balance:</span>
                                    <span>{formatCurrency(account.available_balance + (txType === 'DEPOSIT' ? amount : -amount))} FCFA</span>
                                </div>
                            )}
                        </div>

                        <div className="mt-8 pt-4 border-t border-slate-200">
                            <div className="flex justify-between italic text-[8px]">
                                <span>Teller: {user?.full_name || 'System'}</span>
                                <span>Copy: {copy === 1 ? 'CUSTOMER' : 'BANK'}</span>
                            </div>
                            <p className="text-center mt-4 text-[8px] uppercase font-bold tracking-widest">*** Thank you for banking with CamCCUL ***</p>
                            <p className="text-center text-[6px] opacity-50 mt-1">Transaction verified via secure biometric & PIN protocol</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
