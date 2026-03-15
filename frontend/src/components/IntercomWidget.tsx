import { useState, useEffect, useRef } from 'react'
import { ChatBubbleLeftRightIcon, XMarkIcon, PaperAirplaneIcon, MegaphoneIcon, LinkIcon, VideoCameraIcon, PhoneIcon, PhoneXMarkIcon } from '@heroicons/react/24/outline'
import { intercomApi, usersApi } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import { useVoiceCall, VoiceSignal } from '../hooks/useVoiceCall'
import toast from 'react-hot-toast'

interface IntercomMessage {
    id: number
    sender_id: number
    receiver_id: number | null
    content: string
    attached_entity_type: string | null
    attached_entity_id: string | null
    timestamp: string
    read_status: boolean
    is_echo?: boolean
}

const AudioDing = () => {
    try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        const oscillator = audioCtx.createOscillator()
        const gainNode = audioCtx.createGain()
        oscillator.connect(gainNode)
        gainNode.connect(audioCtx.destination)
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime)
        oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5)
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1)
        oscillator.start()
        oscillator.stop(audioCtx.currentTime + 1)
    } catch (e) { }
}

export default function IntercomWidget() {
    const { user } = useAuthStore()
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState<IntercomMessage[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [allUsers, setAllUsers] = useState<any[]>([])
    const [selectedUser, setSelectedUser] = useState<any | null>(null)
    const [messageDraft, setMessageDraft] = useState('')

    const ws = useRef<WebSocket | null>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const audioRef = useRef<HTMLAudioElement>(null)

    const {
        isCalling, isRinging, isConnected, remoteUser: callUser, remoteStream,
        startCall, acceptCall, endCall, handleSignal
    } = useVoiceCall(user!.id, (payload) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(payload))
        }
    })

    useEffect(() => {
        if (user) {
            setupWebSocket()
            fetchHistory()
            fetchUsers()
        }
        return () => {
            if (ws.current) {
                // To avoid "closed before established" error in console during StrictMode double-mounting
                if (ws.current.readyState === WebSocket.OPEN) {
                    ws.current.close()
                }
                ws.current = null
            }
        }
    }, [user])

    useEffect(() => {
        if (isOpen) {
            setUnreadCount(0)
            scrollToBottom()
        }
    }, [isOpen, messages])

    useEffect(() => {
        if (isRinging) {
            setIsOpen(true)
        }
    }, [isRinging])

    useEffect(() => {
        if (audioRef.current && remoteStream) {
            audioRef.current.srcObject = remoteStream
        }
    }, [remoteStream])

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    const fetchUsers = async () => {
        try {
            const response = await usersApi.getAll()
            setAllUsers(response.data.filter((u: any) => u.id !== user?.id && u.is_active))
        } catch (error) {
            console.error('Failed to fetch users', error)
        }
    }

    const fetchHistory = async () => {
        if (!user) return
        try {
            const response = await intercomApi.getHistory(user.id)
            setMessages(response.data || [])
        } catch (error) {
            console.error('Failed to load intercom history', error)
        }
    }

    const setupWebSocket = () => {
        if (!user) return

        const url = intercomApi.getWebSocketUrl(user.id)
        ws.current = new WebSocket(url)

        ws.current.onmessage = (event) => {
            const data = JSON.parse(event.data)

            // Handle Voice Signaling specifically
            if (data.type === 'VOICE_SIGNAL') {
                handleSignal(data as VoiceSignal)
                return
            }

            const newMsg: IntercomMessage = data

            setMessages(prev => {
                // Deduplicate echoes
                if (prev.some(m => m.id === newMsg.id)) return prev
                return [...prev, newMsg]
            })

            if (!isOpen && !newMsg.is_echo) {
                setUnreadCount(c => c + 1)
                AudioDing()
            }
        }

        ws.current.onclose = () => {
            setTimeout(setupWebSocket, 5000)
        }
    }

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!messageDraft.trim() || !user) return

        try {
            const payload = {
                content: messageDraft,
                receiver_id: selectedUser ? selectedUser.id : null,
                // Context attached via global intercept or specific hooks later
            }
            await intercomApi.send(payload)
            setMessageDraft('')
            if (!selectedUser) toast.success('Broadcast sent to branch')
        } catch (error) {
            toast.error('Failed to send message')
        }
    }

    if (!user) return null

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
            {/* Hidden Audio Player for Voice Calls */}
            <audio ref={audioRef} autoPlay className="hidden" />

            {/* The Chat Panel */}
            <div
                className={`transition-all duration-300 ease-in-out transform origin-bottom-right pointer-events-auto
                    ${isOpen ? 'scale-100 opacity-100 mb-4' : 'scale-0 opacity-0 h-0 hidden'}
                `}
            >
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex overflow-hidden w-[450px] sm:w-[500px] h-[500px]">

                    {/* Left Pane: Staff Directory */}
                    <div className="w-1/3 bg-slate-50 dark:bg-slate-800/50 border-r border-slate-200 dark:border-slate-800 flex flex-col">
                        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                            <h3 className="text-xs font-black tracking-widest uppercase text-slate-500">Directory</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto w-full">
                            <button
                                onClick={() => setSelectedUser(null)}
                                className={`w-full text-left p-3 flex items-center gap-2 border-b border-slate-200 dark:border-slate-700/50 transition-colors
                                    ${!selectedUser ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-white dark:hover:bg-slate-800'}
                                `}
                            >
                                <div className="h-8 w-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                                    <MegaphoneIcon className="h-4 w-4" />
                                </div>
                                <div className="overflow-hidden">
                                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">Branch Broadcast</p>
                                    <p className="text-[10px] text-slate-500 uppercase">Alert Everyone</p>
                                </div>
                            </button>

                            {allUsers.map(u => (
                                <button
                                    key={u.id}
                                    onClick={() => setSelectedUser(u)}
                                    className={`w-full text-left p-3 flex items-center gap-2 border-b border-slate-200 dark:border-slate-700/50 transition-colors
                                        ${selectedUser?.id === u.id ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-2 border-l-indigo-500' : 'hover:bg-white dark:hover:bg-slate-800'}
                                    `}
                                >
                                    <div className="relative shrink-0">
                                        <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center uppercase font-bold text-slate-600 dark:text-slate-300">
                                            {u.full_name.charAt(0)}
                                        </div>
                                        {/* Assumption: Green dot means online. In a real impl, we'd track WS connects. For UI demonstration: */}
                                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white dark:ring-slate-900"></span>
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{u.full_name}</p>
                                        <p className="text-[10px] text-slate-500 uppercase truncate">{u.role.replace('_', ' ')}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Right Pane: Chat Window */}
                    <div className="w-2/3 flex flex-col bg-white dark:bg-slate-900">
                        {/* Header */}
                        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center">
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                                    {selectedUser ? selectedUser.full_name : 'Branch Broadcast'}
                                </h3>
                                <p className="text-xs text-slate-500">
                                    {selectedUser ? selectedUser.role.replace('_', ' ') : 'Visible to all active staff'}
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                {selectedUser && !isCalling && !isConnected && (
                                    <button
                                        onClick={() => startCall(selectedUser)}
                                        className="p-1 px-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-xs font-bold transition-colors"
                                        title="Start Secure Voice Call"
                                    >
                                        <PhoneIcon className="h-4 w-4" />
                                        Call
                                    </button>
                                )}
                                <button onClick={() => setIsOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
                                    <XMarkIcon className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        {/* Voice Call Signaling Overlay */}
                        {(isCalling || isRinging || isConnected) && (
                            <div className="relative z-20 pointer-events-auto">
                                <div className="absolute inset-x-0 top-0 m-3 bg-indigo-600 text-white rounded-2xl shadow-xl p-4 flex flex-col items-center gap-3 animate-in slide-in-from-top duration-300">
                                    <div className="flex flex-col items-center">
                                        <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center mb-1 animate-pulse">
                                            <PhoneIcon className="h-5 w-5" />
                                        </div>
                                        <p className="text-sm font-bold">{callUser?.full_name || 'Staff Member'}</p>
                                        <p className="text-[10px] uppercase tracking-wider opacity-80">
                                            {isRinging ? 'Incoming Secure Call' : isCalling ? 'Connecting...' : 'Secure Connection Active'}
                                        </p>
                                    </div>
                                    <div className="flex gap-4">
                                        {isRinging ? (
                                            <>
                                                <button
                                                    onClick={acceptCall}
                                                    className="h-10 w-10 bg-green-500 rounded-full flex items-center justify-center hover:bg-green-600 transition-colors shadow-lg"
                                                    title="Accept"
                                                >
                                                    <PhoneIcon className="h-5 w-5" />
                                                </button>
                                                <button
                                                    onClick={endCall}
                                                    className="h-10 w-10 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                                                    title="Decline"
                                                >
                                                    <PhoneXMarkIcon className="h-5 w-5" />
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={endCall}
                                                className="px-4 py-2 bg-red-500 rounded-full flex items-center gap-2 hover:bg-red-600 transition-colors text-xs font-bold shadow-lg"
                                            >
                                                <PhoneXMarkIcon className="h-4 w-4" />
                                                End Call
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Messages Area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/50">
                            {/* Filter messages to only show conversation with selected user, or broadcasts */}
                            {messages.filter(m =>
                                (!selectedUser && !m.receiver_id) || // Broadcasts
                                (selectedUser && (
                                    (m.sender_id === user.id && m.receiver_id === selectedUser.id) ||
                                    (m.sender_id === selectedUser.id && m.receiver_id === user.id)
                                ))
                            ).map((msg, i) => {
                                const isMe = msg.sender_id === user.id
                                const senderName = isMe ? 'Me' : allUsers.find(u => u.id === msg.sender_id)?.full_name || 'System'
                                return (
                                    <div key={msg.id || i} className={`w-full flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${isMe ? 'bg-indigo-600 text-white rounded-tr-sm' :
                                            !msg.receiver_id ? 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-tl-sm text-slate-800 dark:text-slate-200' :
                                                'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-sm'
                                            }`}>
                                            {!isMe && <p className="text-[10px] font-bold opacity-50 mb-1">{senderName}</p>}
                                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

                                            {msg.attached_entity_id && (
                                                <button className="mt-2 bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 text-xs px-2 py-1 rounded-md flex items-center gap-1 transition-colors">
                                                    <LinkIcon className="h-3 w-3" />
                                                    {msg.attached_entity_type}: {msg.attached_entity_id}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                            <form onSubmit={handleSendMessage} className="flex gap-2">
                                <input
                                    type="text"
                                    value={messageDraft}
                                    onChange={e => setMessageDraft(e.target.value)}
                                    placeholder={selectedUser ? "Type a secure message..." : "Type broadcast message..."}
                                    className="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 focus:ring-2 focus:ring-indigo-500 text-sm py-2 text-slate-900 dark:text-white placeholder-slate-400"
                                />
                                <button
                                    type="submit"
                                    disabled={!messageDraft.trim() || (!selectedUser && !['OPS_MANAGER', 'OPS_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role))}
                                    className="h-9 w-9 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center shrink-0 transition-colors"
                                    title={!selectedUser && !['OPS_MANAGER', 'OPS_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role) ? 'Only Managers can Broadcast' : 'Send'}
                                >
                                    <PaperAirplaneIcon className="h-4 w-4" />
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            {/* The Floating Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`pointer-events-auto h-14 w-14 rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95
                    ${isOpen ? 'bg-slate-800 dark:bg-slate-700 text-white' : 'bg-primary-600 text-white hover:bg-primary-500'}
                `}
            >
                {isOpen ? <XMarkIcon className="h-6 w-6" /> : (
                    <div className="relative">
                        <ChatBubbleLeftRightIcon className="h-6 w-6" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-primary-600 animate-pulse">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </div>
                )}
            </button>
        </div>
    )
}
