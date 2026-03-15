import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

// Smart Njangi uses the same backend as the main app
const NJANGI_API_URL = import.meta.env.VITE_API_URL || '/api/v1'

const njangiAxios = axios.create({
    baseURL: NJANGI_API_URL,
    headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
    },
    timeout: 30000,
})

// Share the same auth token as the main app
njangiAxios.interceptors.request.use((config) => {
    const token = useAuthStore.getState().token
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

export const njangiApi = {
    getGroups: () => njangiAxios.get('/njangi/groups'),
    getGroupLedger: (groupId: number) => njangiAxios.get(`/njangi/ledger/${groupId}`),
    recordContribution: (data: any) => njangiAxios.post('/njangi/contributions', data),
    disbursePayout: (cycleId: number) => njangiAxios.post(`/njangi/disburse/${cycleId}`),
    getMemberStatus: (member_id: number) => njangiAxios.get(`/njangi/status/member/${member_id}`),
    getReadiness: (member_id: number) => njangiAxios.get(`/njangi/readiness/${member_id}`),
    getGroupInsights: (groupId: number) => njangiAxios.get(`/njangi/insights/${groupId}`),
    addMember: (groupId: number, data: any) => njangiAxios.post(`/njangi/groups/${groupId}/members`, data),
    getGroupMembers: (groupId: number) => njangiAxios.get(`/njangi/groups/${groupId}/members`),
    startCycle: (groupId: number, data: any) => njangiAxios.post(`/njangi/groups/${groupId}/cycles`, data),
    uploadKycDocuments: (groupId: number, data: any) => njangiAxios.post(`/njangi/groups/${groupId}/kyc-upload`, data),
    approveKyc: (groupId: number, data: any) => njangiAxios.post(`/njangi/groups/${groupId}/kyc-approve`, data),
}
