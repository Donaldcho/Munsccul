import React, { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '../stores/useAuthStore'

export default function LoginScreen() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const { login, isLoading, error } = useAuthStore()

    const handleLogin = async () => {
        try {
            await login(username.trim(), password)
        } catch (e) {
            // Error is handled in the store
        }
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={{ padding: 24 }}>
                    <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 48 }}>
                        {/* Header Section */}
                        <View style={{ alignItems: 'center', marginBottom: 48 }}>
                            <View style={{ width: 80, height: 80, backgroundColor: '#4f46e5', borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: 'white', fontSize: 32 }}>💰</Text>
                            </View>
                            <Text style={{ fontSize: 30, fontWeight: 'bold', color: '#111827', marginTop: 24 }}>Smart Njangi</Text>
                            <Text style={{ color: '#6b7280', marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>
                                Secure banking for the modern Credit Union member.
                            </Text>
                        </View>

                        {/* Login Card */}
                        <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 32, borderWidth: 1, borderColor: '#f1f5f9' }}>
                            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 24 }}>Welcome back</Text>

                            {error && (
                                <View style={{ backgroundColor: '#fff1f2', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#ffe4e6' }}>
                                    <Text style={{ color: '#e11d48', fontSize: 12, fontWeight: '500' }}>{error}</Text>
                                </View>
                            )}

                            {/* Form Fields */}
                            <View style={{ marginBottom: 16 }}>
                                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#6b7280', marginBottom: 8, marginLeft: 4 }}>Username</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#f1f5f9' }}>
                                    <TextInput
                                        style={{ flex: 1, color: '#111827', fontWeight: '500' }}
                                        placeholder="Enter your username"
                                        value={username}
                                        onChangeText={setUsername}
                                        autoCapitalize="none"
                                    />
                                </View>
                            </View>

                            <View style={{ marginBottom: 32 }}>
                                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#6b7280', marginBottom: 8, marginLeft: 4 }}>Secret PIN</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#f1f5f9' }}>
                                    <TextInput
                                        style={{ flex: 1, color: '#111827', fontWeight: '500' }}
                                        placeholder="Enter your PIN"
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry={!showPassword}
                                    />
                                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                        <Text style={{ color: '#94a3b8', fontSize: 12 }}>{showPassword ? 'Hide' : 'Show'}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Login Button */}
                            <TouchableOpacity
                                onPress={handleLogin}
                                disabled={isLoading}
                                style={{ width: '100%', height: 56, backgroundColor: '#4f46e5', borderRadius: 16, alignItems: 'center', justifyContent: 'center', opacity: isLoading ? 0.7 : 1 }}
                            >
                                {isLoading ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>Authorize Entry</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    )
}
