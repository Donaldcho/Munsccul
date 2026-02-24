import { api } from './api'

export const njangiApi = {
    // Get member's njangi status including active groups and trust score
    getMemberStatus: (memberId: number | string) =>
        api.get(`/njangi/status/member/${memberId}`),

    // Apply to join a njangi group
    joinGroup: (groupId: number, payload: any) =>
        api.post(`/njangi/groups/${groupId}/members`, payload),

    // Get group ledger/details
    getGroupLedger: (groupId: number) =>
        api.get(`/njangi/ledger/${groupId}`),

    // Get group members
    getGroupMembers: (groupId: number) =>
        api.get(`/njangi/groups/${groupId}/members`)
}
