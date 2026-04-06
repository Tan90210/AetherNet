import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { SandboxProvider } from './contexts/SandboxContext.jsx';
import './styles/index.css';
import './styles/animations.css';
import './styles/forms.css';

const PUBLISHABLE_KEY=import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
    console.error(
        '[AetherNet] Missing VITE_CLERK_PUBLISHABLE_KEY in frontend/.env\n' +
        'Get your key from https://dashboard.clerk.com †’ API Keys'
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ClerkProvider publishableKey={PUBLISHABLE_KEY || 'pk_test_placeholder'}>
            <BrowserRouter>
                <AuthProvider>
                    <SandboxProvider>
                        <App />
                        <Toaster
                            position="bottom-right"
                            toastOptions={{
                                style: {
                                    background: 'rgba(13, 13, 43, 0.95)',
                                    color: '#f0f0ff',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    backdropFilter: 'blur(12px)',
                                    fontFamily: 'Inter, sans-serif',
                                },
                                success: { iconTheme: { primary: '#00e5a0', secondary: '#07071a' } },
                                error: { iconTheme: { primary: '#ff4d6d', secondary: '#07071a' } },
                            }}
                        />
                    </SandboxProvider>
                </AuthProvider>
            </BrowserRouter>
        </ClerkProvider>
    </React.StrictMode>
);
