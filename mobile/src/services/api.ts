import axios from 'axios'

// Replace with your machine's IP if testing on a real device
// Example: http://192.168.1.15:8000/api/v1
const BASE_URL = 'https://14ff-136-158-27-232.ngrok-free.app/api/v1'

export const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
    },
})

// Request interceptor for adding tokens
api.interceptors.request.use(async (config) => {
    // In a real app, you would get the token from secure storage
    // const token = await SecureStore.getItemAsync('token');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config
})
