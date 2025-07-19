import { setPosts } from "@/redux/postSlice";
import axios from "axios";
import { useEffect } from "react";
import { useDispatch } from "react-redux";


const useGetAllPost = () => {
    const dispatch = useDispatch();
    const BASE_URL = import.meta.env.VITE_BASE_URL;

    useEffect(() => {
        const fetchAllPost = async () => {
            try {
                const res = await axios.get(`${BASE_URL}/api/v1/post/all`, { withCredentials: true });
                if (res.data.success) {
                    console.log(res.data.posts);
                    dispatch(setPosts(res.data.posts));
                }
            } catch (error) {
                console.log(error);
            }
        }
        fetchAllPost();
    }, []);
};
export default useGetAllPost;