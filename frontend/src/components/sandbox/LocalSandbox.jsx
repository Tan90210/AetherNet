import { useState } from 'react';
import useLocalFS from '../../hooks/useLocalFS.js';
import { FolderOpen, ShieldCheck, Files, Scan, RefreshCw, HardDrive } from 'lucide-react';

const formatBytes=(bytes) => {
    if (bytes=== 0) return '0 B';
    const k=1024;
    const sizes=['B', 'KB', 'MB', 'GB'];
    const i=Math.floor(Math.log(bytes)/Math.log(k));
    return `${parseFloat((bytes/Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export default function LocalSandbox() {
    const {
        folderName, files, scanning, dataShape, shapeError,
        totalBytes, linkAndScan, verifyAndReport, reset,
    }=useLocalFS();

    const [verifying, setVerifying]=useState(false);
    const isLinked=!!folderName;

    const handleVerify=async () => {
        setVerifying(true);
        await verifyAndReport();
        setVerifying(false);
    };

    return (
        <div className="glass-card" style={{ padding: 'var(--space-xl)', position: 'relative', overflow: 'hidden' }}>
            {/* Background glow */}
            <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(108,99,255,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: 4 }}>
                        <FolderOpen size={18} style={{ display: 'inline', marginRight: 8, color: 'var(--color-primary)', verticalAlign: 'middle' }} />
                        Local Sandbox
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        Your data never leaves this device.
                    </p>
                </div>

                {/* Zero-upload privacy badge */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)',
                    padding: '6px 12px', borderRadius: 'var(--radius-full)',
                }}>
                    <ShieldCheck size={13} color="var(--color-success)" />
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-success)', letterSpacing: '0.04em' }}>
                        0 bytes uploaded to server
                    </span>
                </div>
            </div>

            {!isLinked ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0', gap: 16 }}>
                    <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-lg)', background: 'rgba(108,99,255,0.12)', border: '1.5px dashed rgba(108,99,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FolderOpen size={28} color="var(--color-primary)" style={{ opacity: 0.8 }} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ fontWeight: 600, marginBottom: 4 }}>Link a local folder</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', maxWidth: 300 }}>
                            Select your dataset folder. Files are scanned locally â€” nothing is uploaded.
                        </p>
                    </div>
                    <button className="btn btn-primary" onClick={linkAndScan}>
                        <FolderOpen size={15} />
                        Link Folder
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Folder info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(108,99,255,0.08)', border: '1px solid rgba(108,99,255,0.2)', borderRadius: 'var(--radius-md)' }}>
                        <FolderOpen size={18} color="var(--color-primary)" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                ðŸ“ {folderName}
                            </div>
                            <div style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                                Linked locally â€” 0 bytes sent to server
                            </div>
                        </div>
                        <button onClick={reset} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: 4 }}>
                            <RefreshCw size={14} />
                        </button>
                    </div>

                    {/* Stats grid */}
                    <div className="grid-3" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        {[
                            { label: 'Files Found', value: files.length, icon: <Files size={14} />, color: 'var(--color-primary)' },
                            { label: 'Local Size', value: formatBytes(totalBytes), icon: <HardDrive size={14} />, color: 'var(--color-secondary)' },
                            { label: 'Uploaded', value: '0 bytes', icon: <ShieldCheck size={14} />, color: 'var(--color-success)' },
                        ].map(({ label, value, icon, color }) => (
                            <div key={label} style={{ textAlign: 'center', padding: '14px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                                <div style={{ color, marginBottom: 6, display: 'flex', justifyContent: 'center' }}>{icon}</div>
                                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-primary)' }}>{value}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Shape detection */}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <button className="btn btn-secondary btn-sm" onClick={handleVerify} disabled={verifying || files.length=== 0}>
                            {verifying ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Scan size={13} />}
                            Verify Image Shapes
                        </button>
                        {dataShape && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)', padding: '5px 12px', borderRadius: 'var(--radius-full)' }}>
                                <ShieldCheck size={12} color="var(--color-success)" />
                                <span className="text-mono" style={{ fontSize: '0.75rem', color: 'var(--color-success)', fontWeight: 600 }}>
                                    Shape: [{dataShape.join(', ')}] âœ“
                                </span>
                            </div>
                        )}
                        {shapeError && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>âš  {shapeError}</span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                                    Tip: Ensure your folder has subdirectories for each class, e.g. <code>dataset/class_a/img1.jpg</code>.
                                </span>
                            </div>
                        )}
                    </div>

                    {/* File list preview */}
                    {files.length>0 && (
                        <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {files.slice(0, 30).map((f, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', borderRadius: 6, background: i%2=== 0 ? 'rgba(255,255,255,0.02)' : 'transparent', fontSize: '0.75rem' }}>
                                    <span style={{ color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{f.name}</span>
                                    <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>{formatBytes(f.size)}</span>
                                </div>
                            ))}
                            {files.length>30 && <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '4px 0' }}>+{files.length - 30} more filesâ€¦</div>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
