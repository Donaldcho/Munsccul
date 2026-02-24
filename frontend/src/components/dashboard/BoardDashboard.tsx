import { useState } from 'react'
import BoardPortalLayout from './board/BoardPortalLayout'
import ExecutiveOverview from './board/ExecutiveOverview'
import CreditCommittee from './board/CreditCommittee'
import BoardReports from './board/BoardReports'
import BoardAuditLogs from './board/BoardAuditLogs'
import PolicyManagement from './board/PolicyManagement'

export default function BoardDashboard() {
    const [activeTab, setActiveTab] = useState<'overview' | 'committee' | 'reports' | 'audit' | 'policy'>('overview')

    return (
        <BoardPortalLayout activeTab={activeTab} setActiveTab={setActiveTab}>
            {activeTab === 'overview' && <ExecutiveOverview />}
            {activeTab === 'committee' && <CreditCommittee />}
            {activeTab === 'reports' && <BoardReports />}
            {activeTab === 'audit' && <BoardAuditLogs />}
            {activeTab === 'policy' && <PolicyManagement />}
        </BoardPortalLayout>
    )
}
