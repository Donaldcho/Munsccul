import React, { useState, useEffect } from 'react';
import { eodApi } from '../services/api';
import toast from 'react-hot-toast';

interface EODStatus {
    date: string;
    is_closed: boolean;
    can_close: boolean;
    total_debits: number;
    total_credits: number;
    messages: string[];
}

const EODOperations: React.FC = () => {
    const [status, setStatus] = useState<EODStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);

    const fetchStatus = async () => {
        try {
            setLoading(true);
            const response = await eodApi.getStatus();
            setStatus(response.data);
        } catch (error) {
            console.error('Failed to fetch EOD status:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    const handleStartEOD = async () => {
        if (!window.confirm("Are you sure you want to close the current business day? This action is IRREVERSIBLE and will block all new transactions for today.")) {
            return;
        }

        try {
            setRunning(true);
            const response = await eodApi.finalize();
            toast.success(response.data.message);
            fetchStatus(); // Refresh status after successful close
        } catch (error: any) {
            console.error(error);
            // Error handled by global interceptor, but we can catch it to stop spinner
        } finally {
            setRunning(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-CM', { style: 'currency', currency: 'XAF' }).format(amount);
    };

    if (loading) {
        return <div className="p-6 flex justify-center items-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>;
    }

    if (!status) {
        return <div className="p-6 text-red-600">Failed to load EOD Status. Please try again later.</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">End of Day (EOD) Operations</h1>
                <div className="text-sm text-gray-500">
                    Business Date: <span className="font-semibold">{status.date}</span>
                </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-medium text-gray-900">Current Day Status</h2>
                    <span className={`px-3 py-1 text-sm font-semibold rounded-full ${status.is_closed ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                        {status.is_closed ? 'CLOSED (LOCKED)' : 'OPEN (ACTIVE)'}
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-sm font-medium text-gray-500">Total Validated Debits</p>
                        <p className="mt-1 text-xl font-semibold text-gray-900">{formatCurrency(status.total_debits)}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-sm font-medium text-gray-500">Total Validated Credits</p>
                        <p className="mt-1 text-xl font-semibold text-gray-900">{formatCurrency(status.total_credits)}</p>
                    </div>
                </div>

                <div className="mb-6">
                    <h3 className="text-md font-medium text-gray-900 mb-2">System Checks</h3>
                    {status.messages.length > 0 ? (
                        <ul className="list-disc pl-5 space-y-1">
                            {status.messages.map((msg, idx) => (
                                <li key={idx} className={status.is_closed ? "text-gray-600" : "text-red-600 font-medium"}>{msg}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-green-600 font-medium flex items-center">
                            <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            All pre-closure checks passed. System is balanced.
                        </p>
                    )}
                </div>

                <div className="pt-4 border-t border-gray-200 flex justify-end">
                    <button
                        onClick={fetchStatus}
                        disabled={running}
                        className="mr-3 inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        Refresh Status
                    </button>

                    {!status.is_closed && (
                        <button
                            onClick={handleStartEOD}
                            disabled={!status.can_close || running}
                            className={`inline-flex justify-center items-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white 
                ${status.can_close && !running ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-gray-400 cursor-not-allowed'}
                focus:outline-none focus:ring-2 focus:ring-offset-2`}
                        >
                            {running ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    Processing Closure...
                                </>
                            ) : 'Execute End of Day'}
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <p className="text-sm text-yellow-700">
                            <strong>COBAC Compliance Warning:</strong> Executing End of Day (EOD) is a permanent action that freezes the current business date. Any subsequent transactions will be forcibly pushed to the next valid business date. Ensure all tellers have fully reconciled bulk cash drops to the master vault before proceeding.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EODOperations;
