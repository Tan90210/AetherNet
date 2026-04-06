import useSSE from '../../hooks/useSSE.js';
import { sessionsApi } from '../../api/client.js';
import { Radio, AlertTriangle, CheckCircle2, Activity, Users, Zap, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const formatIST=(ts) =>
    new Date(ts).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

const dbTsToMs=(ts) => {
    if (!ts) return Date.now();
    const s=String(ts);
    const normalized=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)
        ? s + 'Z'
        : s;
    const ms=new Date(normalized).getTime();
    return isNaN(ms) ? Date.now() : ms;
};

const EVENT_ICONS={
    session_started: <Zap size={14} color="var(--color-warning)" />,
    server_launch_failed: <AlertTriangle size={14} color="var(--color-danger)" />,
    server_runtime_failed: <AlertTriangle size={14} color="var(--color-danger)" />,
    training_stalled: <AlertTriangle size={14} color="var(--color-warning)" />,
    local_clients_spawned: <Users size={14} color="var(--color-secondary)" />,
    local_client_error: <AlertTriangle size={14} color="var(--color-danger)" />,
    model_publish_skipped: <AlertTriangle size={14} color="var(--color-warning)" />,
    model_published: <CheckCircle2 size={14} color="var(--color-success)" />,
    training_artifact_ready: <CheckCircle2 size={14} color="var(--color-success)" />,
    training_artifact_missing: <AlertTriangle size={14} color="var(--color-warning)" />,
    server_ready: <Zap size={14} color="var(--color-warning)" />,
    round_start: <Activity size={14} color="var(--color-primary)" />,
    round_end: <CheckCircle2 size={14} color="var(--color-success)" />,
    round_no_updates: <AlertTriangle size={14} color="var(--color-warning)" />,
    clients_validated: <Users size={14} color="var(--color-secondary)" />,
    client_ousted: <AlertTriangle size={14} color="var(--color-danger)" />,
    evaluation: <Activity size={14} color="var(--color-accent)" />,
    session_closed: <CheckCircle2 size={14} color="var(--color-success)" />,
};

const EVENT_LABEL={
    session_started: 'Session Started',
    server_launch_failed: 'Server Launch Failed',
    server_runtime_failed: 'Server Runtime Failed',
    training_stalled: 'Training Stalled',
    local_clients_spawned: 'Local Clients Spawned',
    local_client_error: 'Local Client Error',
    model_publish_skipped: 'Publish Skipped',
    model_published: 'Model Published',
    training_artifact_ready: 'Final Artifact Ready',
    training_artifact_missing: 'Artifact Missing',
    server_ready: 'Server Ready',
    round_start: 'Round Started',
    round_end: 'Round Complete',
    round_no_updates: 'No Client Updates',
    clients_validated: 'Clients Validated',
    client_ousted: 'š  Client Ousted',
    evaluation: 'Evaluation',
    session_closed: 'Session Closed',
};

function parseData(rawData) {
    try { return typeof rawData=== 'string' ? JSON.parse(rawData) : rawData; }
    catch { return { message: String(rawData) }; }
}

