import { Link } from 'react-router-dom';
import { Download, GitBranch, ExternalLink, Cpu } from 'lucide-react';

const ARCH_COLORS={
    ResNet18: '#6c63ff', ResNet50: '#6c63ff',
    DistilBERT: '#00d4ff', BERT: '#00d4ff',
    'ViT-B/16': '#ff6b9d',
    MobileNetV3: '#00e5a0', 'EfficientNet-B0': '#00e5a0',
    Custom: '#ffb547',
};

export default function ModelCard({ model, style={}, className='' }) {
    const archColor=ARCH_COLORS[model.architecture_type] || '#6c63ff';
    const cidShort=model.current_version_cid
        ? `${model.current_version_cid.slice(0, 8)}…${model.current_version_cid.slice(-4)}`
        : null;
    const isBaseModel = model.tags?.includes('base-model');

    const cardContent = (
        <>
            {/* Arch badge + CID */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <span className="badge" style={{ background: `${archColor}20`, color: archColor, borderColor: `${archColor}40` }}>
                    <Cpu size={10} />
                    {model.architecture_type}
                </span>
                {cidShort && (
                    <span className="text-mono" style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.04)', padding: '3px 8px', borderRadius: 6, border: '1px solid var(--color-border)' }}>
                        {cidShort}
                    </span>
                )}
            </div>

            {/* Name */}
            <h4 style={{ fontSize: '1rem', marginBottom: 8, color: 'var(--color-text-primary)' }}>{model.name}</h4>

            {/* Description */}
            <p style={{ fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--color-text-muted)', flex: 1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {model.description || 'No description provided.'}
            </p>

            {/* Tags */}
            {model.tags?.length>0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                    {model.tags.slice(0, 3).map((tag) => (
                        <span key={tag} style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                            #{tag}
                        </span>
                    ))}
                </div>
            )}

            <div className="divider" style={{ margin: '14px 0 10px' }} />

            {/* Meta row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#fff', fontWeight: 700 }}>
                        {model.owner_username?.[0]?.toUpperCase()}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{model.owner_username}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Download size={11} /> {model.download_count}
                    </span>
                    {model.current_version_cid && (
                        <a
                            href={`https://gateway.pinata.cloud/ipfs/${model.current_version_cid}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-secondary)', textDecoration: 'none' }}
                        >
                            <ExternalLink size={11} /> IPFS
                        </a>
                    )}
                </div>
            </div>
        </>
    );

    const sharedStyle = {
        display: 'flex', flexDirection: 'column',
        padding: 'var(--space-lg)',
        textDecoration: 'none',
        ...style,
    };

    if (isBaseModel) {
        return (
            <div className={`glass-card ${className}`} style={{ ...sharedStyle, cursor: 'default' }}>
                {cardContent}
            </div>
        );
    }

    return (
        <Link
            to={`/models/${model.id}`}
            className={`glass-card ${className}`}
            style={{ ...sharedStyle, cursor: 'pointer' }}
        >
            {cardContent}
        </Link>
    );
}