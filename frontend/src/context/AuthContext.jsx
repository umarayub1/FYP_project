import { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadUser = () => {
            const storedUser = localStorage.getItem('user');
            const token = localStorage.getItem('token');

            if (storedUser && token) {
                setUser(JSON.parse(storedUser));
            }
            setLoading(false);
        };

        loadUser();
    }, []);

    const login = async (email, password) => {
        const response = await api.post('/auth/login', { email, password });
        const { token, data } = response.data;

        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(data.user));

        setUser(data.user);
        return data.user;
    };

    const register = async (username, email, password) => {
        const response = await api.post('/auth/register', { username, email, password });
        const { token, data } = response.data;

        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(data.user));

        setUser(data.user);
        return data.user;
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
