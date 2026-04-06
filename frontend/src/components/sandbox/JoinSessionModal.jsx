import { useEffect, useState } from 'react';
import Modal from '../common/Modal.jsx';
import { sessionsApi } from '../../api/client.js';
import { useSandbox } from '../../contexts/SandboxContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { AlertCircle, CheckCircle2, Users } from 'lucide-react';
import toast from 'react-hot-toast';

export default function JoinSessionModal({ isOpen, onClose, onJoin }) {
    const [sessions, setSessions]=useState([]);
    const [refreshing, setRefreshing]=useState(false);
    const [loading, setLoading]=useState(false);
    const [error, setError]=useState('');
    const [dataDir, setDataDir]=useState('');

    const { dataShape, files, folderName }=useSandbox();
    const { user }=useAuth();

    const fetchSessions=async () => {
        setError('');
        setRefreshing(true);
        try {
            const { data }=await sessionsApi.list({ status_filter: 'Open' });
            setSessions(data || []);
        } catch (err) {
            setError('Failed to load open sessions.');
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (isOpen) fetchSessions();
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const timer=setInterval(fetchSessions, 5000);
        return () => clearInterval(timer);
    }, [isOpen]);

    const handleRequestAccess=async (session) => {
        if (!files || files.length=== 0) {
            toast.error('Link and scan your dataset in Local Sandbox before joining a session.');
            return;
        }

        if (dataShape && session.required_input_shape) {
            const match=session.required_input_shape.every((v, i) => v=== dataShape[i]);
            if (!match) {
                toast.error(`Shape mismatch! Session requires [${session.required_input_shape}], your data has [${dataShape}].`);
                return;
            }
        }

        setLoading(true);
        try {
            const { data }=await sessionsApi.requestAccess(session.id, { data_dir: dataDir || null });
            toast.success(`Access request sent for ${data.session_name || 'session'}.`);
            onJoin?.(data);
            fetchSessions();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to request access.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Request Session Access">
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 20 }}>
                Browse open sessions and request access. Session owners approve members before training starts.
            </p>

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(255,77,109,0.1)', border: '1px solid rgba(255,77,109,0.25)', marginBottom: 12 }}>
                    <AlertCircle size={14} color="var(--color-danger)" />
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-danger)' }}>{error}</span>
                </div>
            )}

            {!folderName && (
                <div style={{ marginBottom: 12, fontSize: '0.78rem', color: 'var(--color-warning)', padding: '10px 12px', background: 'rgba(255,181,71,0.1)', border: '1px solid rgba(255,181,71,0.25)', borderRadius: 'var(--radius-md)' }}>
                    Link a dataset in Local Sandbox first, then request session access.
                </div>
            )}

            <button type="button" className="btn btn-secondary btn-sm" disabled={refreshing} onClick={fetchSessions}>
                {refreshing ? <span className="spinner" /> : null}
                Refresh Open Sessions
            </button>

            <div style={{ marginTop: 16, marginBottom: 8 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>Local Dataset Absolute Path (Optional)</label>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>
                    For automated local testing, provide the absolute path to your dataset (e.g. <code>C:\Users\Name\Desktop\Data</code>). The background client will use this path directly without uploading your data.
                </div>
                <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. C:\Users\HP\Desktop\BetelLeaf"
                    value={dataDir}
                    onChange={(e) => setDataDir(e.target.value)}
                />
            </div>

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
                {sessions.length=== 0 && <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>No open sessions available right now.</p>}
                {sessions.map((session) => {
                    const shapeOk=!dataShape || !session.required_input_shape || session.required_input_shape.every((v, i) => v=== dataShape[i]);
                    const isLead=
                        (session.lead_clerk_user_id && user?.id && session.lead_clerk_user_id=== user.id)
                        || session.lead_username=== user?.username;
                    const isParticipant=
                        (Array.isArray(session.participant_clerk_user_ids) && !!user?.id && session.participant_clerk_user_ids.includes(user.id))
                        || (Array.isArray(session.participant_usernames) && session.participant_usernames.includes(user?.username));
                    const pending=Array.isArray(session.pending_requests) && session.pending_requests.some(r =>
                        (!!user?.id && r.clerk_user_id=== user.id) || r.username=== user?.username
                    );
                    const canRequest=!isLead && !isParticipant && !pending && session.join_open;

                    return (
                        <div key={session.id} style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <span style={{ fontWeight: 700 }}>{session.session_name || 'FL Session'}</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <Users size={12} /> {session.connected_clients || 0}/{session.min_clients}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>
                                Lead: {session.lead_username} · Shape: [{session.required_input_shape}] · {session.max_rounds} rounds
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.76rem', color: shapeOk ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                {shapeOk ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                                {shapeOk ? 'Shape compatible' : 'Shape mismatch'}
                            </div>
                            <button className="btn btn-primary btn-sm" onClick={() => handleRequestAccess(session)} disabled={loading || !shapeOk || !canRequest}>
                                {isLead ? 'Owner Session' : isParticipant ? 'Already Joined' : pending ? 'Request Pending' : session.join_open ? 'Request Access' : 'Requests Closed'}
                            </button>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}
