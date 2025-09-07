import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import {
    Phone,
    PhoneOff,
    Mic,
    MicOff,
    Volume2,
    VolumeX
} from 'lucide-react';
import {
    acceptIncomingCall,
    rejectIncomingCall,
    receiveIncomingCall,
    endCall,
    setLocalStream,
    setRemoteStream,
    setPeerConnection,
    callConnected,
    startOutgoingCall,
    resetCallState
} from '@/redux/callSlice';
import { toast } from 'sonner';

const CallModal = () => {
    const dispatch = useDispatch();
    const { socket } = useSelector(store => store.socketio);
    const { user } = useSelector(store => store.auth);
    const {
        isCallActive,
        isIncomingCall,
        isOutgoingCall,
        remoteUser,
        callerInfo,
        localStream,
        remoteStream,
        peerConnection,
        callStatus,
        callType
    } = useSelector(store => store.call);

    const [isMuted, setIsMuted] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(true);
    const [callDuration, setCallDuration] = useState(0);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isCallEnding, setIsCallEnding] = useState(false); // Flag to prevent double cleanup

    const localAudioRef = useRef(null);
    const remoteAudioRef = useRef(null);
    const callTimerRef = useRef(null);
    const pcRef = useRef(null);
    const localStreamRef = useRef(null);

    // WebRTC Configuration
    const rtcConfiguration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };

    // Create peer connection
    const createPeerConnection = () => {
        console.log('🔧 Creating peer connection...');
        const pc = new RTCPeerConnection(rtcConfiguration);
        pcRef.current = pc;
        dispatch(setPeerConnection(pc));

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate && socket) {
                console.log('🧊 Sending ICE candidate');
                const targetId = isOutgoingCall ? remoteUser?._id : callerInfo?.from;
                socket.emit('webrtc-ice-candidate', {
                    to: targetId,
                    candidate: event.candidate
                });
            }
        };

        // Handle remote stream
        pc.ontrack = (event) => {
            console.log('📨 Received remote stream');
            const remoteStream = event.streams[0];
            dispatch(setRemoteStream(remoteStream));

            // Set up remote audio element
            if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = remoteStream;
                remoteAudioRef.current.play().catch(console.error);
            }
        };

        // Handle connection state changes - FIXED: Remove setTimeout delay and add call ending check
        pc.onconnectionstatechange = () => {
            console.log('🔗 Connection state:', pc.connectionState);
            if (pc.connectionState === 'connected') {
                console.log('✅ Call connected!');
                dispatch(callConnected());
                setIsConnecting(false);
                startCallTimer();
                toast.success('Call connected!');
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                console.log('❌ Call disconnected/failed');
                setIsConnecting(false);
                // Only handle end call if not already handled by socket event and call is not already ending
                if ((isCallActive || isIncomingCall || isOutgoingCall) && !isCallEnding) {
                    console.log('🔄 Connection state triggered call end');
                    handleEndCall(false); // Local end triggered by connection state change
                }
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('🧊 ICE state:', pc.iceConnectionState);
        };

        return pc;
    };

    // Get user media
    const getUserMedia = async () => {
        try {
            console.log('🎤 Requesting microphone access...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            localStreamRef.current = stream;
            dispatch(setLocalStream(stream));

            // Set up local audio element (muted to prevent feedback)
            if (localAudioRef.current) {
                localAudioRef.current.srcObject = stream;
                localAudioRef.current.muted = true;
            }

            console.log('✅ Microphone access granted');
            return stream;
        } catch (error) {
            console.error('❌ Microphone access denied:', error);
            toast.error('Microphone access is required for calls');
            return null;
        }
    };

    // Start call timer
    const startCallTimer = () => {
        callTimerRef.current = setInterval(() => {
            setCallDuration(prev => prev + 1);
        }, 1000);
    };

    // Format call duration
    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Handle initiating a call
    const initiateCall = async (targetUser) => {
        console.log('📞 initiateCall called with targetUser:', targetUser);
        console.log('📞 Target user details:', { id: targetUser._id, username: targetUser.username });

        // Check if we're already in a call
        if (isCallActive || isIncomingCall || isOutgoingCall) {
            console.log('⚠️ Already in a call, cannot initiate new call');
            console.log('⚠️ Current state:', { isCallActive, isIncomingCall, isOutgoingCall });
            toast.error('Cannot call - already in another call');
            return;
        }

        console.log('📞 Starting call initiation process');
        setIsConnecting(true);

        dispatch(startOutgoingCall({
            remoteUser: targetUser,
            callType: 'audio'
        }));

        try {
            // Get microphone access first
            const stream = await getUserMedia();
            if (!stream) {
                handleEndCall(false); // Local end due to media access failure
                return;
            }

            // Create peer connection
            const pc = createPeerConnection();

            // Add local stream to peer connection
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
                console.log('📤 Added local track:', track.kind);
            });

            // Create and send offer
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false
            });

            await pc.setLocalDescription(offer);
            console.log('📝 Created offer');

            // Send call invitation
            console.log('📤 Sending call-user event to socket');
            console.log('📤 Call data:', {
                to: targetUser._id,
                from: user._id,
                callerName: user.username,
                callerAvatar: user.profilePicture || '',
                offer: offer ? 'present' : 'missing'
            });

            socket.emit('call-user', {
                to: targetUser._id,
                from: user._id,
                callerName: user.username,
                callerAvatar: user.profilePicture || '',
                offer: offer
            });

            console.log('📤 Call invitation sent successfully');
            toast.info(`Calling ${targetUser.username}...`);

        } catch (error) {
            console.error('❌ Error initiating call:', error);
            toast.error('Failed to start call');
            setIsConnecting(false);
            handleEndCall(false); // Local end due to initiation error
        }
    };

    // Handle accepting incoming call
    const handleAcceptCall = async () => {
        console.log('📞 Accepting call from:', callerInfo?.callerName);
        console.log('📞 Caller info:', callerInfo);
        console.log('📞 User ID:', user._id);
        console.log('📞 Socket connected:', socket?.connected);

        setIsConnecting(true);

        try {
            // Get microphone access
            console.log('🎤 Requesting microphone access for call acceptance');
            const stream = await getUserMedia();
            if (!stream) {
                console.log('❌ No microphone access, rejecting call');
                handleRejectCall();
                return;
            }

            // Create peer connection
            console.log('🔧 Creating peer connection for call acceptance');
            const pc = createPeerConnection();

            // Add local stream to peer connection
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
                console.log('📤 Added local track:', track.kind);
            });

            // Process the incoming offer
            if (callerInfo?.offer) {
                console.log('📨 Processing incoming offer');
                await pc.setRemoteDescription(new RTCSessionDescription(callerInfo.offer));

                // Create answer
                console.log('📝 Creating WebRTC answer');
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                // Send acceptance with answer
                console.log('📤 Sending call acceptance to:', callerInfo.from);
                socket.emit('call-accepted', {
                    to: callerInfo.from,
                    from: user._id
                });

                // Send WebRTC answer
                console.log('📤 Sending WebRTC answer to:', callerInfo.from);
                socket.emit('webrtc-answer', {
                    to: callerInfo.from,
                    answer: answer
                });

                console.log('📤 Answer sent successfully');
            } else {
                console.log('❌ No offer found in callerInfo');
                toast.error('No call offer received');
                handleEndCall(false);
                return;
            }

            // Accept the call
            console.log('📞 Dispatching acceptIncomingCall action');
            dispatch(acceptIncomingCall());
            console.log('✅ Call accepted');
            toast.info('Call accepted, connecting...');

        } catch (error) {
            console.error('❌ Error accepting call:', error);
            toast.error('Failed to accept call');
            setIsConnecting(false);
            handleEndCall(false); // Local end due to acceptance error
        }
    };

    // Handle rejecting call
    const handleRejectCall = () => {
        console.log('❌ Rejecting call from:', callerInfo?.callerName);

        socket.emit('call-rejected', {
            to: callerInfo.from,
            from: user._id
        });

        dispatch(rejectIncomingCall());
        toast.info('Call rejected');
    };

    // Handle ending call - FIXED: Set call ending flag to prevent double cleanup
    const handleEndCall = (isRemoteEnd = false) => {
        if (isCallEnding) {
            console.log('⚠️ Call already ending, skipping duplicate cleanup');
            return;
        }

        console.log('🔚 Ending call...', isRemoteEnd ? '(remote end)' : '(local end)');
        setIsCallEnding(true); // Prevent double cleanup

        // Only notify other party if this is a LOCAL end (not remote)
        if (!isRemoteEnd) {
            // Determine target ID before cleanup
            let targetId = null;
            if (isOutgoingCall && remoteUser?._id) {
                targetId = remoteUser._id;
                console.log('🎯 Target (outgoing call):', targetId);
            } else if (isIncomingCall && callerInfo?.from) {
                targetId = callerInfo.from;
                console.log('🎯 Target (incoming call):', targetId);
            } else if (isCallActive) {
                // During active call, check both sources
                targetId = remoteUser?._id || callerInfo?.from;
                console.log('🎯 Target (active call):', targetId);
            }

            // Notify other party BEFORE cleanup
            if (socket && targetId) {
                console.log('📤 Sending end-call notification to:', targetId);
                socket.emit('end-call', {
                    to: targetId,
                    from: user._id
                });
            } else {
                console.warn('❌ Could not determine target for end-call notification');
            }
        } else {
            console.log('🔕 Skipping end-call notification (remote end)');
        }

        // Stop timer
        if (callTimerRef.current) {
            clearInterval(callTimerRef.current);
            callTimerRef.current = null;
        }

        // Stop local stream
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                track.stop();
                console.log('🛑 Stopped local track:', track.kind);
            });
            localStreamRef.current = null;
        }

        // Close peer connection
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }

        // Reset state
        setCallDuration(0);
        setIsConnecting(false);
        setIsMuted(false);
        setIsSpeakerOn(true);

        dispatch(endCall());
        console.log('✅ Call cleanup completed');
    };

    // Toggle mute
    const toggleMute = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = isMuted; // Note: opposite logic because we're toggling
            });
            setIsMuted(!isMuted);
            toast.info(isMuted ? 'Microphone unmuted' : 'Microphone muted');
        }
    };

    // Toggle speaker
    const toggleSpeaker = () => {
        if (remoteAudioRef.current) {
            remoteAudioRef.current.muted = isSpeakerOn; // Note: opposite logic
            setIsSpeakerOn(!isSpeakerOn);
            toast.info(isSpeakerOn ? 'Speaker off' : 'Speaker on');
        }
    };

    // Socket event listeners
    useEffect(() => {
        if (!socket) {
            console.log('❌ No socket available for call events');
            return;
        }

        console.log('🔌 Socket available, setting up call event listeners');

        // Handle incoming call
        const handleIncomingCall = async ({ from, callerName, callerAvatar, offer }) => {
            console.log('📞 Incoming call from:', callerName, 'from ID:', from);
            console.log('📞 Current call state - isCallActive:', isCallActive, 'isOutgoingCall:', isOutgoingCall, 'isIncomingCall:', isIncomingCall);

            // Check if we're already in a call or outgoing call
            if (isCallActive || isOutgoingCall) {
                console.log('⚠️ Already in a call, rejecting incoming call');
                socket.emit('call-rejected', {
                    to: from,
                    from: user._id
                });
                toast.error('Call rejected - already in another call');
                return;
            }

            console.log('📞 Dispatching receiveIncomingCall action');
            console.log('📞 Action payload:', { callerInfo: { from, callerName, callerAvatar, offer: offer ? 'present' : 'missing' } });

            const result = dispatch(receiveIncomingCall({
                callerInfo: { from, callerName, callerAvatar, offer }
            }));

            console.log('📞 Dispatch result:', result);

            // Store the offer for when user accepts the call
            if (offer) {
                console.log('📨 Stored incoming offer');
            }

            console.log('📞 Incoming call setup complete');
        };

        // Handle call accepted
        const handleCallAccepted = async ({ from }) => {
            console.log('✅ Call accepted by:', from);
            console.log('✅ Current call state before acceptance:', { isCallActive, isIncomingCall, isOutgoingCall, callStatus });

            // Just acknowledge that call was accepted
            // The actual WebRTC answer will come via 'webrtc-answer' event
            toast.info('Call accepted, establishing connection...');
        };

        // Handle call rejected
        const handleCallRejected = ({ from }) => {
            console.log('❌ Call rejected by:', from);
            toast.error('Call was rejected');
            handleEndCall(true); // Remote rejection, treat as remote end
        };

        // Handle WebRTC answer
        const handleWebRTCAnswer = async ({ answer }) => {
            console.log('📨 Received WebRTC answer');

            if (pcRef.current) {
                try {
                    await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
                    console.log('✅ Answer processed');
                } catch (error) {
                    console.error('❌ Error processing answer:', error);
                    handleEndCall(false); // Local end due to WebRTC error
                }
            }
        };

        // Handle ICE candidate
        const handleICECandidate = async ({ candidate }) => {
            console.log('🧊 Received ICE candidate');

            if (pcRef.current) {
                try {
                    await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                    console.log('✅ ICE candidate added');
                } catch (error) {
                    console.error('❌ Error adding ICE candidate:', error);
                }
            }
        };

        // Handle call failed
        const handleCallFailed = ({ reason }) => {
            console.log('❌ Call failed:', reason);

            // Handle race condition message more gracefully
            let errorMessage = reason;
            if (reason && reason.includes('simultaneously')) {
                errorMessage = 'Both users tried to call at the same time. Try again!';
            }

            toast.error(`Call failed: ${errorMessage}`);
            handleEndCall(true); // Remote failure, treat as remote end
        };

        // Handle call ended - FIXED: Immediate termination without delay
        const handleCallEnded = ({ from }) => {
            console.log('🔚 Call ended by:', from);

            // Force immediate cleanup without notifying other party (they already ended it)
            console.log('⚡ Immediate call termination');

            // Use the unified handleEndCall with isRemoteEnd=true to prevent duplicate cleanup
            handleEndCall(true); // Pass true to indicate this is a remote end

            toast.info('Call ended');
            console.log('✅ Call terminated immediately (remote end)');
        };

        // Register event listeners
        console.log('🔌 Registering socket event listeners');
        socket.on('incoming-call', handleIncomingCall);
        socket.on('call-accepted', handleCallAccepted);
        socket.on('call-rejected', handleCallRejected);
        socket.on('call-failed', handleCallFailed);
        socket.on('webrtc-answer', handleWebRTCAnswer);
        socket.on('webrtc-ice-candidate', handleICECandidate);
        socket.on('call-ended', handleCallEnded);
        console.log('🔌 Socket event listeners registered successfully');

        return () => {
            socket.off('incoming-call', handleIncomingCall);
            socket.off('call-accepted', handleCallAccepted);
            socket.off('call-rejected', handleCallRejected);
            socket.off('call-failed', handleCallFailed);
            socket.off('webrtc-answer', handleWebRTCAnswer);
            socket.off('webrtc-ice-candidate', handleICECandidate);
            socket.off('call-ended', handleCallEnded);
        };
    }, [socket]);

    // Handle initiating outgoing call
    useEffect(() => {
        if (isOutgoingCall && remoteUser && socket && !pcRef.current) {
            console.log('🎯 Auto-initiating call to:', remoteUser.username);
            initiateCall(remoteUser);
        }
    }, [isOutgoingCall, remoteUser, socket]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            handleEndCall(false); // Local cleanup on component unmount
        };
    }, []);

    const isModalOpen = isCallActive || isIncomingCall || isOutgoingCall;
    const showTimer = callStatus === 'connected' && callDuration > 0;

    // Debug logging for modal state
    console.log('📞 Modal State - isModalOpen:', isModalOpen, 'isCallActive:', isCallActive, 'isIncomingCall:', isIncomingCall, 'isOutgoingCall:', isOutgoingCall, 'callStatus:', callStatus);

    if (!isModalOpen) return null;

    console.log('🎨 Rendering CallModal with isModalOpen:', isModalOpen);

    // TEMPORARY: Replace Dialog with simple div for testing
    return (
        <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            color: 'white',
            padding: '20px',
            borderRadius: '10px',
            zIndex: 9999,
            display: isModalOpen ? 'block' : 'none',
            minWidth: '300px',
            textAlign: 'center'
        }}>
            {console.log('🎨 CallModal simple div rendering')}
            <div>
                <h2 style={{ marginBottom: '10px', fontSize: '18px' }}>
                    {isIncomingCall ? 'Incoming Call' : isOutgoingCall ? 'Outgoing Call' : 'Active Call'}
                </h2>
                <p style={{ marginBottom: '20px', fontSize: '14px', opacity: 0.8 }}>
                    {isIncomingCall
                        ? `Incoming call from ${callerInfo?.callerName || 'Unknown caller'}`
                        : isOutgoingCall
                        ? `Calling ${remoteUser?.username || 'Unknown user'}`
                        : `Active call with ${(remoteUser || callerInfo)?.username || callerInfo?.callerName || 'Unknown user'}`
                    }
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', gap: '20px' }}>
                    {/* Remote User Avatar & Info */}
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            width: '96px',
                            height: '96px',
                            borderRadius: '50%',
                            backgroundColor: '#3B82F6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '36px',
                            color: 'white',
                            margin: '0 auto 16px'
                        }}>
                            {(remoteUser || callerInfo)?.username?.[0] || callerInfo?.callerName?.[0] || 'U'}
                        </div>

                        <h3 style={{ fontSize: '20px', fontWeight: '600', color: 'white', marginBottom: '8px' }}>
                            {(remoteUser || callerInfo)?.username || callerInfo?.callerName}
                        </h3>

                        {showTimer && (
                            <p style={{ color: '#10B981', fontSize: '14px', fontWeight: '500' }}>
                                {formatDuration(callDuration)}
                            </p>
                        )}

                        {(isOutgoingCall || isConnecting) && callStatus !== 'connected' && (
                            <p style={{ color: '#3B82F6', fontSize: '14px' }}>
                                {isConnecting ? 'Connecting...' : 'Calling...'}
                            </p>
                        )}

                        {isIncomingCall && (
                            <p style={{ color: '#F59E0B', fontSize: '14px' }}>Incoming call...</p>
                        )}
                    </div>

                    {/* Call Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                        {callStatus === 'connected' && (
                            <>
                                {/* Mute Button */}
                                <button
                                    onClick={toggleMute}
                                    style={{
                                        borderRadius: '50%',
                                        width: '48px',
                                        height: '48px',
                                        border: 'none',
                                        backgroundColor: isMuted ? '#DC2626' : '#374151',
                                        color: 'white',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '20px'
                                    }}
                                >
                                    {isMuted ? '🎤' : '🎙️'}
                                </button>

                                {/* Speaker Button */}
                                <button
                                    onClick={toggleSpeaker}
                                    style={{
                                        borderRadius: '50%',
                                        width: '48px',
                                        height: '48px',
                                        border: 'none',
                                        backgroundColor: !isSpeakerOn ? '#DC2626' : '#374151',
                                        color: 'white',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '20px'
                                    }}
                                >
                                    {isSpeakerOn ? '🔊' : '🔇'}
                                </button>
                            </>
                        )}

                        {/* End Call / Reject Button */}
                        <button
                            onClick={isIncomingCall ? handleRejectCall : () => handleEndCall(false)}
                            style={{
                                borderRadius: '50%',
                                width: '56px',
                                height: '56px',
                                border: 'none',
                                backgroundColor: '#DC2626',
                                color: 'white',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '24px'
                            }}
                        >
                            📞
                        </button>

                        {/* Accept Call Button (only for incoming calls) */}
                        {isIncomingCall && (
                            <>
                                {console.log('🎯 Rendering accept button - isIncomingCall:', isIncomingCall)}
                                <button
                                    onClick={handleAcceptCall}
                                    style={{
                                        borderRadius: '50%',
                                        width: '56px',
                                        height: '56px',
                                        border: 'none',
                                        backgroundColor: '#10B981',
                                        color: 'white',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '24px'
                                    }}
                                >
                                    📞
                                </button>
                            </>
                        )}
                    </div>

                    {/* Hidden Audio Elements */}
                    <audio ref={localAudioRef} autoPlay muted />
                    <audio ref={remoteAudioRef} autoPlay />
                </div>
            </div>
        </div>
    );
};

// Export the call initiation function for use in Messages component
export const initiateCall = (targetUser, socket, dispatch) => {
    if (!socket) {
        toast.error('Connection not available');
        return;
    }

    // This will be handled by the CallModal component
    console.log('Initiate call function called - should be handled by CallModal');
};

export default CallModal;