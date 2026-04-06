import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { modelsApi, baseModelsApi } from '../api/client.js';
import { ModelCard, PublishModelModal } from '../components/marketplace/ModelList.jsx';
import { SignedIn, SignedOut, SignUpButton } from '@clerk/clerk-react';
import { Search, SlidersHorizontal, PlusCircle, ShoppingBag, Loader } from 'lucide-react';

const FAMILIES=[
    { key: null, label: 'All Models' },
    { key: 'catalogue', label: 'Base Models Catalogue' },
    { key: 'vision', label: 'Vision CNN' },
    { key: 'vision_transformer', label: 'Vision Transformer' },
    { key: 'nlp', label: 'NLP' },
    { key: 'audio', label: 'Audio' },
    { key: 'edge', label: 'Edge/Mobile' },
    { key: 'custom', label: 'Custom' },
];

export default function Marketplace() {
    const [models, setModels]=useState([]);
    const [loading, setLoading]=useState(true);
    const [search, setSearch]=useState('');
    const [family, setFamily]=useState(null);
    const [page, setPage]=useState(1);
    const [hasMore, setHasMore]=useState(true);
    const [publishOpen, setPublishOpen]=useState(false);

    const fetchModels=async (reset=false) => {
        setLoading(true);
        try {
            if (family=== 'catalogue') {
                const { data }=await baseModelsApi.catalogue();
                let filtered=data;
                if (search) {
                    const lcSearch=search.toLowerCase();
                    filtered=data.filter(m =>
                        m.name.toLowerCase().includes(lcSearch) ||
                        m.description?.toLowerCase().includes(lcSearch)
                    );
                }
                setModels(filtered);
                setHasMore(false);
                if (reset) setPage(1);
            } else {
                const params={ page: reset ? 1 : page, limit: 18 };
                if (family) params.family=family;
                if (search) params.search=search;
                const { data }=await modelsApi.list(params);
                setModels(prev => reset ? data : [...prev, ...data]);
                setHasMore(data.length=== 18);
                if (reset) setPage(1);
            }
        } catch (err) {
            console.error('Failed to fetch models', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { setPage(1); fetchModels(true); }, [family, search]);

    const handlePublished=(newModel) => {
        setModels(prev => [newModel, ...prev]);
        setPublishOpen(false);
    };

    return (
        <main style={{ paddingTop: 68 }}>
            {/* ”€”€ Header ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€ */}
            <section style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(108,99,255,0.12) 0%, transparent 70%)', padding: '40px 0 28px', borderBottom: '1px solid var(--color-border)' }}>
                <div className="container">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ShoppingBag size={20} color="#fff" />
                            </div>
                            <div>
                                <h1 style={{ fontSize: '1.8rem', marginBottom: 2 }}>Model Marketplace</h1>
                                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                                    Discover and share fine-tuned AI models stored on IPFS.
                                </p>
                            </div>
                        </div>

                        {/* Publish button €” requires auth */}
                        <SignedIn>
                            <button className="btn btn-primary" onClick={() => setPublishOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <PlusCircle size={16} /> Publish Model
                            </button>
                        </SignedIn>
                        <SignedOut>
                            <SignUpButton mode="modal">
                                <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <PlusCircle size={16} /> Sign in to Publish
                                </button>
                            </SignUpButton>
                        </SignedOut>
                    </div>

                    {/* Search bar */}
                    <div style={{ marginTop: 24, position: 'relative', maxWidth: 480 }}>
                        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Search models, tags, descriptions€¦"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ width: '100%', padding: '10px 14px 10px 40px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 'var(--radius-md)', color: 'inherit', fontSize: '0.88rem', boxSizing: 'border-box' }}
                        />
                    </div>
                </div>
            </section>

            {/* ”€”€ Family filter tabs ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€ */}
            <section style={{ borderBottom: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.01)' }}>
                <div className="container">
                    <div style={{ display: 'flex', overflowX: 'auto', gap: 4, padding: '12px 0', scrollbarWidth: 'none' }}>
                        {FAMILIES.map(f => (
                            <button
                                key={String(f.key)}
                                onClick={() => setFamily(f.key)}
                                style={{
                                    padding: '6px 18px', borderRadius: 20, border: '1px solid',
                                    whiteSpace: 'nowrap', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer',
                                    background: family=== f.key ? 'var(--color-primary)' : 'rgba(255,255,255,0.04)',
                                    borderColor: family=== f.key ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)',
                                    color: family=== f.key ? '#fff' : 'var(--color-text-secondary)',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {/* ”€”€ Grid ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€ */}
            <section className="section">
                <div className="container">
                    {loading && models.length=== 0 ? (
                        <div className="flex-center" style={{ minHeight: 300, flexDirection: 'column', gap: 12 }}>
                            <Loader size={28} style={{ animation: 'spin 1s linear infinite' }} />
                            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Loading models€¦</p>
                        </div>
                    ) : models.length=== 0 ? (
                        <div className="flex-center" style={{ minHeight: 300, flexDirection: 'column', gap: 12, textAlign: 'center' }}>
                            <ShoppingBag size={40} color="var(--color-text-muted)" />
                            <p style={{ color: 'var(--color-text-muted)' }}>No models found. Be the first to publish one!</p>
                            <SignedIn>
                                <button className="btn btn-primary btn-sm" onClick={() => setPublishOpen(true)}>
                                    Publish Model
                                </button>
                            </SignedIn>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                                {models.map(m => (
                                    <Link key={m.id} to={`/models/${m.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                        <ModelCard model={m} />
                                    </Link>
                                ))}
                            </div>

                            {hasMore && (
                                <div className="flex-center">
                                    <button
                                        className="btn btn-secondary"
                                        disabled={loading}
                                        onClick={() => { setPage(p => p + 1); fetchModels(false); }}
                                    >
                                        {loading ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : 'Load more'}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </section>

            {/* Publish modal */}
            <PublishModelModal
                isOpen={publishOpen}
                onClose={() => setPublishOpen(false)}
                onPublished={handlePublished}
            />

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </main>
    );
}
