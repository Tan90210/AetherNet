import { useState, useEffect } from 'react';
import { sessionsApi, modelsApi, baseModelsApi } from '../../api/client.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useSandbox } from '../../contexts/SandboxContext.jsx';
import Modal from '../common/Modal.jsx';
import JoinSessionModal from '../sandbox/JoinSessionModal.jsx';
import { Plus, Key, RefreshCw, Info } from 'lucide-react';
import toast from 'react-hot-toast';

const DATASET_GUIDES={
    vision: {
        title: 'Image Classification Dataset',
        format: 'ImageFolder (one subfolder per class)',
        example: `my_dataset/\n  ”œ”€”€ class_A/\n  ”‚     ”œ”€”€ img1.jpg\n  ”‚     ”””€”€ img2.png\n  ”””€”€ class_B/\n        ”””€”€ img1.jpg`,
        notes: [
            'Supported: .jpg, .jpeg, .png, .bmp, .webp',
            'Resize images to match input shape (e.g. 224Ã—224)',
            'Minimum ~50 images per class recommended',
        ],
    },
    vision_transformer: {
        title: 'Image Dataset (Patch-based)',
        format: 'ImageFolder (one subfolder per class)',
        example: `my_dataset/\n  ”œ”€”€ class_A/\n  ”‚     ”””€”€ img1.jpg\n  ”””€”€ class_B/\n        ”””€”€ img1.jpg`,
        notes: [
            'Input: 224Ã—224 RGB (16Ã—16 patches for ViT)',
            'Square crops work best €” transformers are sensitive to aspect ratio',
            'Same ImageFolder format as Vision CNNs',
        ],
    },
    nlp: {
        title: 'Text Classification Dataset',
        format: 'CSV with "text" and "label" columns',
        example: `train.csv:\ntext,label\n"Great product!",positive\n"Terrible.",negative`,
        notes: [
            'Required columns: text, label (case-sensitive)',
            'Max 512 tokens per sample (BERT/RoBERTa)',
            'UTF-8 encoding required',
            'Minimum ~100 samples per class recommended',
        ],
    },
    audio: {
        title: 'Audio Dataset',
        format: 'WAV files in per-class subfolders (classification) or wav+txt pairs (ASR)',
        example: `my_dataset/\n  ”œ”€”€ class_A/\n  ”‚     ”””€”€ audio1.wav\n  ”””€”€ class_B/\n        ”””€”€ audio1.wav`,
        notes: [
            'Required sample rate: 16,000 Hz',
            'Supported: .wav (preferred), .flac, .mp3',
            'Clip duration: 1€“30 seconds recommended',
        ],
    },
    edge: {
        title: 'Image Dataset (Mobile-optimised)',
        format: 'ImageFolder (one subfolder per class)',
        example: `my_dataset/\n  ”œ”€”€ class_A/ (images)\n  ”””€”€ class_B/ (images)`,
        notes: [
            'Target input: 224Ã—224 RGB',
            'Edge models (MobileNet, SqueezeNet) train fast €” even small datasets help',
            'Quantisation-friendly: keep images crisp and well-lit',
        ],
    },
    custom: {
        title: 'Custom Dataset',
        format: 'Defined by your model\'s description',
        example: `Refer to the "Description" field of your\npublished model for the expected format.`,
        notes: [
            'The Local Sandbox will accept any folder',
            'Your FL client code handles the data pipeline',
            'Document expected format in the model description',
        ],
    },
};

const getGuide=(baseModels, baseModelId) => {
    const bm=baseModels.find(m => m.id=== baseModelId);
    if (!bm) return null;
    return DATASET_GUIDES[bm.family] || DATASET_GUIDES.custom;
};

const statusColor={ Open: 'var(--color-success)', Training: 'var(--color-warning)', Closed: 'var(--color-text-muted)' };

