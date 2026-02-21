import React, { useState } from 'react';
import { XMarkIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { api } from '../../services/api';
import toast from 'react-hot-toast';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (managerId: number, managerName: string) => void;
    amount: number;
}

export const ManagerOverrideModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, amount }) => {
    const [pin, setPin] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);

    if (!isOpen) return null;

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pin || pin.length < 4) return;

        setIsVerifying(true);
        try {
            const response = await api.post('/teller/manager-override', {
                manager_pin: pin,
                amount: amount
            });

            if (response.data.status === 'APPROVED') {
                toast.success(`Override Approved by ${response.data.manager_name}`);
                onSuccess(response.data.authorized_by, response.data.manager_name);
                setPin('');
                onClose();
            }
        } catch (error) {
            toast.error('Invalid Manager PIN or Unauthorized');
            setPin('');
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gray-900/75 backdrop-blur-sm" onClick={onClose}></div>

            <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                <div className="bg-orange-50 border-b border-orange-100 p-6 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                        <ShieldCheckIcon className="w-8 h-8 text-orange-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">Manager Authorization Required</h2>
                    <p className="text-orange-800 mt-2 font-medium">
                        This transaction of {amount.toLocaleString()} FCFA exceeds your current drawer limit.
                    </p>
                </div>

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <XMarkIcon className="w-6 h-6" />
                </button>

                <div className="p-6">
                    <form onSubmit={handleVerify} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
                                A Manager must enter their Secure PIN to authorize
                            </label>
                            <input
                                type="password"
                                required
                                autoFocus
                                className="w-full text-center text-3xl tracking-[1em] py-4 border-2 border-gray-300 rounded-lg focus:ring-4 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-mono"
                                placeholder="****"
                                maxLength={8}
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                disabled={isVerifying}
                            />
                        </div>

                        <div className="flex space-x-3">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isVerifying}
                                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 transition-colors"
                            >
                                Cancel Override
                            </button>
                            <button
                                type="submit"
                                disabled={isVerifying || pin.length < 4}
                                className="flex-1 px-4 py-3 border border-transparent text-white font-medium rounded-lg bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 shadow-lg shadow-orange-600/30 transition-all"
                            >
                                {isVerifying ? 'Verifying...' : 'Authorize Transaction'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
