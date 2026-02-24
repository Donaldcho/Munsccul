import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useAuthStore } from '../stores/useAuthStore'

import LoginScreen from '../screens/LoginScreen'
import HomeScreen from '../screens/HomeScreen'
import NjangiDashboardScreen from '../screens/NjangiDashboardScreen'
import CreateNjangiScreen from '../screens/CreateNjangiScreen'
import GroupDetailScreen from '../screens/GroupDetailScreen'

const Stack = createNativeStackNavigator()

export default function AppNavigator() {
    const { isAuthenticated } = useAuthStore()

    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {isAuthenticated ? (
                    <Stack.Group>
                        <Stack.Screen name="Home" component={HomeScreen} />
                        <Stack.Screen name="NjangiDashboard" component={NjangiDashboardScreen} />
                        <Stack.Screen name="CreateNjangi" component={CreateNjangiScreen} />
                        <Stack.Screen name="GroupDetail" component={GroupDetailScreen} />
                    </Stack.Group>
                ) : (
                    <Stack.Screen name="Login" component={LoginScreen} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    )
}
