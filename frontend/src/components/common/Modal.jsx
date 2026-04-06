import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children, maxWidth='480px' }) {
    const overlayRef=useRef(null);

    useEffect(() => {
        if (!isOpen) return;
        const handler=(e) => { if (e.key=== 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        document.body.style.overflow='hidden';
        return () => {
            document.removeEventListener('keydown', handler);
            document.body.style.overflow='';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            ref={overlayRef}
            onClick={(e) => { if (e.target=== overlayRef.current) onClose(); }}
            style={{
                position: 'fixed', inset: 0, zIndex: 2000,
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '20px',
                overflowY: 'auto',
                animation: 'fadeIn 0.2s ease both',
            }}
        >
            <div
                style={{
                    width: '100%', maxWidth,
                    maxHeight: 'calc(100vh - 40px)',
                    background: 'linear-gradient(135deg, rgba(13,13,43,0.98) 0%, rgba(7,7,26,0.98) 100%)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-xl)',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
                    animation: 'scaleIn 0.25s ease both',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '24px 24px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(8, 8, 28, 0.8)',
                    backdropFilter: 'blur(6px)',
                }}>
                    <h3 style={{ fontSize: '1.25rem', margin: 0 }}>{title}</h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-border)',
                            color: 'var(--color-text-secondary)', borderRadius: 'var(--radius-md)',
                            width: 32, height: 32, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s',
                        }}
                    >
                        <X size={15} />
                    </button>
                </div>
                <div style={{ padding: '16px 24px 24px', overflowY: 'auto' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}
