import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { modelsApi, versionsApi } from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { ArrowLeft, ExternalLink, GitBranch, Upload, Cpu, Download } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export default function ModelDetail() {
    const { id }=useParams();
    const { isAuthenticated, user }=useAuth();
    const navigate=useNavigate();
    const [model, setModel]=useState(null);
    const [versions, setVersions]=useState([]);
    const [loading, setLoading]=useState(true);
    const [uploading, setUploading]=useState(false);
    const [file, setFile]=useState(null);
    const [metrics, setMetrics]=useState('{"accuracy": 0.95}');
    const [notes, setNotes]=useState('');

    useEffect(() => {
        const load=async () => {
            setLoading(true);
            try {
                const [modelRes, versRes]=await Promise.all([
                    modelsApi.get(id),
                    versionsApi.list(id),
                ]);
                setModel(modelRes.data);
                setVersions(versRes.data);
            } catch {
                toast.error('Failed to load model.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);

    const handleUpload=async (e) => {
        e.preventDefault();
        if (!file) { toast.error('Select a weights file.'); return; }
        setUploading(true);
        try {
            const fd=new FormData();
            fd.append('weights_file', file);
            fd.append('metrics_json', metrics);
            fd.append('notes', notes);
            const { data }=await versionsApi.upload(id, fd);
            toast.success(`Version ${data.version_number} pinned to IPFS! CID: ${data.new_cid.slice(0, 12)}…`);
            setVersions((v) => [data, ...v]);
            setFile(null);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Upload failed.');
        } finally {
            setUploading(false);
        }
    };

    if (loading) return (
        <div className="flex-center" style={{ height: '80vh', paddingTop: 68 }}>
            <div className="spinner" style={{ width: 40, height: 40 }} />
        </div>
    );

    if (!model) return (
        <div className="flex-center flex-col" style={{ height: '80vh', paddingTop: 68, gap: 16 }}>
            <p style={{ fontSize: '1.1rem', color: 'var(--color-text-muted)' }}>Model not found.</p>
            <Link to="/marketplace" className="btn btn-secondary btn-sm"><ArrowLeft size={13} /> Back</Link>
        </div>
    );

    // Base models are catalogue entries only — redirect back to marketplace
    if (model.tags?.includes('base-model')) {
        navigate('/marketplace', { replace: true });
        return null;
    }

    return (
        <main style={{ paddingTop: 68 }}>
            <section style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(108,99,255,0.12) 0%, transparent 70%)', padding: '40px 0 32px', borderBottom: '1px solid var(--color-border)' }}>
                <div className="container">
                    <Link to="/marketplace" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: 20 }}>
                        <ArrowLeft size={14} /> Back to Marketplace
                    </Link>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                <span className="badge badge-primary"><Cpu size={10} /> {model.architecture_type}</span>
                                {model.current_version_cid && (
                                    <a href={`https://gateway.pinata.cloud/ipfs/${model.current_version_cid}`} target="_blank" rel="noreferrer"
                                        className="badge badge-info" style={{ textDecoration: 'none' }}>
                                        <ExternalLink size={9} /> IPFS
                                    </a>
                                )}
                            </div>
                            <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.2rem)', marginBottom: 8 }}>{model.name}</h1>
                            <p style={{ fontSize: '0.9rem', maxWidth: 600 }}>{model.description}</p>
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            <div style={{ textAlign: 'center', padding: '12px 20px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                                <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--color-primary)' }}>{versions.length}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Versions</div>
                            </div>
                            <div style={{ textAlign: 'center', padding: '12px 20px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                                <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--color-secondary)' }}>{model.download_count}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Downloads</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="section">
                <div className="container">
                    <div className="grid-2" style={{ gap: 'var(--space-xl)', alignItems: 'start' }}>
                        {/* Version history */}
                        <div>
                            <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <GitBranch size={18} color="var(--color-primary)" /> Version History
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {versions.length=== 0 ? (
                                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                                        No versions yet. Upload model weights to create the first version.
                                    </div>
                                ) : versions.map((v, i) => (
                                    <div key={v.id} className="glass-card" style={{ padding: '16px', borderLeft: `3px solid ${i=== 0 ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: i=== 0 ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>
                                                    v{v.version_number}
                                                </span>
                                                {i=== 0 && <span className="badge badge-primary" style={{ fontSize: '0.6rem' }}>Latest</span>}
                                                {v.session_key && <span className="badge badge-info" style={{ fontSize: '0.6rem' }}>FL: {v.session_key}</span>}
                                            </div>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                                {format(new Date(v.timestamp), 'MMM d, yyyy')}
                                            </span>
                                        </div>
                                        <a href={`https://gateway.pinata.cloud/ipfs/${v.new_cid}`} target="_blank" rel="noreferrer"
                                            className="text-mono" style={{ fontSize: '0.72rem', color: 'var(--color-secondary)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                                            <ExternalLink size={10} /> {v.new_cid}
                                        </a>
                                        {v.notes && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 6 }}>{v.notes}</p>}
                                        {Object.keys(v.metrics_json || {}).length>0 && (
                                            <div className="text-mono" style={{ fontSize: '0.68rem', marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.2)', color: 'var(--color-text-muted)' }}>
                                                {JSON.stringify(v.metrics_json)}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Upload panel */}
                        {isAuthenticated && (
                            <div className="glass-card" style={{ padding: 'var(--space-xl)', position: 'sticky', top: 84 }}>
                                <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Upload size={18} color="var(--color-secondary)" /> Save Model to IPFS
                                </h3>
                                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginBottom: 20 }}>
                                    Upload your local weights file. It will be pinned to Pinata/IPFS and a new immutable version record created.
                                </p>
                                <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Weights File (.pt, .pkl, .h5, .bin)</label>
                                        <input
                                            type="file"
                                            className="form-input"
                                            style={{ cursor: 'pointer' }}
                                            accept=".pt,.pkl,.h5,.bin,.onnx,.safetensors"
                                            onChange={e => setFile(e.target.files[0])}
                                        />
                                        {file && <p style={{ fontSize: '0.72rem', color: 'var(--color-success)', marginTop: 4 }}>✓ {file.name} ({(file.size/1024/1024).toFixed(2)} MB)</p>}
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Metrics (JSON)</label>
                                        <textarea className="form-input text-mono" rows={2} value={metrics} onChange={e => setMetrics(e.target.value)} style={{ resize: 'vertical' }} />
                                    </div>
                                    <div className="form-group" style={{ marginBottom: 0 }}>
                                        <label className="form-label">Notes</label>
                                        <input className="form-input" placeholder="What changed in this version?" value={notes} onChange={e => setNotes(e.target.value)} />
                                    </div>
                                    <button type="submit" className="btn btn-primary" disabled={uploading || !file} id="save-model-btn">
                                        {uploading ? <span className="spinner" /> : <Upload size={14} />}
                                        Pin to IPFS & Save Version
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </main>
    );
}