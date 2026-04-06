import { useState, useEffect } from 'react';
import { sessionsApi, modelsApi, baseModelsApi } from '../../api/client.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import Modal from '../common/Modal.jsx';
import { Zap, Users, BarChart3, TrendingUp, Plus, Eye, EyeOff, Copy, Lock, Unlock } from 'lucide-react';
import toast from 'react-hot-toast';
import styles from './FLMarketplace.module.css';

export default function FLMarketplace() {
    const { user }=useAuth();
    const [sessions, setSessions]=useState([]);
    const [models, setModels]=useState([]);
    const [baseModels, setBaseModels]=useState([]);
    const [loading, setLoading]=useState(true);
    const [filter, setFilter]=useState('all'); // 'all', 'open', 'training', 'closed'
    const [sortBy, setSortBy]=useState('newest'); // 'newest', 'participants', 'activity'
    const [searchTerm, setSearchTerm]=useState('');
    const [createOpen, setCreateOpen]=useState(false);
    const [detailsOpen, setDetailsOpen]=useState(false);
    const [selectedSession, setSelectedSession]=useState(null);
    const [joinModalOpen, setJoinModalOpen]=useState(false);
    const [showPasskeys, setShowPasskeys]=useState({});

    const [createForm, setCreateForm]=useState({
        model_id: '',
        min_clients: 2,
        max_rounds: 3,
        description: '',
        session_type: 'public',
        data_family: 'vision',
        training_config: {
            learning_rate: 0.001,
            batch_size: 32,
            local_epochs: 1,
            optimizer: 'adam',
        },
    });

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const [sessionsData, modelsData, baseModelsData]=await Promise.all([
                    sessionsApi.list(),
                    modelsApi.list(),
                    baseModelsApi.list(),
                ]);
                setSessions(sessionsData?.data ?? []);
                setModels(modelsData?.data ?? []);
                setBaseModels(baseModelsData?.data ?? []);
            } catch (e) {
                console.error('Failed to load sessions:', e);
                toast.error('Failed to load sessions');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filteredSessions=sessions
        .filter(s => {
            if (filter!=='all' && s.status!==filter) return false;
            if (searchTerm && !s.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
            return true;
        })
        .sort((a, b) => {
            if (sortBy=== 'newest') return new Date(b.created_at) - new Date(a.created_at);
            if (sortBy=== 'participants') return b.connected_clients - a.connected_clients;
            if (sortBy=== 'activity') return new Date(b.updated_at) - new Date(a.updated_at);
            return 0;
        });

    const createSession=async () => {
        if (!createForm.model_id) {
            toast.error('Please select a model');
            return;
        }

        try {
            const newSession=await sessionsApi.create({
                model_id: createForm.model_id,
                required_input_shape: [3, 224, 224], // TODO: Dynamic based on model
                min_clients: createForm.min_clients,
                max_rounds: createForm.max_rounds,
                description: createForm.description,
                session_type: createForm.session_type,
                data_family: createForm.data_family,
                training_config: createForm.training_config,
            });
            setSessions([newSession, ...sessions]);
            setCreateForm({
                model_id: '',
                min_clients: 2,
                max_rounds: 3,
                description: '',
                session_type: 'public',
                data_family: 'vision',
                training_config: {
                    learning_rate: 0.001,
                    batch_size: 32,
                    local_epochs: 1,
                    optimizer: 'adam',
                },
            });
            setCreateOpen(false);
            toast.success('Session created!');
        } catch (e) {
            toast.error('Failed to create session');
        }
    };

    const copyInviteToken=(token) => {
        navigator.clipboard.writeText(token);
        toast.success('Invite token copied!');
    };

    const getModelName=(modelId) => {
        const publishedModel=models.find(m => m.id=== modelId);
        if (publishedModel) return publishedModel.name;

        const baseModel=baseModels.find(m => m.id=== modelId);
        if (baseModel) return `${baseModel.name} (Base)`;

        return modelId.slice(0, 8);
    };

    const getStatusColor=(status) => {
        const colors={
            'Open': '#00e5a0',
            'Training': '#6c63ff',
            'Closed': '#ffb547',
        };
        return colors[status] || '#f0f0ff';
    };

    const getDataFamilyIcon=(family) => {
        const icons={
            vision: 'ðŸ–¼ï¸',
            vision_transformer: 'ðŸŽ¯',
            nlp: 'ðŸ“',
            audio: 'ðŸŽµ',
            edge: 'š¡',
        };
        return icons[family] ?? 'ðŸ“Š';
    };

    return (
        <main className={styles.marketplace}>
            {/* Header */}
            <section className={styles.header}>
                <div className="container">
                    <div className={styles.headerContent}>
                        <div>
                            <h1>Federated Learning Sessions</h1>
                            <p>Join collaborative model training. Data stays local, intelligence is shared.</p>
                        </div>
                        {user && (
                            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                                <Plus size={18} />
                                Create Session
                            </button>
                        )}
                    </div>

                    {/* Search & Filters */}
                    <div className={styles.controlsRow}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Search sessions..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ maxWidth: '300px' }}
                        />

                        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                            <select className="form-input" value={filter} onChange={e => setFilter(e.target.value)}>
                                <option value="all">All Sessions</option>
                                <option value="Open">Open</option>
                                <option value="Training">Training</option>
                                <option value="Closed">Closed</option>
                            </select>

                            <select className="form-input" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                                <option value="newest">Newest First</option>
                                <option value="participants">Most Participants</option>
                                <option value="activity">Most Active</option>
                            </select>
                        </div>
                    </div>
                </div>
            </section>

            {/* Sessions Grid */}
            <section className={styles.grid}>
                <div className="container">
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
                            <div style={{ display: 'inline-block' }} className="loading-spinner"></div>
                            <p style={{ marginTop: 'var(--space-lg)', color: 'var(--color-text-muted)' }}>Loading sessions...</p>
                        </div>
                    ) : filteredSessions.length=== 0 ? (
                        <div style={{ textAlign: 'center', padding: 'var(--space-2xl)' }}>
                            <p style={{ color: 'var(--color-text-muted)' }}>
                                {searchTerm ? 'No sessions match your search.' : 'No sessions yet. Create one to get started!'}
                            </p>
                        </div>
                    ) : (
                        <div className={styles.sessionGrid}>
                            {filteredSessions.map(session => (
                                <div key={session.id} className={styles.sessionCard}>
                                    {/* Status Badge */}
                                    <div className={styles.statusBadge} style={{ backgroundColor: `${getStatusColor(session.status)}20`, borderColor: getStatusColor(session.status), color: getStatusColor(session.status) }}>
                                        {session.status}
                                    </div>

                                    {/* Card Header */}
                                    <div className={styles.cardHeader}>
                                        <div>
                                            <h3>{getModelName(session.model_id)}</h3>
                                            <p className={styles.cardSubtitle}>
                                                Led by <strong>{session.lead_username}</strong>
                                            </p>
                                        </div>
                                        <span style={{ fontSize: '1.5rem' }}>
                                            {getDataFamilyIcon(session.data_family)}
                                        </span>
                                    </div>

                                    {/* Description */}
                                    <p className={styles.description}>
                                        {session.description || 'No description provided.'}
                                    </p>

                                    {/* Stats Row */}
                                    <div className={styles.statsRow}>
                                        <div className={styles.stat}>
                                            <Users size={16} />
                                            <span>{session.connected_clients}/{session.min_clients} participants</span>
                                        </div>
                                        <div className={styles.stat}>
                                            <TrendingUp size={16} />
                                            <span>Round {session.current_round + 1}/{session.max_rounds}</span>
                                        </div>
                                        <div className={styles.stat}>
                                            <Zap size={16} />
                                            <span>{session.data_family}</span>
                                        </div>
                                    </div>

                                    {/* Session Type Badge */}
                                    <div style={{ marginTop: 'var(--space-md)' }}>
                                        <span className={styles.badge} style={{
                                            backgroundColor: session.session_type=== 'public' ? 'rgba(0, 229, 160, 0.15)' : 'rgba(108, 99, 255, 0.15)',
                                            color: session.session_type=== 'public' ? 'var(--color-success)' : 'var(--color-primary)',
                                        }}>
                                            {session.session_type=== 'public' ? <Unlock size={12} /> : <Lock size={12} />}
                                            {session.session_type=== 'public' ? 'Public' : 'Private'}
                                        </span>
                                    </div>

                                    {/* Private Session Invite Code */}
                                    {session.session_type=== 'private' && session.invite_token && (
                                        <div className={styles.inviteBox}>
                                            <label>Invite Code</label>
                                            <div className={styles.inviteCode}>
                                                <input
                                                    type={showPasskeys[session.id] ? 'text' : 'password'}
                                                    value={session.invite_token}
                                                    readOnly
                                                    onClick={() => copyInviteToken(session.invite_token)}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                <button
                                                    className={styles.toggleBtn}
                                                    onClick={() => setShowPasskeys(prev => ({ ...prev, [session.id]: !prev[session.id] }))}
                                                >
                                                    {showPasskeys[session.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </button>
                                                <button
                                                    className={styles.copyBtn}
                                                    onClick={() => copyInviteToken(session.invite_token)}
                                                >
                                                    <Copy size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div className={styles.cardActions}>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            onClick={() => {
                                                setSelectedSession(session);
                                                setDetailsOpen(true);
                                            }}
                                        >
                                            Details
                                        </button>
                                        {session.status=== 'Open' && (
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={() => {
                                                    setSelectedSession(session);
                                                    setJoinModalOpen(true);
                                                }}
                                            >
                                                Join
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Create Session Modal */}
            {createOpen && (
                <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create FL Session">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                        {/* Model Selection */}
                        <div className="form-group">
                            <label className="form-label">Select Model</label>
                            <select
                                className="form-input"
                                value={createForm.model_id}
                                onChange={e => setCreateForm(prev => ({ ...prev, model_id: e.target.value }))}
                            >
                                <option value="">€” Choose a model €”</option>
                                {baseModels.length>0 && (
                                    <optgroup label="Base Models">
                                        {baseModels.map(m => (
                                            <option key={`base-${m.id}`} value={m.id}>
                                                {m.name} · {m.family}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                                {models.length>0 && (
                                    <optgroup label="Published Models">
                                        {models.map(m => (
                                            <option key={`published-${m.id}`} value={m.id}>
                                                {m.name} · {m.architecture_type}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>

                        {/* Description */}
                        <div className="form-group">
                            <label className="form-label">Description</label>
                            <textarea
                                className="form-input"
                                value={createForm.description}
                                onChange={e => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="E.g., Training on medical imaging data..."
                                style={{ minHeight: '80px' }}
                            />
                        </div>

                        {/* Data Family */}
                        <div className="form-group">
                            <label className="form-label">Data Modality</label>
                            <select
                                className="form-input"
                                value={createForm.data_family}
                                onChange={e => setCreateForm(prev => ({ ...prev, data_family: e.target.value }))}
                            >
                                <option value="vision">Vision (Images)</option>
                                <option value="vision_transformer">Vision Transformer</option>
                                <option value="nlp">NLP (Text)</option>
                                <option value="audio">Audio</option>
                                <option value="edge">Edge (IoT)</option>
                            </select>
                        </div>

                        {/* Min Clients & Max Rounds */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
                            <div className="form-group">
                                <label className="form-label">Min Clients</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    min="1"
                                    max="100"
                                    value={createForm.min_clients}
                                    onChange={e => setCreateForm(prev => ({ ...prev, min_clients: parseInt(e.target.value) || 2 }))}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Max Rounds</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    min="1"
                                    max="50"
                                    value={createForm.max_rounds}
                                    onChange={e => setCreateForm(prev => ({ ...prev, max_rounds: parseInt(e.target.value) || 3 }))}
                                />
                            </div>
                        </div>

                        {/* Session Type */}
                        <div className="form-group">
                            <label className="form-label">Visibility</label>
                            <select
                                className="form-input"
                                value={createForm.session_type}
                                onChange={e => setCreateForm(prev => ({ ...prev, session_type: e.target.value }))}
                            >
                                <option value="public">Public (Anyone can join)</option>
                                <option value="private">Private (Invite only)</option>
                            </select>
                        </div>

                        {/* Training Config */}
                        <div style={{ padding: 'var(--space-md)', backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                            <h4 style={{ marginBottom: 'var(--space-md)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>Training Config</h4>
                            <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Learning Rate</label>
                                    <input
                                        type="number"
                                        step="0.0001"
                                        className="form-input"
                                        value={createForm.training_config.learning_rate}
                                        onChange={e => setCreateForm(prev => ({
                                            ...prev,
                                            training_config: { ...prev.training_config, learning_rate: parseFloat(e.target.value) }
                                        }))}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Batch Size</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="form-input"
                                        value={createForm.training_config.batch_size}
                                        onChange={e => setCreateForm(prev => ({
                                            ...prev,
                                            training_config: { ...prev.training_config, batch_size: parseInt(e.target.value) || 32 }
                                        }))}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Buttons */}
                        <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-lg)' }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setCreateOpen(false)}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" style={{ flex: 1 }} onClick={createSession}>
                                Create Session
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Session Details Modal */}
            {detailsOpen && selectedSession && (
                <Modal isOpen={detailsOpen} onClose={() => setDetailsOpen(false)} title="Session Details">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                        <div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Model</p>
                            <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>{getModelName(selectedSession.model_id)}</p>
                        </div>
                        <div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Description</p>
                            <p>{selectedSession.description || '€”'}</p>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                            <div>
                                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Participants</p>
                                <p>{selectedSession.connected_clients}/{selectedSession.min_clients}</p>
                            </div>
                            <div>
                                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Rounds</p>
                                <p>{selectedSession.current_round + 1}/{selectedSession.max_rounds}</p>
                            </div>
                        </div>
                        <div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Status</p>
                            <p>{selectedSession.status}</p>
                        </div>
                    </div>
                </Modal>
            )}
        </main>
    );
}
