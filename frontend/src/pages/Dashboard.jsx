import { useState } from 'react';
import { SignedIn, SignedOut, SignUpButton } from '@clerk/clerk-react';
import LocalSandbox from '../components/sandbox/LocalSandbox.jsx';
import SessionManager from '../components/training/SessionManager.jsx';
import TrainingMonitor from '../components/training/TrainingMonitor.jsx';
import LivePublicSessions from '../components/training/LivePublicSessions.jsx';
import { LayoutDashboard, Lock } from 'lucide-react';

export default function Dashboard() {
    const [activeSession, setActiveSession]=useState(null);

    const handleSessionJoined=(session) => {
        setActiveSession(session);
    };

    return (
        <>
            {/* ”€”€ Unauthenticated gate ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€ */}
            <SignedOut>
                <div className="flex-center flex-col" style={{ minHeight: '80vh', paddingTop: 68, gap: 20, textAlign: 'center', padding: '80px var(--space-xl)' }}>
                    <div style={{ width: 72, height: 72, borderRadius: 'var(--radius-xl)', background: 'rgba(108,99,255,0.12)', border: '1.5px solid rgba(108,99,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Lock size={28} color="var(--color-primary)" />
                    </div>
                    <div>
                        <h2 style={{ marginBottom: 12 }}>Sign in to access the Dashboard</h2>
                        <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', maxWidth: 400, margin: '0 auto 24px' }}>
                            The training dashboard, local sandbox, and session management require authentication.
                        </p>
                    </div>
                    <SignUpButton mode="modal">
                        <button className="btn btn-primary">Get Started</button>
                    </SignUpButton>
                </div>
            </SignedOut>

            {/* ”€”€ Authenticated content ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€ */}
            <SignedIn>
                <main style={{ paddingTop: 68 }}>
                    {/* Page header */}
                    <section style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(108,99,255,0.12) 0%, transparent 70%)', padding: '36px 0 28px', borderBottom: '1px solid var(--color-border)' }}>
                        <div className="container">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <LayoutDashboard size={20} color="#fff" />
                                </div>
                                <div>
                                    <h1 style={{ fontSize: '1.8rem', marginBottom: 2 }}>Training Dashboard</h1>
                                    <p style={{ fontSize: '0.85rem' }}>Link local data, join sessions, and monitor federated training €” live.</p>
                                </div>
                            </div>

                            {activeSession && (
                                <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderRadius: 'var(--radius-full)', background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)' }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)', animation: 'pulseGlow 2s infinite' }} />
                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-success)' }}>
                                        Active Session: <span>{activeSession.session_name || 'FL Session'}</span>
                                    </span>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="section">
                        <div className="container">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)', alignItems: 'start', marginBottom: 'var(--space-lg)' }}>
                                {/* Left column: Sandbox + Sessions */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                                    <LocalSandbox />
                                    <SessionManager onSessionJoined={handleSessionJoined} />
                                </div>

                                {/* Right column: Training Monitor & Public Sessions */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', position: 'sticky', top: 84 }}>
                                    <TrainingMonitor enabled={!!activeSession} sessionKey={activeSession?.session_key || null} />

                                    {!activeSession && (
                                        <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--color-border)', textAlign: 'center' }}>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                                Click Open Monitor on a session card to view live training status.
                                            </p>
                                        </div>
                                    )}

                                    <LivePublicSessions />
                                </div>
                            </div>
                        </div>
                    </section>

                    <style>{`
                        @media (max-width: 900px) {
                            section .container>div[style*="grid-template-columns"] {
                                grid-template-columns: 1fr !important;
                            }
                        }
                    `}</style>
                </main>
            </SignedIn>
        </>
    );
}