export default function TrainingMonitor({ enabled=true, sessionKey=null }) {
    const {
        events, lastEvent, connected, error, clearEvents,
    }=useSSE('/api/v1/events/stream', enabled);
    const [sessionInfo, setSessionInfo]=useState(null);
    const fetchInFlightRef=useRef(false);

    useEffect(() => {
        if (!enabled || !sessionKey) {
            setSessionInfo(null);
            return;
        }

        let cancelled=false;
        const fetchSession=async () => {
            if (fetchInFlightRef.current) return;
            fetchInFlightRef.current=true;
            try {
                const { data }=await sessionsApi.get(sessionKey);
                if (!cancelled) setSessionInfo(data);
            } catch {
                if (!cancelled) setSessionInfo(null);
            } finally {
                fetchInFlightRef.current=false;
            }
        };

        fetchSession();

        const intervalMs=connected ? 5000 : 2500;
        const timer=setInterval(() => {
            if (document.visibilityState!=='visible') return;
            fetchSession();
        }, intervalMs);

        return () => {
            cancelled=true;
            clearInterval(timer);
        };
    }, [enabled, sessionKey, connected]);

    const scopedEvents=events.filter((e) => {
        const data=parseData(e.data);
        if (!data || typeof data!=='object') return true;
        return !sessionKey || !data.session_key || data.session_key=== sessionKey;
    });

    const lastRoundEvent=scopedEvents.find(e => e.type=== 'round_end');
    const lastRoundData=lastRoundEvent ? parseData(lastRoundEvent.data) : null;
    const latestRound=lastRoundData?.round ?? 0;
    const isOusted=scopedEvents.some(e => e.type=== 'client_ousted');
    const persistedEvents=(sessionInfo?.training_events || []).map((e) => ({
        type: e.type,
        data: e.data,
        ts: dbTsToMs(e.timestamp),

    }));
    const mergedEvents=[...scopedEvents, ...persistedEvents].sort((a, b) => b.ts - a.ts).slice(0, 200);
    const totalEvents=mergedEvents.length;
    const currentRound=latestRound || sessionInfo?.current_round || 0;
    const totalRounds=sessionInfo?.max_rounds || 0;
    const progressPct=totalRounds>0 ? Math.min(100, Math.round((currentRound/totalRounds)*100)) : 0;

    return (
        <div className="glass-card" style={{ padding: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Radio size={18} style={{ color: connected ? 'var(--color-success)' : 'var(--color-text-muted)' }} />
                    Training Monitor
                </h3>
                <div style={{ display: 'flex', align: 'center', gap: 10 }}>
                    {totalEvents>0 && (
                        <button
                            className="btn btn-sm btn-secondary"
                            onClick={async () => {
                                if (sessionKey) {
                                    try {
                                        await sessionsApi.clearEvents(sessionKey);
                                    } catch (err) {
                                        console.error('Failed to clear events:', err);
                                    }
                                }
                                clearEvents();
                            }}
                            title="Clear all events (including old DB events)"
                            style={{ fontSize: '0.7rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                            <AlertTriangle size={12} /> Clear DB Events
                        </button>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 'var(--radius-full)', background: connected ? 'rgba(0,229,160,0.1)' : (sessionInfo ? 'rgba(255,181,71,0.1)' : 'rgba(255,255,255,0.04)'), border: `1px solid ${connected ? 'rgba(0,229,160,0.25)' : (sessionInfo ? 'rgba(255,181,71,0.25)' : 'var(--color-border)')}` }}>
                        {connected ? <Wifi size={12} color="var(--color-success)" /> : <WifiOff size={12} color={sessionInfo ? 'var(--color-warning)' : 'var(--color-text-muted)'} />}
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: connected ? 'var(--color-success)' : (sessionInfo ? 'var(--color-warning)' : 'var(--color-text-muted)'), textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {connected ? 'Live SSE' : sessionInfo ? 'Polling Mode' : (error ? 'Reconnecting€¦' : 'Disconnected')}
                        </span>
                    </div>
                </div>
            </div>

            {sessionInfo?.member_progress && Object.keys(sessionInfo.member_progress).length>0 && (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 12, background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                        Per-Member Progress
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {Object.entries(sessionInfo.member_progress).map(([member, progress]) => (
                            <div key={member} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.75rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{member}</span>
                                    <span style={{ color: 'var(--color-text-muted)' }}>
                                        {progress?.status || 'unknown'} · rounds: {progress?.rounds_completed ?? 0}/{totalRounds || '?'}
                                    </span>
                                </div>
                                <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                    <div
                                        style={{
                                            width: `${totalRounds>0 ? Math.min(100, Math.round(((progress?.rounds_completed || 0)/totalRounds)*100)) : 0}%`,
                                            height: '100%',
                                            background: 'linear-gradient(90deg, var(--color-secondary), var(--color-primary))',
                                            transition: 'width 250ms ease',
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {(sessionInfo?.status=== 'Training' || totalRounds>0) && (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 12, background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: 8 }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>Overall Training Progress</span>
                        <span style={{ color: 'var(--color-text-primary)' }}>
                            {currentRound}/{totalRounds || '?'} rounds ({progressPct}%)
                        </span>
                    </div>
                    <div style={{ height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div
                            style={{
                                width: `${progressPct}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, var(--color-primary), var(--color-success))',
                                transition: 'width 250ms ease',
                            }}
                        />
                    </div>
                    {sessionInfo?.status=== 'Training' && currentRound=== 0 && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 8 }}>
                            Training initialized. Waiting for first round aggregation...
                        </div>
                    )}
                </div>
            )}

            {/* Stats bar */}
            {(latestRound>0 || sessionInfo) && (
                <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {[
                        {
                            label: 'Current Round',
                            value: currentRound,
                            color: 'var(--color-primary)'
                        },
                        { label: 'Events', value: totalEvents, color: 'var(--color-secondary)' },
                        {
                            label: 'Status',
                            value: sessionInfo?.status || (isOusted ? 'š  Ouster' : 'œ“ OK'),
                            color: sessionInfo?.status=== 'Training' ? 'var(--color-warning)' : (isOusted ? 'var(--color-danger)' : 'var(--color-success)')
                        },
                    ].map(({ label, value, color }) => (
                        <div key={label} style={{ textAlign: 'center', padding: '12px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                            <div style={{ fontWeight: 700, fontSize: '1.1rem', color }}>{value}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* Event feed */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {(totalEvents=== 0) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 10, color: 'var(--color-text-muted)' }}>
                        <Radio size={28} style={{ opacity: 0.3 }} />
                        <p style={{ fontSize: '0.85rem' }}>Waiting for FL events€¦</p>
                        {sessionInfo && (
                            <p style={{ fontSize: '0.76rem', opacity: 0.7 }}>
                                Session status: {sessionInfo.status} · Clients: {sessionInfo.connected_clients || 0}/{sessionInfo.min_clients}
                                {sessionInfo.fl_server_port ? ` · FL Port: ${sessionInfo.fl_server_port}` : ''}
                            </p>
                        )}
                        <p style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                            Owner: click "Start Training". Approved members: click "Open Monitor".
                        </p>
                        {!connected && (
                            <p style={{ fontSize: '0.72rem', opacity: 0.6 }}>
                                Backend SSE appears disconnected. Ensure the backend API is running and proxy target is correct.
                            </p>
                        )}
                    </div>
                ) : (
                    mergedEvents.map((event, i) => {
                        const data=parseData(event.data);
                        const isOuster=event.type=== 'client_ousted';
                        return (
                            <div
                                key={i}
                                style={{
                                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                                    borderRadius: 'var(--radius-md)',
                                    background: isOuster ? 'rgba(255,77,109,0.07)' : 'rgba(255,255,255,0.025)',
                                    border: `1px solid ${isOuster ? 'rgba(255,77,109,0.2)' : 'transparent'}`,
                                    animation: i=== 0 ? 'fadeInUp 0.3s ease both' : 'none',
                                }}
                            >
                                <div style={{ flexShrink: 0, marginTop: 1 }}>
                                    {EVENT_ICONS[event.type] || <Activity size={14} />}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: isOuster ? 'var(--color-danger)' : 'var(--color-text-primary)' }}>
                                            {EVENT_LABEL[event.type] || event.type}
                                        </span>
                                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                                            {formatIST(event.ts)}

                                        </span>
                                    </div>
                                    <div className="text-mono" style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', wordBreak: 'break-all', lineHeight: 1.4 }}>
                                        {isOuster
                                            ? `Client ${data.node_id || '?'} €” ${data.reason}`
                                            : data.error
                                                ? data.error
                                                : data.message || (data.round ? `Round ${data.round}` : JSON.stringify(data).slice(0, 120))}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
