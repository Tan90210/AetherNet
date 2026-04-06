import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import Modal from './Modal.jsx';
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AuthModal({ isOpen, onClose, initialMode='login' }) {
    const { login, register }=useAuth();
    const [mode, setMode]=useState(initialMode);
    const [loading, setLoading]=useState(false);
    const [showPwd, setShowPwd]=useState(false);

    const [form, setForm]=useState({ username: '', email: '', password: '' });
    const set=(k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const handleSubmit=async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (mode=== 'login') {
                await login(form.email, form.password);
            } else {
                if (form.password.length<8) {
                    toast.error('Password must be at least 8 characters.');
                    return;
                }
                await register(form.username, form.email, form.password);
            }
            onClose();
        } catch (err) {
            const msg=err.response?.data?.detail || 'Something went wrong.';
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={mode=== 'login' ? 'Welcome back' : 'Create account'}>
            {/* Mode Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                {['login', 'register'].map((m) => (
                    <button
                        key={m}
                        onClick={() => setMode(m)}
                        style={{
                            flex: 1,
                            padding: '8px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid',
                            borderColor: mode=== m ? 'var(--color-primary)' : 'var(--color-border)',
                            background: mode=== m ? 'rgba(108,99,255,0.15)' : 'transparent',
                            color: mode=== m ? 'var(--color-primary)' : 'var(--color-text-muted)',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            textTransform: 'capitalize',
                        }}
                    >
                        {m=== 'login' ? 'Sign In' : 'Register'}
                    </button>
                ))}
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {mode=== 'register' && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Username</label>
                        <div style={{ position: 'relative' }}>
                            <User size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                            <input
                                className="form-input"
                                style={{ paddingLeft: 40 }}
                                placeholder="your_username"
                                value={form.username}
                                onChange={set('username')}
                                required
                                minLength={3}
                            />
                        </div>
                    </div>
                )}

                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Email</label>
                    <div style={{ position: 'relative' }}>
                        <Mail size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input
                            type="email"
                            className="form-input"
                            style={{ paddingLeft: 40 }}
                            placeholder="you@example.com"
                            value={form.email}
                            onChange={set('email')}
                            required
                        />
                    </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Password</label>
                    <div style={{ position: 'relative' }}>
                        <Lock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                        <input
                            type={showPwd ? 'text' : 'password'}
                            className="form-input"
                            style={{ paddingLeft: 40, paddingRight: 44 }}
                            placeholder="€¢€¢€¢€¢€¢€¢€¢€¢"
                            value={form.password}
                            onChange={set('password')}
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPwd(!showPwd)}
                            style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
                        >
                            {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                    </div>
                </div>

                <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 8 }}>
                    {loading ? <span className="spinner" /> : null}
                    {mode=== 'login' ? 'Sign In' : 'Create Account'}
                </button>
            </form>
        </Modal>
    );
}
