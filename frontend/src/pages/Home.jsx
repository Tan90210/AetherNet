import { Link } from 'react-router-dom';
import { Brain, ShieldCheck, GitBranch, Network, ArrowRight, Zap, Globe } from 'lucide-react';

const FEATURES=[
    { icon: <ShieldCheck size={22} />, color: '#00e5a0', title: 'Zero Data Upload', desc: 'Your dataset never leaves your machine. Only model gradients are aggregated €” privacy by design.' },
    { icon: <GitBranch size={22} />, color: '#6c63ff', title: 'Immutable Versioning', desc: 'Every training session creates an IPFS-pinned CID €” a permanent, verifiable record of model evolution.' },
    { icon: <Network size={22} />, color: '#00d4ff', title: 'Federated Learning', desc: 'Flower-powered FL with shape validation. Mismatched clients are automatically ousted.' },
    { icon: <Globe size={22} />, color: '#ffb547', title: 'Open Marketplace', desc: 'Browse, download, and fine-tune 35+ model architectures €” stored permanently on IPFS.' },
    { icon: <Brain size={22} />, color: '#ff6b9d', title: '35+ Architectures', desc: 'Vision CNNs, Vision Transformers, NLP, Audio €” all seeded and ready for federated fine-tuning.' },
    { icon: <Zap size={22} />, color: '#6c63ff', title: 'Real-time Events', desc: 'SSE-powered live dashboard shows round progress, client alerts, and completion events as they happen.' },
];

const STATS=[
    { value: 'IPFS', label: 'Permanent Storage' },
    { value: 'FL', label: 'Federated Training' },
    { value: '35+', label: 'Base Architectures' },
    { value: '0 bytes', label: 'Data Uploaded' },
];

export default function Home() {
    return (
        <main style={{ paddingTop: 68 }}>
            {/* ”€”€ Hero ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€ */}
            <section style={{
                minHeight: '92vh',
                background: 'var(--gradient-hero)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                textAlign: 'center',
                padding: 'var(--space-2xl) var(--space-xl)',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Background orbs */}
                {[
                    { top: '15%', left: '10%', size: 320, color: 'rgba(108,99,255,0.12)', delay: '0s' },
                    { top: '60%', right: '8%', size: 240, color: 'rgba(0,212,255,0.08)', delay: '2s' },
                    { bottom: '10%', left: '30%', size: 200, color: 'rgba(255,107,157,0.07)', delay: '4s' },
                ].map((orb, i) => (
                    <div key={i} style={{
                        position: 'absolute', borderRadius: '50%',
                        width: orb.size, height: orb.size,
                        background: orb.color, filter: 'blur(60px)',
                        top: orb.top, left: orb.left, right: orb.right, bottom: orb.bottom,
                        animation: `orbDrift ${8 + i*3}s ease-in-out infinite`,
                        animationDelay: orb.delay,
                        pointerEvents: 'none',
                    }} />
                ))}

                <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>
                    {/* Badge */}
                    <div className="animate-fadeInUp" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 18px', borderRadius: 'var(--radius-full)', background: 'rgba(108,99,255,0.12)', border: '1px solid rgba(108,99,255,0.3)', marginBottom: 28 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-success)', animation: 'pulseGlow 2s infinite' }} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--color-primary)' }}>
                            DECENTRALIZED · FEDERATED · OPEN
                        </span>
                    </div>

                    <h1 className="animate-fadeInUp delay-100" style={{ marginBottom: 24 }}>
                        The AI Marketplace Where{' '}
                        <span className="text-gradient">Data Stays Local</span>
                    </h1>

                    <p className="animate-fadeInUp delay-200" style={{ fontSize: 'clamp(1rem, 2vw, 1.2rem)', lineHeight: 1.7, marginBottom: 40, maxWidth: 580, margin: '0 auto 40px' }}>
                        ModelMesh lets you publish, discover, and collaboratively fine-tune machine learning models
                        €” without ever uploading your raw training data to a server.
                    </p>

                    <div className="animate-fadeInUp delay-300" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link to="/marketplace" className="btn btn-primary" style={{ padding: '13px 30px', fontSize: '0.95rem' }}>
                            Explore Marketplace <ArrowRight size={16} />
                        </Link>
                        <Link to="/dashboard" className="btn btn-secondary" style={{ padding: '13px 30px', fontSize: '0.95rem' }}>
                            <Brain size={16} /> Start Training
                        </Link>
                    </div>
                </div>
            </section>

            {/* ”€”€ Stats Bar ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€ */}
            <section style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="container" style={{ padding: '28px var(--space-xl)' }}>
                    <div className="grid-4">
                        {STATS.map(({ value, label }) => (
                            <div key={label} style={{ textAlign: 'center' }}>
                                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.6rem', background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                                    {value}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ”€”€ Features ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€ */}
            <section className="section">
                <div className="container">
                    <div className="text-center" style={{ marginBottom: 48 }}>
                        <h2>Built for <span className="text-gradient">Privacy-first</span> AI</h2>
                        <p style={{ fontSize: '1.05rem', marginTop: 12, maxWidth: 500, margin: '12px auto 0' }}>
                            Every feature is designed with "data stays local" as the first principle.
                        </p>
                    </div>
                    <div className="grid-3">
                        {FEATURES.map(({ icon, color, title, desc }, i) => (
                            <div key={title} className={`glass-card animate-fadeInUp delay-${(i%4 + 1)*100}`} style={{ padding: 'var(--space-lg)' }}>
                                <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: `${color}15`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, marginBottom: 16 }}>
                                    {icon}
                                </div>
                                <h4 style={{ marginBottom: 8 }}>{title}</h4>
                                <p style={{ fontSize: '0.85rem', lineHeight: 1.7 }}>{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ”€”€ CTA ”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€”€ */}
            <section style={{ padding: 'var(--space-2xl) 0', background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(108,99,255,0.12) 0%, transparent 70%)' }}>
                <div className="container text-center">
                    <h2 style={{ marginBottom: 16 }}>Ready to train <span className="text-gradient">without limits?</span></h2>
                    <p style={{ marginBottom: 36, fontSize: '1rem' }}>Link a local folder, join a session, and contribute to federated training in minutes.</p>
                    <Link to="/marketplace" className="btn btn-primary" style={{ padding: '14px 36px', fontSize: '1rem' }}>
                        Browse Marketplace <ArrowRight size={16} />
                    </Link>
                </div>
            </section>
        </main>
    );
}
