import { useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';

export interface VoiceSignal {
    type: 'VOICE_SIGNAL';
    sender_id: number;
    receiver_id?: number;
    signal: {
        type: 'offer' | 'answer' | 'candidate' | 'hangup';
        sdp?: string;
        candidate?: RTCIceCandidateInit;
    };
}

export const useVoiceCall = (currentUserId: number, sendSignal: (signal: any) => void) => {
    const [isCalling, setIsCalling] = useState(false);
    const [isRinging, setIsRinging] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [remoteUser, setRemoteUser] = useState<any>(null);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

    const pc = useRef<RTCPeerConnection | null>(null);
    const remoteUserIdRef = useRef<number | null>(null);
    const pendingOffer = useRef<string | null>(null);
    const iceBuffer = useRef<RTCIceCandidateInit[]>([]);

    const cleanup = useCallback(() => {
        if (pc.current) {
            pc.current.close();
            pc.current = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        setLocalStream(null);
        setRemoteStream(null);
        setIsCalling(false);
        setIsRinging(false);
        setIsConnected(false);
        setRemoteUser(null);
        remoteUserIdRef.current = null;
        pendingOffer.current = null;
        iceBuffer.current = [];
    }, [localStream]);

    const drainIceBuffer = useCallback(async () => {
        if (!pc.current || !pc.current.remoteDescription) return;
        while (iceBuffer.current.length > 0) {
            const candidate = iceBuffer.current.shift();
            if (candidate) {
                try {
                    await pc.current.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.error('Error adding buffered ice candidate', e);
                }
            }
        }
    }, []);

    const createPeerConnection = useCallback((targetUserId: number) => {
        const config: RTCConfiguration = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        };
        const newPc = new RTCPeerConnection(config);

        newPc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal({
                    type: 'VOICE_SIGNAL',
                    receiver_id: targetUserId,
                    signal: { type: 'candidate', candidate: event.candidate.toJSON() }
                });
            }
        };

        newPc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                setRemoteStream(event.streams[0]);
                setIsConnected(true);
            }
        };

        newPc.onconnectionstatechange = () => {
            if (newPc.connectionState === 'disconnected' || newPc.connectionState === 'failed' || newPc.connectionState === 'closed') {
                cleanup();
            }
        };

        pc.current = newPc;
        return newPc;
    }, [sendSignal, cleanup]);

    const startCall = async (targetUser: any) => {
        try {
            setRemoteUser(targetUser);
            remoteUserIdRef.current = targetUser.id;
            setIsCalling(true);

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setLocalStream(stream);

            const newPc = createPeerConnection(targetUser.id);
            stream.getTracks().forEach(track => newPc.addTrack(track, stream));

            const offer = await newPc.createOffer();
            await newPc.setLocalDescription(offer);

            sendSignal({
                type: 'VOICE_SIGNAL',
                receiver_id: targetUser.id,
                signal: { type: 'offer', sdp: offer.sdp }
            });
        } catch (err) {
            console.error('Failed to start call', err);
            toast.error('Could not access microphone');
            cleanup();
        }
    };

    const handleSignal = async (incoming: VoiceSignal) => {
        const { sender_id, signal } = incoming;

        if (signal.type === 'offer') {
            remoteUserIdRef.current = sender_id;
            pendingOffer.current = signal.sdp || null;
            setIsRinging(true);
            setRemoteUser({ id: sender_id, full_name: 'Staff Member' });
        } else if (signal.type === 'answer' && pc.current) {
            await pc.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
            await drainIceBuffer();
        } else if (signal.type === 'candidate') {
            if (pc.current && pc.current.remoteDescription) {
                try {
                    await pc.current.addIceCandidate(new RTCIceCandidate(signal.candidate!));
                } catch (e) {
                    console.error('Error adding ice candidate', e);
                }
            } else {
                iceBuffer.current.push(signal.candidate!);
            }
        } else if (signal.type === 'hangup') {
            cleanup();
        }
    };

    const acceptCall = async () => {
        if (!remoteUserIdRef.current || !pendingOffer.current) return;
        try {
            setIsRinging(false);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setLocalStream(stream);

            const newPc = createPeerConnection(remoteUserIdRef.current);
            stream.getTracks().forEach(track => newPc.addTrack(track, stream));

            await newPc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: pendingOffer.current }));
            await drainIceBuffer();

            const answer = await newPc.createAnswer();
            await newPc.setLocalDescription(answer);

            sendSignal({
                type: 'VOICE_SIGNAL',
                receiver_id: remoteUserIdRef.current,
                signal: { type: 'answer', sdp: answer.sdp }
            });
            setIsConnected(true);
        } catch (err) {
            console.error('Failed to accept call', err);
            toast.error('Could not connect call');
            cleanup();
        }
    };

    const endCall = () => {
        if (remoteUserIdRef.current) {
            sendSignal({
                type: 'VOICE_SIGNAL',
                receiver_id: remoteUserIdRef.current,
                signal: { type: 'hangup' }
            });
        }
        cleanup();
    };

    return {
        isCalling,
        isRinging,
        isConnected,
        remoteUser,
        localStream,
        remoteStream,
        startCall,
        acceptCall,
        endCall,
        handleSignal
    };
};
