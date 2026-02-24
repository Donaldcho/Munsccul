import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Sparkles, ShieldCheck, CreditCard, ChevronLeft, ArrowUpRight, Clock, Users, X, Phone, MessageSquare } from 'lucide-react-native'
import { formatCurrency } from '../utils/formatters' // Need to copy this formatter or implement it

export default function NjangiDashboardScreen({ navigation }: any) {
    const [loading, setLoading] = useState(false)
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [paymentAmount, setPaymentAmount] = useState('10000') // Default progressive amount
    const [paymentMethod, setPaymentMethod] = useState('momo') // momo or om
    const [isPaying, setIsPaying] = useState(false)

    // Mock data for initial preview
    const ledger = {
        name: "Sandaga Market Women",
        cycle_number: 4,
        pot_target: 500000,
        current_pot: 350000,
        due_date: "2026-03-15"
    }

    const readiness = {
        score: 85,
        status: "Loan Ready"
    }

    if (loading) {
        return (
            <View className="flex-1 items-center justify-center bg-white">
                <ActivityIndicator size="large" color="#6366f1" />
            </View>
        )
    }

    return (
        <SafeAreaView className="flex-1 bg-white">
            <View className="flex-row items-center p-6 border-b border-gray-50">
                <TouchableOpacity onPress={() => navigation.goBack()} className="p-2 -ml-2">
                    <ChevronLeft size={24} color="#1e293b" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-gray-900 ml-2">Njangi Workspace</Text>
            </View>

            <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24 }}>
                {/* Pot Progress Card */}
                <View className="bg-white rounded-3xl p-6 shadow-xl shadow-gray-200 border border-indigo-50 mb-8">
                    <View className="flex-row justify-between items-center mb-6">
                        <View>
                            <Text className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-1">Current Pot</Text>
                            <Text className="text-3xl font-bold text-gray-900">350,000 XAF</Text>
                        </View>
                        <View className="p-3 bg-indigo-50 rounded-2xl">
                            <Clock size={24} color="#6366f1" />
                        </View>
                    </View>

                    <View className="w-full h-3 bg-gray-100 rounded-full mb-4">
                        <View className="h-3 bg-indigo-600 rounded-full" style={{ width: '70%' }} />
                    </View>

                    <View className="flex-row justify-between items-center">
                        <Text className="text-[10px] font-bold text-gray-400">Target: 500,000 XAF</Text>
                        <Text className="text-[10px] font-bold text-indigo-600">70% Collected</Text>
                    </View>
                </View>

                {/* Credit Readiness Bridge */}
                <View className="bg-indigo-600 rounded-3xl p-6 mb-8">
                    <View className="flex-row items-center mb-4">
                        <ShieldCheck size={20} color="#bfdbfe" />
                        <Text className="text-white font-bold ml-2">Credit Union Bridge</Text>
                    </View>
                    <Text className="text-white/80 text-xs mb-6">Your on-time payments are building your formal credit score.</Text>

                    <View className="bg-white/10 p-4 rounded-2xl mb-6">
                        <View className="flex-row justify-between items-center mb-2">
                            <Text className="text-white text-xs font-bold">Loan Readiness</Text>
                            <Text className="text-white font-bold">85%</Text>
                        </View>
                        <View className="w-full h-2 bg-white/20 rounded-full">
                            <View className="h-2 bg-white rounded-full" style={{ width: '85%' }} />
                        </View>
                        <Text className="text-white/60 text-[10px] mt-2 font-bold uppercase tracking-widest">Status: Ready for Micro-Loan</Text>
                    </View>

                    <TouchableOpacity className="bg-white w-full py-4 rounded-2xl items-center">
                        <Text className="text-indigo-600 font-bold text-sm">Apply for Credit Union Loan</Text>
                    </TouchableOpacity>
                </View>

                {/* AI Insights */}
                <Text className="text-lg font-bold text-gray-900 mb-4 flex-row items-center">
                    AI Group Insights ✨
                </Text>
                <View className="space-y-4 mb-8">
                    <View className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex-row">
                        <View className="w-2 h-2 rounded-full bg-green-500 mt-1.5 mr-3" />
                        <Text className="flex-1 text-xs text-gray-600 leading-relaxed">
                            Excellent liquidity this month! All members are trending towards on-time payments.
                        </Text>
                    </View>
                    <View className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex-row">
                        <View className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 mr-3" />
                        <Text className="flex-1 text-xs text-gray-600 leading-relaxed">
                            Moma Alice is 2 days late. Secretarial follow-up recommended to protect streak.
                        </Text>
                    </View>
                </View>

                {/* Transparent Member Ledger */}
                <View className="mb-8">
                    <Text className="text-lg font-bold text-gray-900 mb-4 px-1">Member Ledger</Text>
                    <View className="bg-white rounded-3xl p-2 border border-gray-100 shadow-sm shadow-gray-100">
                        {/* Member 1: Fully Paid */}
                        <View className="flex-row items-center justify-between p-4 border-b border-gray-50">
                            <View className="flex-row items-center">
                                <View className="w-10 h-10 bg-indigo-100 rounded-full items-center justify-center mr-3">
                                    <Text className="text-indigo-600 font-bold">MC</Text>
                                </View>
                                <View>
                                    <Text className="font-bold text-gray-900">Mama Celine</Text>
                                    <Text className="text-xs text-gray-500">50,000 / 50,000 XAF</Text>
                                </View>
                            </View>
                            <View className="bg-green-100 px-3 py-1.5 rounded-full flex-row items-center">
                                <Text className="text-green-700 font-bold text-xs mr-1">Paid</Text>
                                <View className="w-2 h-2 rounded-full bg-green-500" />
                            </View>
                        </View>

                        {/* Member 2: Progressive */}
                        <View className="flex-row items-center justify-between p-4 border-b border-gray-50">
                            <View className="flex-row items-center">
                                <View className="w-10 h-10 bg-amber-50 rounded-full items-center justify-center mr-3">
                                    <Text className="text-amber-600 font-bold">ST</Text>
                                </View>
                                <View>
                                    <Text className="font-bold text-gray-900">Samuel T.</Text>
                                    <View className="w-24 h-1.5 bg-amber-100 rounded-full mt-1.5">
                                        <View className="h-1.5 bg-amber-500 rounded-full" style={{ width: '60%' }} />
                                    </View>
                                </View>
                            </View>
                            <View className="items-end">
                                <Text className="font-bold text-gray-900">30,000 XAF</Text>
                                <Text className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Progressive</Text>
                            </View>
                        </View>

                        {/* Member 3: Late */}
                        <View className="flex-row items-center justify-between p-4">
                            <View className="flex-row items-center">
                                <View className="w-10 h-10 bg-rose-50 rounded-full items-center justify-center mr-3">
                                    <Text className="text-rose-600 font-bold">JA</Text>
                                </View>
                                <View>
                                    <Text className="font-bold text-gray-900">Joseph A.</Text>
                                    <Text className="text-xs text-gray-500">0 / 50,000 XAF</Text>
                                </View>
                            </View>
                            <View className="bg-rose-100 px-3 py-1.5 rounded-full flex-row items-center">
                                <Text className="text-rose-700 font-bold text-xs mr-1">Late</Text>
                                <View className="w-2 h-2 rounded-full bg-rose-500" />
                            </View>
                        </View>
                    </View>
                </View>

                {/* Action Button */}
                <TouchableOpacity
                    onPress={() => setShowPaymentModal(true)}
                    className="bg-indigo-600 w-full py-5 rounded-2xl flex-row items-center justify-center shadow-lg shadow-indigo-200"
                >
                    <CreditCard size={20} color="white" className="mr-2" />
                    <Text className="text-white font-bold text-base ml-2">Record Payment</Text>
                </TouchableOpacity>

                <View className="h-12" />
            </ScrollView>

            {/* Progressive Contribution Modal */}
            {showPaymentModal && (
                <View className="absolute inset-0 z-50 justify-end">
                    <TouchableOpacity
                        className="absolute inset-0 bg-black/60"
                        activeOpacity={1}
                        onPress={() => setShowPaymentModal(false)}
                    />
                    <View className="bg-white rounded-t-3xl p-6 pb-12 w-full shadow-2xl">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-xl font-bold text-gray-900">Digital Contribution</Text>
                            <TouchableOpacity onPress={() => setShowPaymentModal(false)} className="bg-gray-100 p-2 rounded-full">
                                <X size={20} color="#64748b" />
                            </TouchableOpacity>
                        </View>

                        <Text className="text-gray-500 text-sm mb-4">You can pay your full dues or make a progressive micro-contribution towards your 50,000 XAF goal.</Text>

                        {/* Amount Selection */}
                        <View className="flex-row space-x-3 mb-6">
                            <TouchableOpacity
                                onPress={() => setPaymentAmount('10000')}
                                className={`flex-1 p-4 rounded-xl border ${paymentAmount === '10000' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 bg-white'} items-center`}
                            >
                                <Text className={`font-bold ${paymentAmount === '10000' ? 'text-indigo-600' : 'text-gray-900'}`}>10k XAF</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setPaymentAmount('25000')}
                                className={`flex-1 p-4 rounded-xl border ${paymentAmount === '25000' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 bg-white'} items-center`}
                            >
                                <Text className={`font-bold ${paymentAmount === '25000' ? 'text-indigo-600' : 'text-gray-900'}`}>25k XAF</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setPaymentAmount('50000')}
                                className={`flex-1 p-4 rounded-xl border ${paymentAmount === '50000' ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 bg-white'} items-center`}
                            >
                                <Text className={`font-bold ${paymentAmount === '50000' ? 'text-indigo-600' : 'text-gray-900'}`}>Full (50k)</Text>
                            </TouchableOpacity>
                        </View>

                        <Text className="text-gray-900 font-bold mb-3">Select Provider</Text>

                        {/* Provider Selection */}
                        <View className="flex-row space-x-3 mb-8">
                            <TouchableOpacity
                                onPress={() => setPaymentMethod('momo')}
                                className={`flex-1 p-4 rounded-xl border flex-row items-center justify-center space-x-2 ${paymentMethod === 'momo' ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200 bg-white'}`}
                            >
                                <Phone size={18} color={paymentMethod === 'momo' ? '#eab308' : '#94a3b8'} />
                                <Text className={`font-bold ${paymentMethod === 'momo' ? 'text-yellow-700' : 'text-gray-900'}`}>MTN MoMo</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setPaymentMethod('om')}
                                className={`flex-1 p-4 rounded-xl border flex-row items-center justify-center space-x-2 ${paymentMethod === 'om' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-white'}`}
                            >
                                <MessageSquare size={18} color={paymentMethod === 'om' ? '#f97316' : '#94a3b8'} />
                                <Text className={`font-bold ${paymentMethod === 'om' ? 'text-orange-700' : 'text-gray-900'}`}>Orange Money</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            onPress={() => {
                                setIsPaying(true)
                                setTimeout(() => {
                                    setIsPaying(false)
                                    setShowPaymentModal(false)
                                    // Normally we would trigger USSD or Deep link here
                                }, 1500)
                            }}
                            disabled={isPaying}
                            className={`w-full py-5 rounded-2xl items-center justify-center shadow-lg ${paymentMethod === 'momo' ? 'bg-yellow-400 shadow-yellow-200' : 'bg-orange-500 shadow-orange-200'}`}
                        >
                            {isPaying ? (
                                <ActivityIndicator color={paymentMethod === 'momo' ? 'black' : 'white'} />
                            ) : (
                                <Text className={`font-bold text-lg ${paymentMethod === 'momo' ? 'text-black' : 'text-white'}`}>
                                    Pay {paymentAmount} XAF now
                                </Text>
                            )}
                        </TouchableOpacity>

                        <Text className="text-center text-xs text-gray-400 mt-4 opacity-80">
                            Secured by MUNSCCUL Escrow
                        </Text>
                    </View>
                </View>
            )}
        </SafeAreaView>
    )
}
