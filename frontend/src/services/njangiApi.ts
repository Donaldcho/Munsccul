import { api } from './api'

export const njangiApi = {
    getGroups: () => api.get('/njangi/groups'),
    getGroupLedger: (groupId: number) => api.get(`/njangi/ledger/${groupId}`),
    recordContribution: (data: any) => api.post('/njangi/contributions', data),
    disbursePayout: (cycleId: number) => api.post(`/njangi/disburse/${cycleId}`),
    getMemberStatus: (member_id: number) => api.get(`/njangi/status/member/${member_id}`),
    getReadiness: (member_id: number) => api.get(`/njangi/readiness/${member_id}`),
    getGroupInsights: (groupId: number) => api.get(`/njangi/insights/${groupId}`),
    addMember: (groupId: number, data: any) => api.post(`/njangi/groups/${groupId}/members`, data),
    getGroupMembers: (groupId: number) => api.get(`/njangi/groups/${groupId}/members`),
    startCycle: (groupId: number, data: any) => api.post(`/njangi/groups/${groupId}/cycles`, data),
    uploadKycDocuments: (groupId: number, data: any) => api.post(`/njangi/groups/${groupId}/kyc-upload`, data),
    approveKyc: (groupId: number, data: any) => api.post(`/njangi/groups/${groupId}/kyc-approve`, data),
}
