import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ShieldCheck, Users, Banknote, Calendar, CheckCircle, ArrowLeft } from 'lucide-react-native'
import { useAuthStore } from '../stores/useAuthStore'
import { api } from '../services/api'

export default function CreateNjangiScreen({ navigation }: any) {
    const { user } = useAuthStore()
    const [isLoading, setIsLoading] = useState(false)
    const [name, setName] = useState('')
    const [amount, setAmount] = useState('')
    const [frequency, setFrequency] = useState('MONTHLY')

    // Signatories
    const [secName, setSecName] = useState('')
    const [secPhone, setSecPhone] = useState('')
    const [tresName, setTresName] = useState('')
    const [tresPhone, setTresPhone] = useState('')

    const handleCreate = async () => {
        if (!name || !amount || !secName || !secPhone || !tresName || !tresPhone) {
            Alert.alert("Missing Fields", "Please fill in all details, including all signatory information for strict KYC compliance.")
            return
        }

        setIsLoading(true)
        try {
            const signatories = JSON.stringify({
                president: { name: user?.full_name || 'Admin', phone: "Logged Auth User" },
                secretary: { name: secName, phone: secPhone },
                treasurer: { name: tresName, phone: tresPhone }
            })

            const payload = {
                name,
                description: "Smart Njangi powered by MUNSCCUL",
                contribution_amount: parseFloat(amount),
                cycle_frequency: frequency,
                president_id: 1, // Fallback to 1 for demo
                executive_signatories: signatories
            }

            await api.post('/njangi/groups', payload)

            Alert.alert(
                "Group Created (DRAFT)",
                "Your group data has been saved. For AML compliance, a Credit Officer must verify your physical documents before funds can be collected.",
                [{ text: "Understood", onPress: () => navigation.goBack() }]
            )

        } catch (error: any) {
            Alert.alert("Error", error.response?.data?.detail || error.message || "Failed to create group")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <ArrowLeft color="#1E293B" size={24} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Create New Njangi</Text>
                    <View style={styles.headerRight} />
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

                    {/* Compliance Banner */}
                    <View style={styles.complianceBanner}>
                        <ShieldCheck color="#059669" size={24} />
                        <View style={{ marginLeft: 12, flex: 1 }}>
                            <Text style={styles.complianceTitle}>KYC & AML Compliant</Text>
                            <Text style={styles.complianceText}>This group will be placed in Escrow until verified by a Credit Officer.</Text>
                        </View>
                    </View>

                    {/* Group Details */}
                    <Text style={styles.sectionTitle}>Group Basics</Text>
                    <View style={styles.card}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Njangi Name</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Sandaga Market Women Syndicate"
                                value={name}
                                onChangeText={setName}
                                placeholderTextColor="#94A3B8"
                            />
                        </View>

                        <View style={styles.row}>
                            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                                <Text style={styles.label}>Contribution Amount (FCFA)</Text>
                                <View style={styles.inputWrapper}>
                                    <Banknote color="#64748B" size={20} style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.inputWithIcon}
                                        placeholder="50000"
                                        keyboardType="numeric"
                                        value={amount}
                                        onChangeText={setAmount}
                                        placeholderTextColor="#94A3B8"
                                    />
                                </View>
                            </View>
                            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                                <Text style={styles.label}>Cycle Frequency</Text>
                                <View style={styles.inputWrapper}>
                                    <Calendar color="#64748B" size={20} style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.inputWithIcon}
                                        value={frequency}
                                        editable={false}
                                    />
                                </View>
                            </View>
                        </View>
                        <View style={styles.frequencyTabs}>
                            {['WEEKLY', 'BI_WEEKLY', 'MONTHLY'].map(freq => (
                                <TouchableOpacity
                                    key={freq}
                                    onPress={() => setFrequency(freq)}
                                    style={[styles.freqTab, frequency === freq && styles.freqTabActive]}
                                >
                                    <Text style={[styles.freqTabText, frequency === freq && styles.freqTabTextActive]}>
                                        {freq.replace('_', ' ')}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Signatories */}
                    <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Executive Signatories (OHADA)</Text>

                    <View style={styles.card}>
                        <View style={styles.signatoryHeader}>
                            <CheckCircle color="#10B981" size={16} />
                            <Text style={styles.signatoryTitle}>President (Initiator)</Text>
                        </View>
                        <Text style={styles.signatoryValue}>{user?.full_name || 'Admin User'}</Text>
                        <Text style={styles.signatorySubValue}>Authorized Mobile App Account</Text>

                        <View style={styles.divider} />

                        <View style={styles.signatoryHeader}>
                            <Users color="#6366F1" size={16} />
                            <Text style={styles.signatoryTitle}>Secretary</Text>
                        </View>
                        <TextInput
                            style={styles.inputSmall}
                            placeholder="Full Legal Name"
                            value={secName}
                            onChangeText={setSecName}
                            placeholderTextColor="#94A3B8"
                        />
                        <TextInput
                            style={[styles.inputSmall, { marginTop: 8 }]}
                            placeholder="Phone Number (SMS Invite)"
                            keyboardType="phone-pad"
                            value={secPhone}
                            onChangeText={setSecPhone}
                            placeholderTextColor="#94A3B8"
                        />

                        <View style={styles.divider} />

                        <View style={styles.signatoryHeader}>
                            <Users color="#6366F1" size={16} />
                            <Text style={styles.signatoryTitle}>Treasurer</Text>
                        </View>
                        <TextInput
                            style={styles.inputSmall}
                            placeholder="Full Legal Name"
                            value={tresName}
                            onChangeText={setTresName}
                            placeholderTextColor="#94A3B8"
                        />
                        <TextInput
                            style={[styles.inputSmall, { marginTop: 8 }]}
                            placeholder="Phone Number (SMS Invite)"
                            keyboardType="phone-pad"
                            value={tresPhone}
                            onChangeText={setTresPhone}
                            placeholderTextColor="#94A3B8"
                        />
                    </View>

                    {/* Submit Button */}
                    <TouchableOpacity
                        style={styles.submitButton}
                        onPress={handleCreate}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={styles.submitButtonText}>Submit for KYC Verification</Text>
                        )}
                    </TouchableOpacity>

                    <Text style={styles.footerNote}>
                        By submitting, you agree to the MUNSCCUL Escrow policies.
                    </Text>
                    <View style={{ height: 40 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    headerTitle: {
        flex: 1,
        fontSize: 18,
        fontWeight: '700',
        color: '#1E293B',
        textAlign: 'center',
    },
    headerRight: {
        width: 40,
    },
    scrollContent: {
        padding: 20,
    },
    complianceBanner: {
        flexDirection: 'row',
        backgroundColor: '#ECFDF5',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#A7F3D0',
        marginBottom: 24,
        alignItems: 'flex-start',
    },
    complianceTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#065F46',
        marginBottom: 4,
    },
    complianceText: {
        fontSize: 13,
        color: '#047857',
        lineHeight: 18,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#475569',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    inputGroup: {
        marginBottom: 16,
    },
    label: {
        fontSize: 13,
        fontWeight: '500',
        color: '#64748B',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 8,
        paddingHorizontal: 16,
        height: 48,
        fontSize: 15,
        color: '#1E293B',
    },
    inputSmall: {
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 8,
        paddingHorizontal: 12,
        height: 44,
        fontSize: 14,
        color: '#1E293B',
    },
    row: {
        flexDirection: 'row',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 8,
        height: 48,
    },
    inputIcon: {
        marginLeft: 12,
    },
    inputWithIcon: {
        flex: 1,
        paddingHorizontal: 12,
        fontSize: 15,
        color: '#1E293B',
    },
    frequencyTabs: {
        flexDirection: 'row',
        backgroundColor: '#F1F5F9',
        borderRadius: 8,
        padding: 4,
        marginTop: 8,
    },
    freqTab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 6,
    },
    freqTabActive: {
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    freqTabText: {
        fontSize: 12,
        fontWeight: '500',
        color: '#64748B',
    },
    freqTabTextActive: {
        color: '#1E293B',
        fontWeight: '600',
    },
    signatoryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    signatoryTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1E293B',
        marginLeft: 8,
    },
    signatoryValue: {
        fontSize: 15,
        fontWeight: '500',
        color: '#0F172A',
        marginLeft: 24,
    },
    signatorySubValue: {
        fontSize: 13,
        color: '#64748B',
        marginLeft: 24,
        marginTop: 2,
    },
    divider: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginVertical: 16,
    },
    submitButton: {
        backgroundColor: '#4F46E5',
        height: 56,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 32,
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    footerNote: {
        textAlign: 'center',
        fontSize: 12,
        color: '#94A3B8',
        marginTop: 16,
    }
})
