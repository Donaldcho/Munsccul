import React, { useState, useEffect, useRef } from 'react';
import { LockClosedIcon, FingerPrintIcon } from '@heroicons/react/24/outline';
import { api } from '../../services/api';
import toast from 'react-hot-toast';

interface Props {
    idleTimeout?: number; // In milliseconds, default 60s
}

export const SessionAutoLock: React.FC<Props> = ({ idleTimeout = 1800000 }) => {
    const [isLocked, setIsLocked] = useState(false);
    const [pin, setPin] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const lockSession = () => {
        setIsLocked(true);
        setPin('');
    };

    const resetTimer = () => {
        if (isLocked) return;
        if (lockTimer.current) clearTimeout(lockTimer.current);
        lockTimer.current = setTimeout(lockSession, idleTimeout);
    };

    useEffect(() => {
        // Set up global listeners for activity
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        events.forEach(event => document.addEventListener(event, resetTimer));

        resetTimer(); // Initialize timer

        return () => {
            events.forEach(event => document.removeEventListener(event, resetTimer));
            if (lockTimer.current) clearTimeout(lockTimer.current);
        };
    }, [isLocked, idleTimeout]);

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pin || pin.length < 4) return;

        setIsVerifying(true);
        try {
            const response = await api.post('/teller/verify-pin', { pin });
            if (response.data.status === 'UNLOCKED') {
                setIsLocked(false);
                setPin('');
                resetTimer();
                toast.success('Session Unlocked');
            }
        } catch (error) {
            toast.error('Invalid PIN');
            setPin('');
        } finally {
            setIsVerifying(false);
        }
    };

    if (!isLocked) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Blurred background overlay */}
            <div className="absolute inset-0 bg-white/40 backdrop-blur-md"></div>

            <div className="relative z-10 bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full border border-gray-100 text-center transform transition-all">
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <LockClosedIcon className="w-10 h-10 text-blue-600" />
                </div>

                <h2 className="text-2xl font-bold text-gray-900 mb-2">Session Locked</h2>
                <p className="text-gray-500 mb-8">For your security, your session was locked due to inactivity. Enter your PIN to resume.</p>

                <form onSubmit={handleUnlock}>
                    <div className="relative mb-6">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <FingerPrintIcon className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="password"
                            autoFocus
                            className="pl-10 block w-full outline-none border-b-2 border-gray-300 focus:border-blue-600 bg-gray-50 px-3 py-4 text-center text-2xl tracking-widest text-gray-900 transition-colors rounded-t-md"
                            placeholder="••••"
                            value={pin}
                            maxLength={8}
                            onChange={(e) => setPin(e.target.value)}
                            disabled={isVerifying}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isVerifying || pin.length < 4}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {isVerifying ? 'Verifying...' : 'Unlock Terminal'}
                    </button>
                </form>
            </div>
        </div>
    );
};
