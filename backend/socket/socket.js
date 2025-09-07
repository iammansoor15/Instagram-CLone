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
        console.log('📞 Call request from:', from, 'to:', to);
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('incoming-call', {
                from,
                callerName,
                callerAvatar,
                offer
            });
        }
    });

    socket.on('call-accepted', ({ to, from }) => {
        console.log('✅ Call accepted by:', from, 'for:', to);
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call-accepted', { from });
        }
    });

    socket.on('call-rejected', ({ to, from }) => {
        console.log('❌ Call rejected by:', from, 'for:', to);
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call-rejected', { from });
        }
    });

    socket.on('call-ended', ({ to, from }) => {
        console.log('🔚 Call ended by:', from, 'notifying:', to);
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call-ended', { from });
        }
    });

    socket.on('call-failed', ({ to, from, reason }) => {
        console.log('❌ Call failed by:', from, 'for:', to, 'reason:', reason);
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call-failed', { from, reason });
        }
    });

    // Handle WebRTC events
    socket.on('webrtc-answer', ({ to, answer }) => {
        console.log('📨 WebRTC answer from:', userId, 'to:', to);
        const receiverSocketId = getReceiverSocketId(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('webrtc-answer', { answer });
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
        io.emit('getOnlineUsers', Object.keys(userSocketMap));
    });
})

export {app, server, io};