import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LogOut, Home as HomeIcon, Wallet, Settings, Bell, ShieldCheck, Users } from 'lucide-react-native'
import { useAuthStore } from '../stores/useAuthStore'
import { njangiApi } from '../services/njangiApi'

export default function HomeScreen({ navigation }: any) {
    const { user, logout } = useAuthStore()
    const [njangiStatus, setNjangiStatus] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchStatus = async () => {
            if (user?.id) {
                try {
                    const res = await njangiApi.getMemberStatus(user.id)
                    setNjangiStatus(res.data)
                } catch (e) {
                    console.error("Failed to fetch njangi status", e)
                } finally {
                    setLoading(false)
                }
            } else {
                setLoading(false)
            }
        }
        fetchStatus()
    }, [user])

    const activeGroups = njangiStatus?.memberships?.length || 0;
    const trustScore = njangiStatus?.aggregate_trust_score?.toFixed(1) || '0.0';

    return (
        <SafeAreaView className="flex-1 bg-white">
            <View className="flex-1 p-6">
                <View className="flex-row justify-between items-center mb-8">
                    <View>
                        <Text className="text-gray-500 text-xs font-bold uppercase tracking-widest">Welcome,</Text>
                        <Text className="text-2xl font-bold text-gray-900">{user?.full_name || 'Member'}</Text>
                    </View>
                    <TouchableOpacity
                        onPress={logout}
                        className="p-3 bg-rose-50 rounded-2xl"
                    >
                        <LogOut size={20} color="#e11d48" />
                    </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                    {/* Hero Card */}
                    <View className="bg-indigo-600 rounded-3xl p-6 shadow-xl shadow-indigo-200 mb-8">
                        <Text className="text-white/80 text-xs font-bold uppercase tracking-widest mb-2">Total Savings</Text>
                        <Text className="text-white text-3xl font-bold mb-6">450,000 XAF</Text>

                        <View className="flex-row justify-between items-center text-white">
                            <View className="bg-white/20 px-3 py-1 rounded-lg">
                                <Text className="text-white text-[10px] font-bold">Active Groups: {activeGroups}</Text>
                            </View>
                            <TouchableOpacity className="bg-white px-4 py-2 rounded-xl">
                                <Text className="text-indigo-600 font-bold text-xs">View Ledger</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Quick Stats */}
                    <View className="flex-row space-x-4 mb-8">
                        <View className="flex-1 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                            <Text className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-2">Trust Score</Text>
                            <Text className="text-indigo-600 text-2xl font-bold">{trustScore}</Text>
                        </View>
                        <View className="flex-1 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                            <Text className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-2">Punctuality</Text>
                            <Text className="text-green-600 text-2xl font-bold">95%</Text>
                        </View>
                    </View>

                    <Text className="text-lg font-bold text-gray-900 mb-4">Njangi Hub</Text>

                    {/* Create New Group Button */}
                    <TouchableOpacity
                        onPress={() => navigation.navigate('CreateNjangi')}
                        className="bg-indigo-600 rounded-2xl p-4 mb-6 flex-row items-center justify-center shadow-lg shadow-indigo-200"
                    >
                        <ShieldCheck color="#FFFFFF" size={20} className="mr-2" />
                        <Text className="text-white font-bold text-base ml-2">Create New Njangi Group</Text>
                    </TouchableOpacity>

                    <Text className="text-lg font-bold text-gray-900 mb-4">My Njangi Groups</Text>

                    {loading ? (
                        <ActivityIndicator size="large" color="#6366f1" className="mb-8" />
                    ) : njangiStatus?.memberships?.length > 0 ? (
                        njangiStatus.memberships.map((m: any, i: number) => (
                            <TouchableOpacity
                                key={m.id || i}
                                onPress={() => navigation.navigate('GroupDetail', { groupId: m.group.id })}
                                className="bg-white border border-gray-100 rounded-2xl p-4 mb-4 flex-row items-center shadow-sm shadow-gray-200"
                            >
                                <View className="w-12 h-12 bg-indigo-100 rounded-xl items-center justify-center mr-4">
                                    <Users size={24} color="#6366f1" />
                                </View>
                                <View className="flex-1">
                                    <Text className="font-bold text-gray-900">{m.group?.name || 'Unknown Group'}</Text>
                                    <Text className="text-gray-500 text-xs mt-1">Status: {m.group?.status}</Text>
                                </View>
                                <View className="items-end">
                                    <Text className="text-indigo-600 font-bold">{m.group?.contribution_amount || 0} XAF</Text>
                                    <Text className="text-gray-400 text-[10px] uppercase mt-1">{m.group?.cycle_frequency}</Text>
                                </View>
                            </TouchableOpacity>
                        ))
                    ) : (
                        <View className="bg-gray-50 p-6 rounded-2xl items-center mb-6">
                            <Text className="text-gray-500 text-center text-sm">You haven't joined any groups yet.</Text>
                        </View>
                    )}
                </ScrollView>
            </View>
        </SafeAreaView>
    )
}
