import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Users, PiggyBank, ShieldCheck } from 'lucide-react-native'
import { njangiApi } from '../services/njangiApi'

export default function GroupDetailScreen({ route, navigation }: any) {
    const { groupId } = route.params;
    const [ledger, setLedger] = useState<any>(null)
    const [members, setMembers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const [ledgerRes, membersRes] = await Promise.all([
                    njangiApi.getGroupLedger(groupId),
                    njangiApi.getGroupMembers(groupId)
                ])
                if (ledgerRes.data && !ledgerRes.data.message) {
                    setLedger(ledgerRes.data)
                }
                setMembers(membersRes.data || [])
            } catch (e) {
                console.error("Failed to load group details", e)
            } finally {
                setLoading(false)
            }
        }
        fetchDetails()
    }, [groupId])

    const getMemberDetails = (memberId: number) => {
        return members.find(m => m.member_id === memberId) || null
    }

    const progressPercent = ledger ? Math.min(100, (ledger.current_pot / ledger.pot_target) * 100) : 0;

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            {/* Header */}
            <View className="bg-white px-6 py-4 flex-row items-center shadow-sm shadow-gray-200 z-10">
                <TouchableOpacity onPress={() => navigation.goBack()} className="mr-4 p-2 bg-gray-50 rounded-full">
                    <ArrowLeft size={24} color="#111827" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-gray-900">Group Ledger</Text>
            </View>

            {loading ? (
                <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="large" color="#6366f1" />
                    <Text className="text-gray-500 mt-4 text-xs font-bold uppercase tracking-widest">Syncing Njangi Node...</Text>
                </View>
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} className="flex-1 p-6">
                    {/* Cycle Progress Card */}
                    <View className="bg-indigo-600 rounded-3xl p-6 shadow-xl shadow-indigo-200 mb-8 overflow-hidden">
                        <View className="absolute -right-8 -top-8 bg-indigo-500 w-32 h-32 rounded-full opacity-50" />
                        <Text className="text-white/80 text-xs font-bold uppercase tracking-widest mb-2">Cycle #{ledger?.cycle_number || '-'}</Text>
                        <Text className="text-white text-3xl font-bold mb-6">
                            {ledger?.current_pot ? ledger.current_pot.toLocaleString() : '0'} <Text className="text-xl">XAF</Text>
                        </Text>

                        {/* Progress Bar */}
                        <View className="mb-4">
                            <View className="flex-row justify-between mb-2">
                                <Text className="text-white text-[10px] uppercase font-bold tracking-wider">Pot Progress</Text>
                                <Text className="text-white text-[10px] font-bold">{progressPercent.toFixed(0)}%</Text>
                            </View>
                            <View className="h-2 bg-indigo-900/40 rounded-full overflow-hidden">
                                <View
                                    className="h-full bg-green-400 rounded-full"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </View>
                        </View>

                        <View className="flex-row items-center border-t border-indigo-500/50 pt-4 mt-2">
                            <View className="flex-1">
                                <Text className="text-indigo-200 text-[10px] uppercase font-bold tracking-wider mb-1">Target</Text>
                                <Text className="text-white font-bold">{ledger?.pot_target ? ledger.pot_target.toLocaleString() : '-'} XAF</Text>
                            </View>
                            <View className="flex-1 border-l border-indigo-500/50 pl-4">
                                <Text className="text-indigo-200 text-[10px] uppercase font-bold tracking-wider mb-1">Due Date</Text>
                                <Text className="text-white font-bold">{ledger?.due_date ? new Date(ledger.due_date).toLocaleDateString() : '-'}</Text>
                            </View>
                        </View>
                    </View>

                    <Text className="text-lg font-bold text-gray-900 mb-4">Cycle Contributions</Text>

                    {/* Contributions List */}
                    <View className="bg-white rounded-3xl p-4 shadow-sm shadow-gray-200 mb-8">
                        {ledger?.contributions && ledger.contributions.length > 0 ? (
                            ledger.contributions.map((c: any, index: number) => {
                                const member = getMemberDetails(c.member_id)
                                return (
                                    <View key={c.id || index} className={`flex-row items-center py-4 ${index !== ledger.contributions.length - 1 ? 'border-b border-gray-100' : ''}`}>
                                        <View className="h-12 w-12 bg-indigo-50 rounded-2xl items-center justify-center mr-4">
                                            <PiggyBank size={24} color="#6366f1" />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="font-bold text-gray-900">Member {c.member_id}</Text>
                                            <Text className="text-gray-500 text-xs mt-1">{c.payment_channel}</Text>
                                        </View>
                                        <View className="items-end">
                                            <Text className="text-green-600 font-bold">+{c.amount_paid.toLocaleString()} XAF</Text>
                                            <View className="bg-green-100 px-2 py-0.5 rounded flex-row flex items-center mt-1">
                                                <ShieldCheck size={10} color="#16a34a" className="mr-1" />
                                                <Text className="text-green-700 text-[10px] font-bold">{c.status}</Text>
                                            </View>
                                        </View>
                                    </View>
                                )
                            })
                        ) : (
                            <View className="py-8 items-center justify-center">
                                <Text className="text-gray-400 text-sm">No contributions recorded for this cycle yet.</Text>
                            </View>
                        )}
                    </View>

                    <Text className="text-lg font-bold text-gray-900 mb-4">Member Directory</Text>
                    <View className="flex-row flex-wrap justify-between">
                        {members.map((m: any, index: number) => (
                            <View key={m.id || index} className="w-[48%] bg-white p-4 rounded-3xl mb-4 shadow-sm shadow-gray-200 items-center text-center">
                                <View className="h-12 w-12 bg-gray-50 rounded-full items-center justify-center mb-3">
                                    <Users size={20} color="#9ca3af" />
                                </View>
                                <Text className="font-bold text-gray-900">Member {m.member_id}</Text>
                                <Text className="text-indigo-600 text-xs font-bold mt-1 tracking-widest">TS: {m.trust_score}</Text>
                            </View>
                        ))}
                    </View>
                    <View className="h-20" />
                </ScrollView>
            )}
        </SafeAreaView>
    )
}
