
import { createContext, useContext, useEffect, useCallback, useRef } from 'react';
import { useUser, useAuth as useClerkAuth } from '@clerk/clerk-react';
import api from '../api/client.js';

const AuthContext=createContext(null);

export function AuthProvider({ children }) {
    const { user: clerkUser, isLoaded, isSignedIn }=useUser();
    const { getToken, signOut }=useClerkAuth();
    const hasSynced=useRef(false);

    useEffect(() => {
        if (!isLoaded || !isSignedIn || hasSynced.current) return;

        const syncUser=async () => {
            try {
                const token=await getToken();
                await api.post('/auth/sync', {}, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                hasSynced.current=true;
            } catch (err) {
                console.warn('[AetherNet] /auth/sync failed:', err?.response?.data || err.message);
            }
        };

        syncUser();
    }, [isLoaded, isSignedIn, getToken]);

    useEffect(() => {
        if (!isSignedIn) hasSynced.current=false;
    }, [isSignedIn]);

    const user=clerkUser
        ? {
            id: clerkUser.id,
            username: clerkUser.username
                || clerkUser.primaryEmailAddress?.emailAddress?.split('@')[0]
                || 'user',
            email: clerkUser.primaryEmailAddress?.emailAddress || '',
        }
        : null;

    const logout=useCallback(async () => {
        await signOut();
    }, [signOut]);

    return (
        <AuthContext.Provider
            value={{
                user,
                loading: !isLoaded,
                isAuthenticated: !!isSignedIn,
                getToken,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth=() => {
    const ctx=useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};
