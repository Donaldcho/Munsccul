import { useState, useEffect, useRef } from 'react'
import { MegaphoneIcon, ArrowRightIcon } from '@heroicons/react/24/outline'
import { queueApi } from '../services/api'

interface CalledTicket {
    ticket_number: string
    counter: number
    service: string
}

export default function TVDisplay() {
    const [currentTicket, setCurrentTicket] = useState<CalledTicket | null>(null)
    const [history, setHistory] = useState<CalledTicket[]>([])
    const [waitingQueue, setWaitingQueue] = useState<any[]>([])
    const [connected, setConnected] = useState(false)
    const ws = useRef<WebSocket | null>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)

    const [audioEnabled, setAudioEnabled] = useState(false)

    useEffect(() => {
        if (audioEnabled) {
            connect()
        }
        return () => {
            if (ws.current) ws.current.close()
        }
    }, [audioEnabled])

    const handleEnableAudio = () => {
        setAudioEnabled(true)

        // Unlock Web Audio API
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
            audioContext.resume()
        } catch (e) {
            console.error('Failed to unlock audio context', e)
        }

        // Unlock Speech Synthesis
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance('')
            utterance.volume = 0
            window.speechSynthesis.speak(utterance)
        }
    }

    const connect = () => {
        // Hardcoded branch_id 1 for now as per the UI
        const url = queueApi.getWebSocketUrl() + '/1'
        ws.current = new WebSocket(url)

        ws.current.onopen = () => setConnected(true)
        ws.current.onclose = () => {
            setConnected(false)
            setTimeout(connect, 3000) // Reconnect after 3 seconds
        }

        ws.current.onmessage = (event) => {
            const data = JSON.parse(event.data)

            if (data.type === 'QUEUE_UPDATE') {
                setWaitingQueue(data.waiting)
            } else if (data.type === 'TICKET_CALLED' || data.type === 'TICKET_RECALLED') {
                const newTicket: CalledTicket = {
                    ticket_number: data.ticket_number,
                    counter: data.counter,
                    service: data.service || 'SERVICE'
                }
                setCurrentTicket(newTicket)

                if (data.type === 'TICKET_CALLED') {
                    setHistory(prev => [newTicket, ...prev].slice(0, 5))
                }

                // Play Chime
                playChime()

                // Announce Voice after a short delay
                setTimeout(() => announceTicket(newTicket), 1500)
            }
        }
    }

    const playChime = () => {
        // In a real implementation, we would have a chime.mp3
        // For now, we'll use a browser beep or just log
        console.log('🔔 DING DONG! Ticket Called.')
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
            const oscillator = audioContext.createOscillator()
            const gainNode = audioContext.createGain()

            oscillator.connect(gainNode)
            gainNode.connect(audioContext.destination)

            oscillator.type = 'sine'
            oscillator.frequency.setValueAtTime(440, audioContext.currentTime)
            oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.5)

            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1)

            oscillator.start()
            oscillator.stop(audioContext.currentTime + 1)
        } catch (e) {
            console.error('Audio fail:', e)
        }
    }

    const announceTicket = (ticket: CalledTicket) => {
        if (!window.speechSynthesis) return

        // Cancel any ongoing speech
        window.speechSynthesis.cancel()

        // Spell out ticket number for clarity (e.g., C-0-0-1 instead of C-One)
        const spelledTicket = ticket.ticket_number.split('').join(' ')

        const utterance = new SpeechSynthesisUtterance(
            `Ticket number, ${spelledTicket}, please proceed to counter, ${ticket.counter}`
        )

        // Voice settings
        utterance.rate = 0.85 // Slightly slower for formal tone
        utterance.pitch = 1.0
        utterance.volume = 1.0

        // Prefer local voices if possible
        const voices = window.speechSynthesis.getVoices()
        const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
            voices.find(v => v.lang.startsWith('en')) ||
            voices[0]

        if (preferredVoice) utterance.voice = preferredVoice

        window.speechSynthesis.speak(utterance)
    }

    if (!audioEnabled) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-sans">
                <button
                    onClick={handleEnableAudio}
                    className="p-10 bg-primary-600 rounded-[3rem] shadow-2xl shadow-primary-500/20 hover:bg-primary-500 transition-all flex flex-col items-center group cursor-pointer transform hover:scale-105"
                >
                    <MegaphoneIcon className="h-24 w-24 mb-6 text-white group-hover:animate-bounce" />
                    <h2 className="text-4xl font-black tracking-tight">START TV DISPLAY</h2>
                    <p className="text-primary-200 mt-4 text-lg">Click anywhere on this card to enable Audio & Voice</p>
                </button>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-900 text-white flex overflow-hidden font-sans">
            {/* Sidebar: Recent Tickets */}
            <div className="w-1/4 bg-slate-800 border-r border-slate-700 flex flex-col shrink-0">
                <div className="p-6 bg-primary-900 border-b border-primary-800">
                    <h2 className="text-xl font-black tracking-tight flex items-center">
                        <MegaphoneIcon className="h-6 w-6 mr-3 text-primary-400" />
                        RECENT CALLS
                    </h2>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {history.map((t, i) => (
                        <div key={i} className={`p-4 rounded-xl flex justify-between items-center ${i === 0 ? 'bg-primary-500/20 border-2 border-primary-500/50' : 'bg-slate-700/50'}`}>
                            <div>
                                <span className="text-2xl font-mono font-bold">{t.ticket_number}</span>
                                <p className="text-slate-400 text-[10px] uppercase font-bold mt-0.5">{t.service}</p>
                            </div>
                            <div className="text-right">
                                <span className="text-xs text-slate-400 block">Counter</span>
                                <p className="text-2xl font-bold text-white">{t.counter}</p>
                            </div>
                        </div>
                    ))}
                    {history.length === 0 && (
                        <div className="h-full flex items-center justify-center text-slate-500 italic">
                            Waiting for next ticket...
                        </div>
                    )}
                </div>

                <div className="p-4 bg-slate-900 text-[10px] text-slate-500 flex justify-between uppercase tracking-widest font-bold">
                    <span>Branch ID: 001</span>
                    <span>{connected ? '● LIVE' : '○ RECONNECTING'}</span>
                </div>
            </div>

            {/* Main Content: Currently Serving + Promo */}
            <div className="flex-1 min-w-0 flex flex-col">
                {/* Current Big Call */}
                <div className="h-2/3 flex items-center justify-center p-8 bg-gradient-to-br from-slate-900 to-primary-900 relative overflow-hidden">
                    {currentTicket ? (
                        <div className="text-center animate-pulse-short w-full px-4">
                            <h1 className="text-7xl lg:text-8xl xl:text-9xl font-mono font-black leading-none tracking-tighter text-white drop-shadow-2xl mb-2">
                                {currentTicket.ticket_number}
                            </h1>
                            <div className="flex items-center justify-center space-x-6 mt-2">
                                <ArrowRightIcon className="h-12 w-12 text-primary-400 shrink-0" />
                                <div className="text-left">
                                    <span className="text-xl lg:text-2xl uppercase text-primary-300 font-bold tracking-widest block">Proceed to</span>
                                    <p className="text-5xl lg:text-6xl font-black text-white leading-tight">COUNTER {currentTicket.counter}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center">
                            <img src="/logo.png" alt="MUNSCCUL" className="h-48 mx-auto mb-12 opacity-50 grayscale" />
                            <h2 className="text-6xl font-black text-slate-700">WELCOME TO MUNSCCUL</h2>
                        </div>
                    )}
                </div>

                {/* Waiting Queue / Ticker Area */}
                <div className="flex-1 min-w-0 bg-white text-slate-900 p-6 flex flex-col border-t-8 border-primary-500 overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xl font-black tracking-tight">IN THE QUEUE</h3>
                        <div className="flex items-center text-slate-500 font-bold uppercase tracking-widest text-xs">
                            <span className="mr-2">Waiting:</span>
                            <span className="text-primary-600 bg-primary-100 px-3 py-1 rounded-full">{waitingQueue.length}</span>
                        </div>
                    </div>

                    <div className="flex-1 min-w-0 flex items-center space-x-3 overflow-x-auto no-scrollbar pb-2">
                        {waitingQueue.map((ticket, i) => (
                            <div key={i} className="flex-none bg-slate-50 border border-slate-200 p-3 rounded-xl w-32 text-center">
                                <span className="text-2xl font-mono font-bold text-slate-800">{ticket.ticket_number}</span>
                                <div className="text-[9px] font-bold text-slate-400 uppercase mt-0.5 truncate">
                                    {ticket.service} {ticket.is_vip && <span className="ml-1 text-amber-500">★</span>}
                                </div>
                            </div>
                        ))}
                        {waitingQueue.length === 0 && (
                            <div className="flex-1 flex items-center justify-center text-slate-400 italic">
                                No members currently waiting.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
