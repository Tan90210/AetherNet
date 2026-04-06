import { useEffect, useRef, useState, useCallback } from 'react';

export default function useSSE(url, enabled=true) {
    const [events, setEvents]=useState([]);
    const [lastEvent, setLastEvent]=useState(null);
    const [connected, setConnected]=useState(false);
    const [error, setError]=useState(null);
    const esRef=useRef(null);
    const reconnectTimer=useRef(null);
    const reconnectAttempts=useRef(0);
    const connectInFlight=useRef(false);
    const connectedRef=useRef(false);

    const cleanupConnection=useCallback(() => {
        if (reconnectTimer.current) {
            clearTimeout(reconnectTimer.current);
            reconnectTimer.current=null;
        }
        if (esRef.current) {
            esRef.current.close();
            esRef.current=null;
        }
    }, []);

    const connect=useCallback(async () => {
        if (!enabled) return;
        if (connectInFlight.current) return;
        if (typeof navigator!=='undefined' && !navigator.onLine) {
            setConnected(false);
            setError('Offline €” waiting for network...');
            return;
        }
        if (typeof document!=='undefined' && document.visibilityState=== 'hidden') {
            return;
        }

        connectInFlight.current=true;
        cleanupConnection();

        let finalUrl=url;
        try {
            const clerk=window.Clerk;
            if (clerk?.session) {
                const token=await clerk.session.getToken();
                if (token) {
                    finalUrl+=url.includes('?') ? `&token=${token}` : `?token=${token}`;
                }
            }
        } catch (err) {
            console.warn('[useSSE] Could not get Clerk token:', err.message);
        }

        const es=new EventSource(finalUrl);
        esRef.current=es;
        connectInFlight.current=false;

        es.onopen=() => {
            setConnected(true);
            connectedRef.current=true;
            setError(null);
            reconnectAttempts.current=0;
        };

        es.onmessage=(e) => {
            const event={ type: 'message', data: e.data, ts: Date.now() };
            setLastEvent(event);
            setEvents((prev) => [event, ...prev].slice(0, 200));
        };

        const EVENT_TYPES=[
            'server_ready', 'round_start', 'round_end',
            'round_no_updates',
            'clients_validated', 'client_ousted', 'evaluation',
            'session_closed', 'session_started', 'session_join_requested',
            'session_request_approved', 'session_deleted', 'server_launch_failed', 'server_runtime_failed',
            'training_stalled', 'model_published', 'model_publish_skipped',
            'model_publish_failed',       // <-- ADDED
            'local_clients_spawned', 'local_client_error', 'training_artifact_ready', 'training_artifact_missing',
            'events_cleared',             // <-- ADDED
        ];

        EVENT_TYPES.forEach((type) => {
            es.addEventListener(type, (e) => {
                const event={ type, data: e.data, ts: Date.now() };
                setLastEvent(event);
                setEvents((prev) => [event, ...prev].slice(0, 200));
            });
        });

        es.onerror=() => {
            setConnected(false);
            connectedRef.current=false;
            const baseDelay=3000;
            const maxDelay=30000;
            const attempt=reconnectAttempts.current;
            const delay=Math.min(maxDelay, baseDelay*Math.pow(2, attempt));

            reconnectAttempts.current=Math.min(attempt + 1, 10);
            setError(`Connection lost €” retrying in ${Math.ceil(delay/1000)}s...`);

            cleanupConnection();
            reconnectTimer.current=setTimeout(() => {
                connect();
            }, delay);
        };
    }, [url, enabled, cleanupConnection]);

    useEffect(() => {
        if (!enabled) return;
        connect();

        const onVisible=() => {
            if (document.visibilityState=== 'visible' && !connectedRef.current) {
                connect();
            }
        };
        const onOnline=() => connect();

        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', onOnline);

        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('online', onOnline);
            cleanupConnection();
            setConnected(false);
            connectedRef.current=false;
        };
    }, [enabled, connect, cleanupConnection]);

    const clearEvents=useCallback(() => setEvents([]), []);

    return { events, lastEvent, connected, error, clearEvents };
}
