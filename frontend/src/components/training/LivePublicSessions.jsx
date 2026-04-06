import { useState, useEffect } from 'react';
import { sessionsApi } from '../../api/client.js';
import { Activity, Radio, Users } from 'lucide-react';

export default function LivePublicSessions() {
    const [liveSessions, setLiveSessions]=useState([]);

    const fetchLiveSessions=async () => {
        try {
            const { data }=await sessionsApi.list({ status_filter: 'Training' });
            setLiveSessions(data.filter(s => s.session_type!=='private'));
        } catch (err) {
            console.error('Failed to fetch live sessions:', err);
        }
    };

    useEffect(() => {
        fetchLiveSessions();
        const interval=setInterval(() => {
            if (document.visibilityState!=='visible') return;
            fetchLiveSessions();
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="glass-card" style={{ padding: 'var(--space-lg)' }}>
            <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Activity size={16} color="var(--color-success)" />
                Live Public Sessions
            </h3>

            {liveSessions.length=== 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-text-muted)' }}>
                    <Radio size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
                    <p style={{ fontSize: '0.8rem' }}>No public sessions are currently training.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {liveSessions.map(s => (
                        <div key={s.session_key} style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,229,160,0.2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <span className="text-mono" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-success)' }}>
                                    {s.session_name || 'FL Session'}
                                </span>
                                <span style={{ fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-primary)' }}>
                                    <Users size={10} /> {s.connected_clients || 0}/{s.min_clients}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>
                                Lead: {s.lead_username}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                Shape: [{s.required_input_shape.join(', ')}]
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