export default function SessionManager({ onSessionJoined }) {
    const { isAuthenticated, user }=useAuth();
    const { dataShape, files, folderName }=useSandbox();

    const [sessions, setSessions]=useState([]);
    const [models, setModels]=useState([]);
    const [baseModels, setBaseModels]=useState([]);
    const [loading, setLoading]=useState(false);
    const [createOpen, setCreateOpen]=useState(false);
    const [joinOpen, setJoinOpen]=useState(false);
    const [creating, setCreating]=useState(false);
    const [startingSessionKey, setStartingSessionKey]=useState('');
    const [publishingSessionKey, setPublishingSessionKey]=useState('');
    const [approving, setApproving]=useState('');

    const [createForm, setCreateForm]=useState({
        session_name: '',
        model_id: '', min_clients: 2, max_rounds: 3,
        input_shape: dataShape ? dataShape.join(',') : '3,224,224',
        description: '',
        session_type: 'public',
        validation_policy: 'shape_only',
    });
    const [deleting, setDeleting]=useState('');

    const setCreate=(k) => (e) => setCreateForm(f => ({ ...f, [k]: e.target.value }));

    useEffect(() => { if (dataShape) setCreateForm(f => ({ ...f, input_shape: dataShape.join(',') })); }, [dataShape]);

    const fetchSessions=async () => {
        setLoading(true);
        try { const { data }=await sessionsApi.list(); setSessions(data); }
        catch { toast.error('Failed to load sessions.'); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        fetchSessions();
        modelsApi.list({ limit: 100 }).then(r => setModels(r.data)).catch(() => { });
        baseModelsApi.list().then(r => setBaseModels(r.data)).catch(() => { });
    }, []);

    useEffect(() => {
        const timer=setInterval(fetchSessions, 5000);
        return () => clearInterval(timer);
    }, []);

    const selectedPublishedModel=models.find(m => m.id=== createForm.model_id);
    const selectedBaseModel=baseModels.find(m => m.id=== createForm.model_id);
    const selectedBaseModelId=selectedPublishedModel?.base_model_id || selectedBaseModel?.id || null;
    const guide=selectedBaseModelId ? getGuide(baseModels, selectedBaseModelId) : null;

    const handleCreate=async (e) => {
        e.preventDefault();
        if (!files || files.length=== 0) {
            toast.error('Link and scan your dataset in Local Sandbox before creating a session.');
            return;
        }
        if (!createForm.model_id) { toast.error('Please select a model.'); return; }
        setCreating(true);
        try {
            const payload={
                session_name: createForm.session_name,
                model_id: createForm.model_id,
                required_input_shape: createForm.input_shape.split(',').map(Number),
                min_clients: Number(createForm.min_clients),
                max_rounds: Number(createForm.max_rounds),
                description: createForm.description,
                session_type: createForm.session_type,
                validation_policy: createForm.validation_policy,
            };
            const { data }=await sessionsApi.create(payload);
            toast.success(`Session "${data.session_name || 'FL Session'}" created successfully.`);
            setCreateOpen(false);
            fetchSessions();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to create session.');
        } finally { setCreating(false); }
    };

    const handleStart=async (session) => {
        const promptMsg="Enter the ABSOLUTE path to your local dataset folder.\n\nExample: C:*Users*Name*Desktop*my_dataset\n\nPress OK without typing to use the default (./dataset in the backend folder).";
        const raw=window.prompt(promptMsg);
        const dDir=(raw!==null && raw.trim()!=='') ? raw.trim() : './dataset';

        setStartingSessionKey(session.session_key);
        onSessionJoined?.(session);
        try {
            await sessionsApi.start(session.session_key, { confirm_min_clients: false, data_dir: dDir });
            toast.success('Training started. Clients will now train and aggregate updates.');
            fetchSessions();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to start session.');
        } finally {
            setStartingSessionKey('');
        }
    };

    const handlePublishFinal=async (session) => {
        setPublishingSessionKey(session.session_key);
        try {
            const res=await sessionsApi.publishFinal(session.session_key);
            if (res?.data?.status=== 'already_published') {
                toast.success('Model already published to marketplace.');
                fetchSessions();
                return;
            }
            toast.success('Upload started €” waiting for Pinata confirmation...');

            const MAX_POLLS=60;
            for (let i=0; i<MAX_POLLS; i++) {
                await new Promise(r => setTimeout(r, 3000));
                const updated=await sessionsApi.get(session.session_key);
                if (updated?.data?.final_model_cid) {
                    toast.success('Final model published to marketplace!');
                    fetchSessions();
                    return;
                }
                if (updated?.data?.publish_status=== 'failed') {
                    toast.error('Pinata upload failed. Check backend logs.');
                    fetchSessions();
                    return;
                }
            }
            toast.error('Publish timed out €” check backend logs.');
            fetchSessions();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to publish final model.');
        } finally {
            setPublishingSessionKey('');
        }
    };

    const handleRequestAccess=async (session) => {
        const promptMsg="For automated local testing, paste the absolute path to your dataset (e.g. C:*Users*Name*Desktop*Data).\n\nLeave blank to use the default ./dataset folder.";
        const dDir=window.prompt(promptMsg);

        try {
            await sessionsApi.requestAccess(session.id, { data_dir: dDir || null });
            toast.success('Access request sent to session owner.');
            fetchSessions();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to request access.');
        }
    };

    const handleApproveRequest=async (session, requestUserId) => {
        const key=`${session.id}:${requestUserId}`;
        setApproving(key);
        try {
            await sessionsApi.approveRequest(session.id, requestUserId);
            toast.success('Request approved. Member added to session.');
            fetchSessions();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to approve request.');
        } finally {
            setApproving('');
        }
    };

    const handleLockJoin=async (session) => {
        try {
            await sessionsApi.lockJoin(session.id);
            toast.success('Stopped accepting new member requests.');
            fetchSessions();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to stop member requests.');
        }
    };

    const handleDelete=async (session) => {
        if (!window.confirm(`Delete session "${session.session_name || 'FL Session'}"? This action cannot be undone.`)) {
            return;
        }
        setDeleting(session.id);
        try {
            await sessionsApi.delete(session.id);
            toast.success('Session deleted successfully.');
            fetchSessions();
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to delete session.');
        } finally {
            setDeleting('');
        }
    };

    return (
        <>
            <div className="glass-card" style={{ padding: 'var(--space-xl)' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                    <h3 style={{ fontSize: '1.1rem' }}>
                        <Key size={17} style={{ display: 'inline', marginRight: 8, color: 'var(--color-secondary)', verticalAlign: 'middle' }} />
                        FL Sessions
                    </h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary btn-sm" onClick={fetchSessions} disabled={loading}>
                            <RefreshCw size={12} />
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setJoinOpen(true)} disabled={!isAuthenticated}>
                            <Key size={12} /> Join
                        </button>
                        {isAuthenticated && (
                            <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
                                <Plus size={12} /> Create
                            </button>
                        )}
                    </div>
                </div>

                {/* Sessions list */}
                {loading ? (
                    <div className="flex-center" style={{ height: 100 }}><div className="spinner" /></div>
                ) : sessions.length=== 0 ? (
                    <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                        No sessions yet. {isAuthenticated ? 'Create one to start training!' : 'Sign in to create a session.'}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {sessions.map((s) => (
                            (() => {
                                const isLead=
                                    (s.lead_clerk_user_id && user?.id && s.lead_clerk_user_id=== user.id)
                                    || s.lead_username=== user?.username;
                                const isParticipant=
                                    (Array.isArray(s.participant_clerk_user_ids) && !!user?.id && s.participant_clerk_user_ids.includes(user.id))
                                    || (Array.isArray(s.participant_usernames) && s.participant_usernames.includes(user?.username));
                                const hasRequested=Array.isArray(s.pending_requests) && s.pending_requests.some(r =>
                                    (!!user?.id && r.clerk_user_id=== user.id) || r.username=== user?.username
                                );

                                return (
                            <div key={s.id} style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--color-secondary)' }}>{s.session_name || 'FL Session'}</span>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: statusColor[s.status], textTransform: 'uppercase', letterSpacing: '0.06em' }}>— {s.status}</span>
                                        {!s.join_open && s.status=== 'Open' && (
                                            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--color-warning)', textTransform: 'uppercase' }}>Requests Locked</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                                        Lead: {s.lead_username} · Shape: [{s.required_input_shape}] · {s.max_rounds} rounds
                                    </div>
                                    {Array.isArray(s.participant_usernames) && s.participant_usernames.length>0 && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                                            Joined: {s.participant_usernames.join(', ')}
                                        </div>
                                    )}
                                    {s.session_type=== 'private' && (
                                        <div style={{ fontSize: '0.65rem', color: 'var(--color-primary)', fontWeight: 600 }}>PRIVATE SESSION</div>
                                    )}

                                    {isLead && Array.isArray(s.pending_requests) && s.pending_requests.length>0 && (
                                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                Access Requests
                                            </div>
                                            {s.pending_requests.map((req) => {
                                                const key=`${s.id}:${req.user_id}`;
                                                return (
                                                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem' }}>
                                                        <span style={{ color: 'var(--color-text-primary)' }}>{req.username}</span>
                                                        <button
                                                            className="btn btn-primary btn-sm"
                                                            style={{ fontSize: '0.66rem', padding: '3px 8px' }}
                                                            onClick={() => handleApproveRequest(s, req.user_id)}
                                                            disabled={approving=== key}
                                                        >
                                                            {approving=== key ? 'Approving...' : 'Approve'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {!isLead && isParticipant && s.status!=='Closed' && (
                                        <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.7rem', padding: '4px 10px' }} onClick={() => onSessionJoined?.(s)}>
                                            Open Monitor
                                        </button>
                                    )}
                                    {isLead && s.status!=='Open' && (
                                        <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.7rem', padding: '4px 10px' }} onClick={() => onSessionJoined?.(s)}>
                                            Open Monitor
                                        </button>
                                    )}
                                    {!isLead && !isParticipant && s.status=== 'Open' && !hasRequested && s.join_open && (
                                        <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.7rem', padding: '4px 10px' }} onClick={() => handleRequestAccess(s)}>
                                            Request Access
                                        </button>
                                    )}
                                    {!isLead && !isParticipant && hasRequested && (
                                        <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.7rem', padding: '4px 10px' }} disabled>
                                            Request Pending
                                        </button>
                                    )}
                                    {isLead && (
                                        <button className="btn btn-danger btn-sm" style={{ fontSize: '0.7rem', padding: '4px 10px' }}
                                            onClick={() => handleDelete(s)}
                                            disabled={deleting=== s.id}>
                                            {deleting=== s.id ? 'Deleting...' : 'Delete'}
                                        </button>
                                    )}
                                    {isLead && s.status=== 'Open' && s.join_open && (
                                        <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.7rem', padding: '4px 10px' }} onClick={() => handleLockJoin(s)}>
                                            Stop Joining
                                        </button>
                                    )}
                                    {isLead && s.status=== 'Open' && (
                                        <button
                                            className="btn btn-primary btn-sm"
                                            style={{ fontSize: '0.7rem', padding: '4px 10px' }}
                                            onClick={() => handleStart(s)}
                                            disabled={(s.connected_clients || 0)<s.min_clients || startingSessionKey=== s.session_key}
                                        >
                                            {startingSessionKey=== s.session_key ? 'Starting...' : `Start Training (${s.connected_clients || 0}/${s.min_clients})`}
                                        </button>
                                    )}
                                    {isLead && s.status=== 'Closed' && !s.final_model_cid && (
                                        <button
                                            className="btn btn-primary btn-sm"
                                            style={{ fontSize: '0.7rem', padding: '4px 10px' }}
                                            onClick={() => handlePublishFinal(s)}
                                            disabled={publishingSessionKey=== s.session_key}
                                        >
                                            {publishingSessionKey=== s.session_key ? 'Publishing...' : 'Publish Final Model'}
                                        </button>
                                    )}
                                </div>
                            </div>
                                );
                            })()
                        ))}
                    </div>
                )}
            </div>

            {/* ”€”€ Create Session Modal ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€ */}
            <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create FL Session" maxWidth="540px">
                <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {!folderName && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--color-warning)', padding: '10px 12px', background: 'rgba(255,181,71,0.1)', border: '1px solid rgba(255,181,71,0.25)', borderRadius: 'var(--radius-md)' }}>
                            Link your local dataset in Local Sandbox before creating a session.
                        </div>
                    )}

                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Session Name *</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="e.g. Chest X-ray Round 1"
                            value={createForm.session_name}
                            onChange={setCreate('session_name')}
                            required
                        />
                    </div>

                    {/* Model dropdown */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Model *</label>
                        {(models.length=== 0 && baseModels.length=== 0) ? (
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                                No models available right now.
                            </p>
                        ) : (
                            <select
                                className="form-input"
                                value={createForm.model_id}
                                onChange={e => setCreate('model_id')(e)}
                                required
                                style={{ background: 'rgba(255,255,255,0.06)', color: 'inherit' }}
                            >
                                <option value="">€” Select a base or published model €”</option>

                                {baseModels.length>0 && (
                                    <optgroup label="Base Models">
                                        {baseModels.map(m => (
                                            <option key={`base-${m.id}`} value={m.id}>
                                                {m.name} ({m.family}) €” Base model
                                            </option>
                                        ))}
                                    </optgroup>
                                )}

                                {models.length>0 && (
                                    <optgroup label="Published Models">
                                        {models.map(m => (
                                            <option key={`published-${m.id}`} value={m.id}>
                                                {m.name} ({m.architecture_type}) €” by {m.owner_username}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        )}
                    </div>

                    {/* Dataset guide */}
                    {guide && (
                        <div style={{ marginTop: 10, padding: 14, background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.25)', borderRadius: 10, fontSize: '0.8rem', lineHeight: 1.7 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-primary)', fontWeight: 600, marginBottom: 8 }}>
                                <Info size={16} /> Dataset Format Expected: {guide.title}
                            </div>
                            <p style={{ fontWeight: 600, marginBottom: 6 }}>Format: <span style={{ color: 'var(--color-text-primary)', fontWeight: 400 }}>{guide.format}</span></p>
                            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6, overflowX: 'auto', color: 'var(--color-text-secondary)', marginBottom: 10 }}>{guide.example}</pre>
                            <ul style={{ paddingLeft: 18, margin: 0 }}>
                                {guide.notes.map(n => <li key={n} style={{ color: 'var(--color-text-muted)' }}>{n}</li>)}
                            </ul>
                        </div>
                    )}

                    {/* Description */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Session Description</label>
                        <input type="text" className="form-input" placeholder="What are we training?" value={createForm.description} onChange={setCreate('description')} />
                    </div>

                    {/* Input shape */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Required Input Shape (e.g. 3,224,224 for RGB images · 1,512 for NLP)</label>
                        <input type="text" className="form-input" placeholder="3,224,224" value={createForm.input_shape} onChange={setCreate('input_shape')} required />
                    </div>

                    {/* Clients + rounds */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[{ key: 'min_clients', label: 'Min Clients' }, { key: 'max_rounds', label: 'FL Rounds' }].map(({ key, label }) => (
                            <div className="form-group" key={key} style={{ marginBottom: 0 }}>
                                <label className="form-label">{label}</label>
                                <input type="number" className="form-input" min={1} max={key=== 'min_clients' ? 100 : 50} value={createForm[key]} onChange={setCreate(key)} required />
                            </div>
                        ))}
                    </div>

                    {/* Session Type */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Session Type</label>
                        <div style={{ display: 'flex', gap: 16 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                                <input type="radio" value="public" checked={createForm.session_type=== 'public'} onChange={setCreate('session_type')} />
                                Public (Listed in Dashboard)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                                <input type="radio" value="private" checked={createForm.session_type=== 'private'} onChange={setCreate('session_type')} />
                                Private (Invite Link Only)
                            </label>
                        </div>
                    </div>

                    {/* Validation Policy (Public Only) */}
                    {createForm.session_type=== 'public' && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Anti-Faulty-Data Policy</label>
                            <select className="form-input" value={createForm.validation_policy} onChange={setCreate('validation_policy')}>
                                <option value="shape_only">Shape Validation Only (Default)</option>
                                <option value="gradient_norm">Gradient Norm Analysis (Oust outlier clients)</option>
                            </select>
                        </div>
                    )}

                    <button type="submit" className="btn btn-primary" disabled={creating}>
                        {creating ? <span className="spinner" /> : <Plus size={14} />}
                        Create Session
                    </button>
                </form>
            </Modal>

            {/* Join session modal */}
            <JoinSessionModal isOpen={joinOpen} onClose={() => setJoinOpen(false)} onJoin={onSessionJoined} />
        </>
    );
}
