import { Link } from 'react-router-dom';
import { Brain } from 'lucide-react';

export default function Footer() {
    return (
        <footer style={{
            borderTop: '1px solid var(--color-border)',
            background: 'rgba(7,7,26,0.9)',
            padding: '40px 0 28px',
            marginTop: 'auto',
        }}>
            <div className="container">
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 'var(--space-2xl)' }}>
                    {/* Brand */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Brain size={16} color="#fff" />
                            </div>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                                ModelMesh
                            </span>
                        </div>
                        <p style={{ fontSize: '0.85rem', lineHeight: 1.7, maxWidth: 260 }}>
                            Decentralized AI model marketplace. Data stays local. Intelligence is shared.
                        </p>
                    </div>

                    {/* Platform links */}
                    <div>
                        <h4 style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 16 }}>
                            Platform
                        </h4>
                        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { label: 'Marketplace', to: '/marketplace' },
                                { label: 'Dashboard', to: '/dashboard' },
                                { label: 'API Docs', to: 'http://localhost:8000/docs', external: true },
                            ].map(({ label, to, external }) => (
                                <li key={label}>
                                    {external ? (
                                        <a href={to} target="_blank" rel="noreferrer"
                                            style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', textDecoration: 'none' }}
                                            onMouseEnter={e => e.currentTarget.style.color='var(--color-primary)'}
                                            onMouseLeave={e => e.currentTarget.style.color='var(--color-text-secondary)'}>
                                            {label}
                                        </a>
                                    ) : (
                                        <Link to={to}
                                            style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', textDecoration: 'none' }}
                                            onMouseEnter={e => e.currentTarget.style.color='var(--color-primary)'}
                                            onMouseLeave={e => e.currentTarget.style.color='var(--color-text-secondary)'}>
                                            {label}
                                        </Link>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Technology */}
                    <div>
                        <h4 style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 16 }}>
                            Technology
                        </h4>
                        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {['Federated Learning', 'IPFS Storage', 'Flower Framework', 'MongoDB'].map(item => (
                                <li key={item} style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>{item}</li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div style={{ marginTop: 36, paddingTop: 20, borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                        ModelMesh · Built with Federated Learning ðŸŒ¸ &amp; IPFS ðŸ“¦
                    </p>
                </div>
            </div>
        </footer>
    );
}
