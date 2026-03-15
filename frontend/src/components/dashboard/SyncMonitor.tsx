import React, { useEffect, useState } from 'react';
import { 
  ArrowPathIcon, 
  CloudArrowUpIcon, 
  ExclamationTriangleIcon,
  WifiIcon
} from '@heroicons/react/24/outline';

interface SyncStat {
  branch_id: number;
  pending_count: number;
}

interface SyncPayload {
  type: string;
  timestamp: number;
  data: SyncStat[];
}

const SyncMonitor: React.FC = () => {
  const [stats, setStats] = useState<SyncStat[]>([]);
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');

  useEffect(() => {
    // Determine WS protocol based on page location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/v1/admin/monitor/ws/sync-status`;

    let ws: WebSocket;

    const connect = () => {
      setStatus('connecting');
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('Sync Monitor Connected');
        setStatus('connected');
      };

      ws.onmessage = (event) => {
        try {
          const payload: SyncPayload = JSON.parse(event.data);
          if (payload.type === 'SYNC_UPDATE') {
            setStats(payload.data);
          }
        } catch (err) {
          console.error('Failed to parse sync message:', err);
        }
      };

      ws.onclose = () => {
        console.log('Sync Monitor Disconnected');
        setStatus('disconnected');
        // Attempt to reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('Sync Monitor Error:', err);
        ws.close();
      };
    };

    connect();

    return () => {
      if (ws) ws.close();
    };
  }, []);

  const getStatusColor = (count: number) => {
    if (count === 0) return 'text-green-600 bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800';
    if (count < 20) return 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800';
    return 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800';
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowPathIcon className={`w-5 h-5 ${status === 'connected' ? 'text-primary-600 animate-spin' : 'text-slate-400'}`} />
          <h3 className="font-semibold text-slate-800 dark:text-white">Branch Sync Monitor</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500' : status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`} />
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tighter">{status}</span>
        </div>
      </div>
      
      <div className="p-4">
        {stats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <WifiIcon className="w-12 h-12 mb-2 opacity-20" />
            <p className="text-sm italic">No branches currently syncing.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {stats.map((stat) => (
              <div 
                key={stat.branch_id}
                className={`p-3 rounded-lg border flex items-center justify-between ${getStatusColor(stat.pending_count)} transition-all duration-500`}
              >
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Branch {stat.branch_id}</p>
                  <p className="text-2xl font-black">{stat.pending_count} <span className="text-xs font-medium opacity-70">PENDING</span></p>
                </div>
                {stat.pending_count > 0 ? (
                  stat.pending_count > 20 ? <ExclamationTriangleIcon className="w-8 h-8 opacity-80" /> : <CloudArrowUpIcon className="w-8 h-8 opacity-80" />
                ) : (
                  <WifiIcon className="w-8 h-8 opacity-20" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[10px] text-slate-400 font-bold">
        <span>POLL_INTERVAL: 5.0S</span>
        <span className="uppercase tracking-widest">Distributed Ledger Sentinel</span>
      </div>
    </div>
  );
};

export default SyncMonitor;
