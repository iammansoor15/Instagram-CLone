import React from 'react'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Button } from './ui/button'
import { Link } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import useGetAllMessage from '@/hooks/useGetAllMessage'
import useGetRTM from '@/hooks/useGetRTM'
import { Phone } from 'lucide-react'
import { startOutgoingCall } from '@/redux/callSlice'
import { toast } from 'sonner'

const Messages = ({ selectedUser }) => {
    useGetRTM();
    useGetAllMessage();
    const {messages} = useSelector(store=>store.chat);
    const {user} = useSelector(store=>store.auth);
    const {socket} = useSelector(store=>store.socketio);
    const dispatch = useDispatch();

    const handleCallUser = () => {
        if (!socket) {
            console.log('❌ Socket not available for call initiation');
            toast.error('Connection not available');
            return;
        }

        if (!selectedUser) {
            console.log('❌ No user selected for call');
            toast.error('No user selected');
            return;
        }

        console.log('📞 Initiating call to:', selectedUser.username, 'ID:', selectedUser._id);
        console.log('📞 Socket connected:', socket.connected);
        console.log('📞 Socket ID:', socket.id);

        dispatch(startOutgoingCall({
            remoteUser: selectedUser,
            callType: 'audio'
        }));

        toast.info(`Calling ${selectedUser.username}...`);
    };
    return (    
        <div className='overflow-y-auto flex-1 p-4'>
            <div className='flex justify-center'>
                <div className='flex flex-col items-center justify-center'>
                    <Avatar className="h-20 w-20">
                        <AvatarImage src={selectedUser?.profilePicture} alt='profile' />
                        <AvatarFallback>CN</AvatarFallback>
                    </Avatar>
                    <span>{selectedUser?.username}</span>
                    <div className="flex gap-2 my-2">
                        <Link to={`/profile/${selectedUser?._id}`}>
                            <Button className="h-8" variant="secondary">View profile</Button>
                        </Link>
                        <Button
                            onClick={handleCallUser}
                            className="h-8 bg-green-600 hover:bg-green-700"
                            variant="default"
                        >
                            <Phone className="w-4 h-4 mr-1" />
                            Call
                        </Button>
                    </div>
                </div>
            </div>
            <div className='flex flex-col gap-3'>
                {
                   messages && messages.map((msg) => {
                        return (
                            <div key={msg._id} className={`flex ${msg.senderId === user?._id ? 'justify-end' : 'justify-start'}`}>
                                <div className={`p-2 rounded-lg max-w-xs break-words ${msg.senderId === user?._id ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black'}`}>
                                    {msg.message}
                                </div>
                            </div>
                        )
                    })
                }

            </div>
        </div>  
    )
}

export default Messages