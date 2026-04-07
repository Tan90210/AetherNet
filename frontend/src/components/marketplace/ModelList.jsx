import { useState, useEffect, useRef } from 'react';
import { modelsApi, baseModelsApi } from '../../api/client.js';
import {
    Upload, X, ChevronDown, Tag, Info,
    CheckCircle, AlertCircle, Loader, ExternalLink
} from 'lucide-react';
import { SignedIn, SignedOut, SignUpButton } from '@clerk/clerk-react';
import toast from 'react-hot-toast';

const FAMILY_META={
    vision: { label: 'Vision CNN', color: '#6c63ff' },
    vision_transformer: { label: 'Vision Transformer', color: '#00b4ff' },
    nlp: { label: 'NLP', color: '#00e5a0' },
    audio: { label: 'Audio', color: '#ff7043' },
    edge: { label: 'Edge/Mobile', color: '#ffc107' },
    custom: { label: 'Custom', color: '#9e9e9e' },
};

export function PublishModelModal({ isOpen, onClose, onPublished }) {
    const [baseModels, setBaseModels]=useState([]);
    const [file, setFile]=useState(null);
    const [dragging, setDragging]=useState(false);
    const [form, setForm]=useState({
        name: '', description: '', base_model_id: '', tags: '', is_public: true,
    });
    const [uploading, setUploading]=useState(false);
    const [progress, setProgress]=useState(0);
    const [result, setResult]=useState(null);   // published model
    const [error, setError]=useState('');
    const fileRef=useRef();

    useEffect(() => {
        if (!isOpen) return;
        baseModelsApi.list().then(r => setBaseModels(r.data)).catch(() => { });
    }, [isOpen]);

    const resetForm=() => {
        setFile(null); setForm({ name: '', description: '', base_model_id: '', tags: '', is_public: true });
        setProgress(0); setResult(null); setError('');
    };

    const handleClose=() => { resetForm(); onClose(); };

    const handleDrop=(e) => {
        e.preventDefault(); setDragging(false);
        const f=e.dataTransfer.files[0];
        if (f) setFile(f);
    };

    const handleSubmit=async (e) => {
        e.preventDefault();
        if (!file) return setError('Please select a weights file.');
        if (!form.name.trim()) return setError('Model name is required.');
        if (!form.base_model_id) return setError('Please select a base architecture.');

        setError(''); setUploading(true); setProgress(5);

        try {
            const fd=new FormData();
            fd.append('weights', file);
            fd.append('name', form.name.trim());
            fd.append('description', form.description.trim());
            fd.append('base_model_id', form.base_model_id);
            fd.append('tags', form.tags.trim());
            fd.append('is_public', form.is_public);

            const timer=setInterval(() => setProgress(p => Math.min(p + 8, 85)), 400);

            const { data }=await modelsApi.publish(fd);

            clearInterval(timer);
            setProgress(100);
            setResult(data);
            toast.success(`œ… "${data.name}" published to IPFS!`);
            onPublished?.(data);
        } catch (err) {
            setError(err?.response?.data?.detail || err.message || 'Upload failed');
            setProgress(0);
        } finally {
            setUploading(false);
        }
    };

    if (!isOpen) return null;

    const grouped=baseModels.reduce((acc, m) => {
        (acc[m.family]=acc[m.family] || []).push(m);
        return acc;
    }, {});

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}>
            <div style={{ background: 'rgba(13,13,43,0.97)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: 'min(560px,95vw)', maxHeight: '90vh', overflowY: 'auto', padding: 32, position: 'relative' }}>
                <button onClick={handleClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                    <X size={20} />
                </button>

                <h2 style={{ marginBottom: 4 }}>Publish a Fine-Tuned Model</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 24 }}>
                    Your weights are uploaded to Pinata IPFS. A permanent CID is returned.
                </p>

                {/* Success state */}
                {result ? (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <CheckCircle size={48} color="var(--color-success)" style={{ marginBottom: 12 }} />
                        <h3 style={{ color: 'var(--color-success)', marginBottom: 8 }}>Published Successfully!</h3>
                        <p style={{ fontSize: '0.85rem', marginBottom: 4 }}>IPFS CID:</p>
                        <code style={{ fontSize: '0.78rem', wordBreak: 'break-all', color: 'var(--color-primary)' }}>
                            {result.current_version_cid}
                        </code>
                        {result.pinata_gateway_url && (
                            <div style={{ marginTop: 12 }}>
                                <a href={result.pinata_gateway_url} target="_blank" rel="noreferrer"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--color-primary)' }}>
                                    View on IPFS Gateway <ExternalLink size={12} />
                                </a>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
                            <button className="btn btn-secondary" onClick={resetForm}>Publish Another</button>
                            <button className="btn btn-primary" onClick={handleClose}>Done</button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* File drop zone */}
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={handleDrop}
                            onClick={() => fileRef.current?.click()}
                            style={{
                                border: `2px dashed ${dragging ? 'var(--color-primary)' : file ? 'var(--color-success)' : 'rgba(255,255,255,0.15)'}`,
                                borderRadius: 12, padding: 28, textAlign: 'center', cursor: 'pointer',
                                background: dragging ? 'rgba(108,99,255,0.08)' : 'rgba(255,255,255,0.02)',
                                transition: 'all 0.2s',
                            }}
                        >
                            <input ref={fileRef} type="file"
                                accept=".pt,.pth,.onnx,.h5,.bin,.safetensors,.pkl"
                                style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
                            {file ? (
                                <>
                                    <CheckCircle size={28} color="var(--color-success)" />
                                    <p style={{ marginTop: 8, fontWeight: 600 }}>{file.name}</p>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                                        {(file.size/1024/1024).toFixed(2)} MB
                                    </p>
                                </>
                            ) : (
                                <>
                                    <Upload size={28} color="var(--color-text-muted)" />
                                    <p style={{ marginTop: 8, fontWeight: 500 }}>Drag & drop weights here</p>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                                        .pt · .pth · .onnx · .h5 · .bin · .safetensors
                                    </p>
                                </>
                            )}
                        </div>

                        {/* Base model dropdown */}
                        <div>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6, display: 'block' }}>
                                Base Architecture *
                            </label>
                            <select value={form.base_model_id}
                                onChange={e => setForm(f => ({ ...f, base_model_id: e.target.value }))}
                                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'inherit', fontSize: '0.88rem' }}
                            >
                                <option value="">€” Select base model €”</option>
                                {Object.entries(grouped).map(([family, models]) => (
                                    <optgroup key={family} label={FAMILY_META[family]?.label || family}>
                                        {models.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}{m.params_millions ? ` (${m.params_millions}M params)` : ''}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>

                        {/* Name */}
                        <div>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6, display: 'block' }}>Model Name *</label>
                            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="e.g. My ResNet-18 Fine-tuned on CIFAR-100"
                                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'inherit', fontSize: '0.88rem', boxSizing: 'border-box' }} />
                        </div>

                        {/* Description */}
                        <div>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6, display: 'block' }}>Description</label>
                            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                rows={3} placeholder="What dataset, training setup, accuracy achieved€¦"
                                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'inherit', fontSize: '0.88rem', resize: 'vertical', boxSizing: 'border-box' }} />
                        </div>

                        {/* Tags */}
                        <div>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 6, display: 'block' }}>
                                <Tag size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />Tags (comma-separated)
                            </label>
                            <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                                placeholder="classification, cifar100, fine-tuned"
                                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'inherit', fontSize: '0.88rem', boxSizing: 'border-box' }} />
                        </div>

                        {/* Visibility */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                            <input type="checkbox" checked={form.is_public}
                                onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))}
                                style={{ accentColor: 'var(--color-primary)', width: 16, height: 16 }} />
                            <span style={{ fontSize: '0.85rem' }}>List publicly in Marketplace</span>
                        </label>

                        {/* Error */}
                        {error && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', background: 'rgba(255,77,109,0.1)', border: '1px solid rgba(255,77,109,0.2)', borderRadius: 8 }}>
                                <AlertCircle size={16} color="#ff4d6d" />
                                <span style={{ fontSize: '0.82rem', color: '#ff4d6d' }}>{error}</span>
                            </div>
                        )}

                        {/* Progress bar */}
                        {uploading && (
                            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden', height: 6 }}>
                                <div style={{ height: '100%', background: 'var(--gradient-brand)', width: `${progress}%`, transition: 'width 0.3s' }} />
                            </div>
                        )}

                        <button type="submit" className="btn btn-primary" disabled={uploading} style={{ marginTop: 4 }}>
                            {uploading ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Uploading to IPFS€¦</> : <><Upload size={15} /> Publish Model</>}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

export function ModelCard({ model }) {
    const meta=FAMILY_META[model.family] || FAMILY_META.custom;

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, cursor: 'default' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, background: `${meta.color}22`, border: `1px solid ${meta.color}44` }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, display: 'inline-block' }} />
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: meta.color }}>{meta.label}</span>
                </div>
                {model.is_base_model && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, background: 'rgba(255,193,7,0.15)', border: '1px solid rgba(255,193,7,0.3)' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#ffc107' }}>BASE ARCHITECTURE</span>
                    </div>
                )}
                {!model.is_base_model && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>¬‡ {model.download_count}</span>}
            </div>

            <div>
                <h3 style={{ fontSize: '1rem', marginBottom: 4, lineHeight: 1.3 }}>{model.name}</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {model.description || 'No description provided.'}
                </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {model.tags?.slice(0, 4).map(tag => (
                    <span key={tag} style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                        {tag}
                    </span>
                ))}
            </div>

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)' }}>by {model.owner_username}</span>
                {model.current_version_cid ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)' }} />
                        <span style={{ fontSize: '0.68rem', color: 'var(--color-success)' }}>On IPFS</span>
                    </div>
                ) : (
                    <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>No weights yet</span>
                )}
            </div>
        </div>
    );
}