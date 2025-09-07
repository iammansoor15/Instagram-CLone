import { createSlice } from "@reduxjs/toolkit";

const callSlice = createSlice({
    name: "call",
    initialState: {
        isCallActive: false,
        isIncomingCall: false,
        isOutgoingCall: false,
        remoteUser: null,
        callerInfo: null,
        localStream: null,
        remoteStream: null,
        peerConnection: null,
        callStatus: 'idle', // 'idle', 'connecting', 'connected', 'ended'
        callType: 'audio', // 'audio' or 'video'
        callStartTime: null,
        callDuration: 0
    },
    reducers: {
        // Start an outgoing call
        startOutgoingCall: (state, action) => {
            state.isOutgoingCall = true;
            state.remoteUser = action.payload.remoteUser;
            state.callType = action.payload.callType || 'audio';
            state.callStatus = 'connecting';
        },

        // Receive an incoming call
        receiveIncomingCall: (state, action) => {
            state.isIncomingCall = true;
            state.callerInfo = action.payload.callerInfo;
            state.callStatus = 'incoming';
        },

        // Accept an incoming call
        acceptIncomingCall: (state) => {
            state.isIncomingCall = false;
            state.isCallActive = true;
            state.callStatus = 'connecting';
        },

        // Reject an incoming call
        rejectIncomingCall: (state) => {
            state.isIncomingCall = false;
            state.callerInfo = null;
            state.callStatus = 'idle';
        },

        // Call is connected
        callConnected: (state) => {
            state.callStatus = 'connected';
            state.isOutgoingCall = false;
            state.isIncomingCall = false;
            state.isCallActive = true;
            state.callStartTime = Date.now();
        },

        // End call
        endCall: (state) => {
            state.isCallActive = false;
            state.isIncomingCall = false;
            state.isOutgoingCall = false;
            state.remoteUser = null;
            state.callerInfo = null;
            state.callStatus = 'idle';
            state.callStartTime = null;
            state.callDuration = 0;
        },

        // Set local stream
        setLocalStream: (state, action) => {
            state.localStream = action.payload;
        },

        // Set remote stream
        setRemoteStream: (state, action) => {
            state.remoteStream = action.payload;
        },

        // Set peer connection
        setPeerConnection: (state, action) => {
            state.peerConnection = action.payload;
        },

        // Update call duration
        updateCallDuration: (state, action) => {
            state.callDuration = action.payload;
        },

        // Reset call state
        resetCallState: (state) => {
            state.isCallActive = false;
            state.isIncomingCall = false;
            state.isOutgoingCall = false;
            state.remoteUser = null;
            state.callerInfo = null;
            state.localStream = null;
            state.remoteStream = null;
            state.peerConnection = null;
            state.callStatus = 'idle';
            state.callType = 'audio';
            state.callStartTime = null;
            state.callDuration = 0;
        }
    }
});

export const {
    startOutgoingCall,
    receiveIncomingCall,
    acceptIncomingCall,
    rejectIncomingCall,
    callConnected,
    endCall,
    setLocalStream,
    setRemoteStream,
    setPeerConnection,
    updateCallDuration,
    resetCallState
} = callSlice.actions;

export default callSlice.reducer;