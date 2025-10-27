import {Server} from "socket.io";
import express from "express";
import http from "http";

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
    cors:{
        origin:process.env.URL,
        methods:['GET','POST']
    }
})

const userSocketMap = {} ; // this map stores socket id corresponding the user id; userId -> socketId

export const getReceiverSocketId = (receiverId) => userSocketMap[receiverId];

io.on('connection', (socket)=>{
    const userId = socket.handshake.query.userId;
    if(userId){
        userSocketMap[userId] = socket.id;
    }

    io.emit('getOnlineUsers', Object.keys(userSocketMap));

    // Handle call events
    socket.on('call-user', ({ to, from, callerName, callerAvatar, offer }) => {
        console.log('📞 Call request received from:', from, 'to:', to);
        console.log('📞 Caller details:', { callerName, callerAvatar, offer: offer ? 'present' : 'missing' });

        const receiverSocketId = getReceiverSocketId(to);
        console.log('📞 Receiver socket ID lookup result:', receiverSocketId);

        if (receiverSocketId) {
            console.log('📞 Receiver socket found, checking for race conditions');

            // Check if the receiver is already calling the sender (race condition)
            const receiverSocket = io.sockets.sockets.get(receiverSocketId);
            if (receiverSocket && receiverSocket.callState && receiverSocket.callState.isCalling === from) {
                console.log('⚠️ Race condition detected: both users calling each other');
                // Handle race condition by rejecting the second call
                socket.emit('call-failed', {
                    to: from,
                    from: to,
                    reason: 'Both users tried to call simultaneously'
                });
                return;
            }

            // Store call state for race condition detection
            socket.callState = { isCalling: to };
            console.log('📞 Call state stored, forwarding incoming-call event');

            io.to(receiverSocketId).emit('incoming-call', {
                from,
                callerName,
                callerAvatar,
                offer
            });

            console.log('📞 Incoming-call event forwarded successfully');
        } else {
            console.log('❌ Receiver socket ID not found for user:', to);
            console.log('❌ Available user socket mappings:', Object.keys(userSocketMap));
        }
    });

    socket.on('call-accepted', ({ to, from }) => {
        console.log('✅ Call accepted by:', from, 'for:', to);
        console.log('✅ Looking for receiver socket ID for user:', to);
        const receiverSocketId = getReceiverSocketId(to);
        console.log('✅ Receiver socket ID:', receiverSocketId);
        if (receiverSocketId) {
            console.log('✅ Forwarding call-accepted event to:', receiverSocketId);
            io.to(receiverSocketId).emit('call-accepted', { from });
        } else {
            console.log('❌ Receiver socket ID not found for user:', to);
        }
        // Clear call state on acceptance
        socket.callState = null;
    });

    socket.on('call-rejected', ({ to, from }) => {
        console.log('❌ Call rejected by:', from, 'for:', to);
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call-rejected', { from });
        }
        // Clear call state on rejection
        socket.callState = null;
    });

    socket.on('call-ended', ({ to, from }) => {
        console.log('🔚 Call ended by:', from, 'notifying:', to);
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call-ended', { from });
        }
        // Clear call state on call end
        socket.callState = null;
    });

    socket.on('call-failed', ({ to, from, reason }) => {
        console.log('❌ Call failed by:', from, 'for:', to, 'reason:', reason);
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call-failed', { from, reason });
        }
        // Clear call state on call failure
        socket.callState = null;
    });

    // Handle WebRTC events
    socket.on('webrtc-answer', ({ to, answer }) => {
        console.log('📨 WebRTC answer from:', userId, 'to:', to);
        console.log('📨 Looking for receiver socket ID for WebRTC answer:', to);
        const receiverSocketId = getReceiverSocketId(to);
        console.log('📨 Receiver socket ID for answer:', receiverSocketId);
        if (receiverSocketId) {
            console.log('📨 Forwarding WebRTC answer to:', receiverSocketId);
            io.to(receiverSocketId).emit('webrtc-answer', { answer });
        } else {
            console.log('❌ Receiver socket ID not found for WebRTC answer, user:', to);
        }
    });

    socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
        console.log('🧊 ICE candidate from:', userId, 'to:', to);
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('webrtc-ice-candidate', { candidate });
        }
    });

    socket.on('disconnect',()=>{
        if(userId){
            delete userSocketMap[userId];
        }
        // Clear call state on disconnect
        socket.callState = null;
        io.emit('getOnlineUsers', Object.keys(userSocketMap));
    });
})

export {app, server, io};